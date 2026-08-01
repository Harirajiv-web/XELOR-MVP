import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { AssetService } from "./asset.service.js";
import { RequestService } from "./request.service.js";
import { MwoService } from "./mwo.service.js";
import { SparesService } from "./spares.service.js";
import { DowntimeService } from "./downtime.service.js";
import { PmService } from "./pm.service.js";
import { KpiService } from "./kpi.service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const assetSchema = z.object({
  assetCode: z.string().min(1),
  name: z.string().min(1),
  assetType: z.enum(["plant", "area", "machine", "component"]),
  parentAssetCode: z.string().optional(),
  criticality: z.enum(["A", "B", "C"]).optional(),
  criticalityReason: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNo: z.string().optional(),
  commissionedOn: z.string().regex(DATE).optional(),
  locationRef: z.string().uuid().optional(),
  costCentreRef: z.string().optional(),
  workCenterRef: z.string().uuid().optional(),
  warrantyEndDate: z.string().regex(DATE).optional(),
  statutoryClass: z.enum(["none", "hoist_lift_s28", "lifting_tackle_s29", "pressure_plant_s31", "other"]).optional(),
  competentPersonRef: z.string().uuid().optional(),
});

const readingSchema = z.object({
  meterType: z.enum(["run_hours", "cycles", "strokes", "km", "kwh"]),
  readingValue: z.number().nonnegative(),
  readingAt: z.string().min(1),
  source: z.enum(["manual", "event", "estimated"]).optional(),
  isCorrection: z.boolean().optional(),
  correctionReason: z.string().optional(),
});

const requestSchema = z.object({
  assetCode: z.string().min(1),
  severity: z.enum(["stopped", "degraded", "cosmetic"]),
  symptomCode: z.string().min(1),
  detail: z.string().optional(),
  lineStopped: z.boolean().optional(),
  photoKeys: z.array(z.string()).optional(),
  requestedByRef: z.string().uuid(),
  occurredAt: z.string().optional(),
});

const triageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create_mwo"),
    mwoType: z.enum(["breakdown", "corrective"]).optional(),
    title: z.string().optional(),
    primaryTechRef: z.string().uuid().optional(),
  }),
  z.object({ kind: z.literal("merge_into_mwo"), mwoNo: z.string().min(1) }),
  z.object({ kind: z.literal("convert_to_pm"), pmsCode: z.string().min(1) }),
  z.object({
    kind: z.literal("reject"),
    reason: z.string().min(1),
    downtimeDisposition: z.enum(["keep", "correct"]),
    correctionNote: z.string().optional(),
  }),
]);

const completeSchema = z.object({
  failureModeCode: z.string().optional(),
  failureCauseCode: z.string().optional(),
  detectionCode: z.string().optional(),
  failedComponentCode: z.string().optional(),
  competentPersonRef: z.string().uuid().optional(),
  closureThreshold: z.number().positive().optional(),
  at: z.string().optional(),
});

const startMwoSchema = z.object({
  employeeRef: z.string().uuid(),
  at: z.string().min(1).optional(),
});

const mwoTaskSchema = z.object({
  instruction: z.string().min(1),
  isMandatory: z.boolean().optional(),
  resultType: z.enum(["ok_not_ok", "numeric", "text", "photo"]).optional(),
  expectedMin: z.number().optional(),
  expectedMax: z.number().optional(),
  uom: z.string().min(1).optional(),
  safetyNote: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.resultType === "numeric" && value.expectedMin != null && value.expectedMax != null && value.expectedMin > value.expectedMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedMin"], message: "must not exceed expectedMax" });
  }
});

const mwoTaskResultSchema = z.object({ value: z.string().min(1) });

const spareIssueSchema = z.object({ qty: z.number().positive(), warehouseRef: z.string().uuid() });

const downtimeStartSchema = z.object({
  assetCode: z.string().min(1),
  startedAt: z.string().min(1),
  /** Present only when recording a stop that is already over (see StartDowntimeInput). */
  endedAt: z.string().optional(),
  kind: z.enum(["unplanned", "planned"]).optional(),
  productionImpacting: z.boolean().optional(),
  reasonCode: z.string().optional(),
});

const kpiQuerySchema = z.object({
  scopeType: z.enum(["asset", "area", "plant", "tenant"]).default("asset"),
  scopeCode: z.string().optional(),
  from: z.string().regex(DATE),
  to: z.string().regex(DATE),
  // Optional in the request, NULL in the computation. A missing shift calendar makes
  // availability unanswerable, and the tile says so rather than assuming 24x7.
  scheduledHours: z.coerce.number().optional(),
});

/** The KPI request, with the scope defaulted and the calendar made explicitly absent. */
function toKpiRequest(q: z.infer<typeof kpiQuerySchema>) {
  return {
    scopeType: q.scopeType,
    ...(q.scopeCode ? { scopeCode: q.scopeCode } : {}),
    from: q.from,
    to: q.to,
    scheduledHours: q.scheduledHours ?? null,
  };
}

// Typed on the schema's OUTPUT, not its input: with `.default()` in play those differ, and
// inferring the input type is what makes a defaulted field look optional downstream.
function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw Errors.validation(r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }
  return r.data;
}
function requireKey(key?: string): string {
  if (!key) throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
  return key;
}

/**
 * MAINTENANCE / CMMS (§10). Base path `/api/v1/maintenance`.
 *
 * Note the route names, which are the boundary made visible: `/work-orders` here is the
 * MAINTENANCE work order. Production's manufacturing order lives under
 * `/api/v1/production` and shares nothing with it — not a table, not a series, not a
 * permission (`mnt.*` here, `prod.*` there).
 *
 * Two absences are deliberate. There is no endpoint that writes stock — a spare issue
 * calls Inventory and mirrors what comes back. And there is no endpoint that edits a
 * downtime interval's endpoints without a reason; a correction is its own verb, needs its
 * own permission, and retains the original values.
 */
@Controller("maintenance")
export class MaintenanceController {
  constructor(
    private readonly assets: AssetService,
    private readonly requests: RequestService,
    private readonly mwos: MwoService,
    private readonly spares: SparesService,
    private readonly downtime: DowntimeService,
    private readonly pm: PmService,
    private readonly kpi: KpiService,
  ) {}

  /* ------------------------------- assets --------------------------------- */

  @Get("assets")
  @RequirePermission("mnt.asset.read")
  listAssets(@Query("criticality") criticality?: string, @Query("statutoryClass") statutoryClass?: string, @Query("areaPath") areaPath?: string) {
    return this.assets.list({ criticality, statutoryClass, areaPath });
  }

  @Post("assets")
  @RequirePermission("mnt.asset.write")
  createAsset(@Body() body: unknown) {
    return this.assets.create(parse(assetSchema, body));
  }

  @Get("assets/:code")
  @RequirePermission("mnt.asset.read")
  getAsset(@Param("code") code: string) {
    return this.assets.get(code);
  }

  @Get("assets/:code/history")
  @RequirePermission("mnt.asset.read")
  assetHistory(@Param("code") code: string, @Query("from") from: string, @Query("to") to: string) {
    return this.assets.history(code, { from, to });
  }

  @Post("assets/:code/link-work-center")
  @RequirePermission("mnt.asset.write")
  linkWorkCenter(@Param("code") code: string, @Body() body: { workCenterRef: string }) {
    return this.assets.linkWorkCenter(code, body.workCenterRef);
  }

  @Post("assets/:code/move")
  @RequirePermission("mnt.asset.write")
  moveAsset(@Param("code") code: string, @Body() body: { parentAssetCode: string; reason: string }) {
    return this.assets.move(code, body.parentAssetCode, body.reason);
  }

  @Post("assets/:code/decommission")
  @RequirePermission("mnt.asset.write")
  decommission(@Param("code") code: string, @Body() body: { reason: string }) {
    return this.assets.decommission(code, body.reason);
  }

  @Post("assets/:code/readings")
  @RequirePermission("mnt.meter.write")
  addReading(@Param("code") code: string, @Body() body: unknown) {
    const input = parse(readingSchema, body);
    return this.assets.addReading({ assetCode: code, ...input });
  }

  /* ------------------------------ requests -------------------------------- */

  @Post("requests")
  @RequirePermission("mnt.request.create")
  submitRequest(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    return this.requests.submit({ ...parse(requestSchema, body), idempotencyKey: requireKey(key) });
  }

  @Get("requests")
  @RequirePermission("mnt.request.read")
  queue(@Query("state") state?: "untriaged" | "all") {
    return this.requests.queue(state ?? "untriaged");
  }

  @Post("requests/:no/acknowledge")
  @RequirePermission("mnt.request.triage")
  acknowledge(@Param("no") no: string) {
    return this.requests.acknowledge(no);
  }

  @Post("requests/:no/triage")
  @RequirePermission("mnt.request.triage")
  triage(@Param("no") no: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    return this.requests.triage(no, parse(triageSchema, body), requireKey(key));
  }

  /* ---------------------------- work orders ------------------------------- */

  @Get("work-orders")
  @RequirePermission("mnt.mwo.read")
  board(@Query("assignee") assignee?: string, @Query("status") status?: string) {
    return this.mwos.board({ assignee, status: status ? status.split(",") : undefined });
  }

  @Get("work-orders/:no")
  @RequirePermission("mnt.mwo.read")
  getMwo(@Param("no") no: string) {
    return this.mwos.get(no);
  }

  @Post("work-orders/:no/assign")
  @RequirePermission("mnt.mwo.write")
  assign(@Param("no") no: string, @Body() body: { primaryTechRef: string }) {
    return this.mwos.assign(no, body.primaryTechRef);
  }

  @Post("work-orders/:no/priority")
  @RequirePermission("mnt.mwo.prioritise")
  prioritise(@Param("no") no: string, @Body() body: { priority: string; reason: string }) {
    return this.mwos.setPriority(no, body.priority, body.reason);
  }

  @Post("work-orders/:no/start")
  @RequirePermission("mnt.mwo.execute")
  start(@Param("no") no: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const input = parse(startMwoSchema, body);
    return this.mwos.start(no, input.employeeRef, input.at, requireKey(key));
  }

  @Post("work-orders/:no/hold")
  @RequirePermission("mnt.mwo.execute")
  hold(@Param("no") no: string, @Body() body: { reason: "awaiting_spare" | "awaiting_vendor" | "awaiting_production_window" | "awaiting_permit" | "other"; note?: string }) {
    return this.mwos.hold(no, body.reason, body.note);
  }

  @Post("work-orders/:no/resume")
  @RequirePermission("mnt.mwo.execute")
  resume(@Param("no") no: string, @Body() body: { employeeRef: string }) {
    return this.mwos.resume(no, body.employeeRef);
  }

  /** The handover moment — before the paperwork, which is when the machine actually
   *  goes back to production. */
  @Post("work-orders/:no/handback")
  @RequirePermission("mnt.mwo.execute")
  handback(@Param("no") no: string, @Body() body: { at?: string }, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.mwos.handback(no, body.at);
  }

  @Post("work-orders/:no/labour/stop")
  @RequirePermission("mnt.labour.write")
  stopLabour(@Param("no") no: string, @Body() body: { employeeRef: string; at?: string }) {
    return this.mwos.stopLabour(no, body.employeeRef, body.at);
  }

  @Post("work-orders/:no/labour")
  @RequirePermission("mnt.labour.write")
  addLabour(
    @Param("no") no: string,
    @Body() body: { employeeRef: string; startedAt: string; endedAt: string; workType?: string; backdateReason?: string; note?: string },
  ) {
    return this.mwos.addLabour(no, body);
  }

  @Post("work-orders/:no/tasks")
  @RequirePermission("mnt.mwo.write")
  addTask(@Param("no") no: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    return this.mwos.addTask(no, parse(mwoTaskSchema, body), requireKey(key));
  }

  @Patch("work-orders/:no/tasks/:seq")
  @RequirePermission("mnt.mwo.execute")
  recordTask(@Param("no") no: string, @Param("seq") seq: string, @Body() body: unknown) {
    const parsedSequence = z.coerce.number().int().positive().safeParse(seq);
    if (!parsedSequence.success) {
      throw Errors.validation([{ field: "seq", message: "must be a positive task sequence" }]);
    }
    const input = parse(mwoTaskResultSchema, body);
    return this.mwos.recordTaskResult(no, parsedSequence.data, input.value);
  }

  @Post("work-orders/:no/complete")
  @RequirePermission("mnt.mwo.execute")
  complete(@Param("no") no: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.mwos.complete(no, parse(completeSchema, body));
  }

  @Post("work-orders/:no/close")
  @RequirePermission("mnt.mwo.close")
  close(@Param("no") no: string, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.mwos.close(no);
  }

  @Post("work-orders/:no/cancel")
  @RequirePermission("mnt.mwo.write")
  cancel(@Param("no") no: string, @Body() body: { reason: string }, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.mwos.cancel(no, body.reason);
  }

  @Post("work-orders/:no/safety-flag")
  @RequirePermission("mnt.mwo.write")
  safetyFlag(@Param("no") no: string, @Body() body: { note: string }) {
    return this.mwos.flagSafety(no, body.note);
  }

  @Post("work-orders/:no/recompute-cost")
  @RequirePermission("mnt.mwo.write")
  recomputeCost(@Param("no") no: string, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.mwos.recomputeCost(no);
  }

  @Post("work-orders/:no/external-work")
  @RequirePermission("mnt.external.request")
  externalWork(@Param("no") no: string, @Body() body: { estimatedAmount: number; description: string; vendorRef?: string }, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.mwos.requestExternalWork(no, body);
  }

  /* -------------------------------- spares -------------------------------- */

  @Post("work-orders/:no/spares")
  @RequirePermission("mnt.spare.read")
  planSpare(@Param("no") no: string, @Body() body: { itemCode: string; qty: number; warehouseRef?: string }) {
    return this.spares.plan(no, body);
  }

  @Post("work-orders/:no/spares/:id/issue")
  @RequirePermission("mnt.spare.issue")
  issueSpare(@Param("no") no: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    return this.spares.issue(no, id, { ...parse(spareIssueSchema, body), idempotencyKey: requireKey(key) });
  }

  @Post("work-orders/:no/spares/:id/return")
  @RequirePermission("mnt.spare.issue")
  returnSpare(@Param("no") no: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.spares.returnSpare(no, id, parse(spareIssueSchema, body));
  }

  /* ------------------------------- downtime ------------------------------- */

  @Get("downtime")
  @RequirePermission("mnt.downtime.read")
  async listDowntime(@Query("assetCode") assetCode?: string, @Query("from") from?: string, @Query("to") to?: string, @Query("open") open?: string) {
    const assetId = assetCode ? (await this.assets.get(assetCode)).id : undefined;
    return this.downtime.list({ assetId, from, to, openOnly: open === "true" });
  }

  @Post("downtime/start")
  @RequirePermission("mnt.downtime.adjust")
  async startDowntime(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const input = parse(downtimeStartSchema, body);
    const asset = await this.assets.get(input.assetCode);
    return this.downtime.start({
      assetId: asset.id,
      startedAt: input.startedAt,
      ...(input.endedAt ? { endedAt: input.endedAt } : {}),
      kind: input.kind,
      productionImpacting: input.productionImpacting,
      reasonCode: input.reasonCode,
      source: "manual",
      idempotencyKey: requireKey(key),
    });
  }

  @Post("downtime/:id/end")
  @RequirePermission("mnt.downtime.adjust")
  endDowntime(@Param("id") id: string, @Body() body: { endedAt: string }, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.downtime.end(id, body.endedAt);
  }

  /** Correction is separately permissioned and always reasoned — it is one of the two
   *  levers that could quietly flatter the reliability numbers. */
  @Patch("downtime/:id")
  @RequirePermission("mnt.downtime.adjust")
  correctDowntime(@Param("id") id: string, @Body() body: { startedAt?: string; endedAt?: string; reason: string }) {
    if (!body.reason) throw Errors.validation([{ field: "reason", message: "a downtime correction must say why" }]);
    return this.downtime.correct(id, body);
  }

  @Post("downtime/:id/dispute")
  @RequirePermission("mnt.downtime.read")
  disputeDowntime(@Param("id") id: string, @Body() body: { note: string }) {
    return this.downtime.dispute(id, body.note);
  }

  @Get("downtime/watchdog")
  @RequirePermission("mnt.downtime.read")
  watchdog() {
    return this.downtime.staleOpenIntervals();
  }

  /* -------------------------------- PM ------------------------------------ */

  @Post("pm-schedules/generate")
  @RequirePermission("mnt.pm.write")
  generateAll(@Body() body: { today: string }, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.pm.generateAll(body.today);
  }

  @Post("pm-schedules/:code/generate")
  @RequirePermission("mnt.pm.write")
  generateOne(@Param("code") code: string, @Body() body: { today: string }, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.pm.generate(code, body.today);
  }

  @Get("pm-schedules/:code/forecast")
  @RequirePermission("mnt.pm.read")
  forecast(@Param("code") code: string, @Query("today") today: string) {
    return this.pm.forecast(code, today);
  }

  @Patch("pm-schedules/:code")
  @RequirePermission("mnt.pm.write")
  changeSchedule(@Param("code") code: string, @Body() body: { intervalValue?: number; intervalUnit?: "day" | "week" | "month" | "quarter" | "year"; driftPolicy?: "fixed" | "floating" }) {
    return this.pm.changeInterval(code, body);
  }

  @Get("pm-occurrences")
  @RequirePermission("mnt.pm.read")
  occurrences(@Query("pmsCode") pmsCode?: string, @Query("status") status?: string) {
    return this.pm.listOccurrences({ pmsCode, status: status ? status.split(",") : undefined });
  }

  @Post("pm-occurrences/:code/:seq/skip")
  @RequirePermission("mnt.pm.write")
  skip(@Param("code") code: string, @Param("seq") seq: string, @Body() body: { reason: string }) {
    return this.pm.skip(code, Number(seq), body.reason);
  }

  /* ------------------------------- reports -------------------------------- */

  @Get("reports/kpis")
  @RequirePermission("mnt.report.read")
  kpis(@Query() query: unknown) {
    return this.kpi.compute(toKpiRequest(parse(kpiQuerySchema, query)));
  }

  @Post("reports/kpis/snapshot")
  @RequirePermission("mnt.report.read")
  snapshot(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    return this.kpi.snapshot(toKpiRequest(parse(kpiQuerySchema, body)));
  }

  @Get("reports/downtime-pareto")
  @RequirePermission("mnt.report.read")
  downtimePareto(@Query() query: unknown) {
    return this.kpi.pareto(toKpiRequest(parse(kpiQuerySchema, query)));
  }

  @Get("reports/failure-pareto")
  @RequirePermission("mnt.report.read")
  failurePareto(@Query() query: unknown) {
    return this.kpi.failurePareto(toKpiRequest(parse(kpiQuerySchema, query)));
  }

  @Get("reports/statutory-register")
  @RequirePermission("mnt.statutory.read")
  statutoryRegister() {
    return this.pm.statutoryRegister();
  }

  @Get("reports/asset-summary/:code")
  @RequirePermission("mnt.report.read")
  assetSummary(@Param("code") code: string, @Query("from") from: string, @Query("to") to: string, @Query("scheduledHours") scheduledHours?: string) {
    return this.kpi.assetSummary(code, { from, to, scheduledHours: scheduledHours ? Number(scheduledHours) : null });
  }
}
