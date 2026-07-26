import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors, bucketHorizon } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { MrpService } from "./mrp.service.js";
import { DemandService } from "./demand.service.js";
import { PlanningPolicyService } from "./policy.service.js";
import { PlannedOrderService } from "./planned-order.service.js";
import { PlanExceptionService } from "./exception.service.js";
import { PlanScheduleService } from "./schedule.service.js";

const BUCKET = /^\d{4}-W\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const runSchema = z.object({
  planningDate: z.string().regex(DATE).optional(),
  horizonBuckets: z.number().int().min(1).max(104).optional(),
  skipCapacity: z.boolean().optional(),
});
const horizonQuery = z.object({
  from: z.string().regex(DATE).optional(),
  buckets: z.coerce.number().int().min(1).max(104).default(6),
});
const forecastSchema = z.object({
  itemId: z.string().uuid(),
  bucket: z.string().regex(BUCKET),
  qty: z.number().min(0),
  note: z.string().max(500).optional(),
});
const mpsSchema = z.object({
  itemId: z.string().uuid(),
  bucket: z.string().regex(BUCKET),
  qty: z.number().min(0),
  from: z.string().regex(DATE).optional(),
  buckets: z.number().int().min(1).max(104).optional(),
  hasOverrideRole: z.boolean().optional(),
  overrideReason: z.string().max(500).optional(),
});
const promiseSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  from: z.string().regex(DATE).optional(),
  buckets: z.number().int().min(1).max(104).optional(),
});
const convertSchema = z.object({ runNo: z.string().optional(), suggestedVendorRef: z.string().optional() });
const convertBulkSchema = z.object({ orderKeys: z.array(z.string()).min(1).max(500), runNo: z.string().optional() });
const cancelSchema = z.object({ reason: z.string().min(3), runNo: z.string().optional() });
const snoozeSchema = z.object({ until: z.string().regex(DATE), note: z.string().max(500).optional() });
const noteSchema = z.object({ note: z.string().max(500).optional() });
const scheduleSchema = z.object({
  runNo: z.string().optional(),
  rule: z.enum(["EDD", "SPT", "CR"]).optional(),
  hoursPerDay: z.number().min(1).max(24).optional(),
});
const safetyStockSchema = z.object({
  itemId: z.string().uuid(),
  meanDemand: z.number().min(0),
  demandStdDev: z.number().min(0),
  meanLeadTime: z.number().min(0),
  leadTimeStdDev: z.number().min(0),
  serviceLevel: z.number().gt(0).lt(1).optional(),
  historyPeriods: z.number().int().min(0).optional(),
});
const abcSchema = z.object({
  items: z.array(z.object({ itemId: z.string().uuid(), annualValue: z.number().min(0) })).min(1),
});

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}
function requireKey(key?: string): string {
  if (!key) throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
  return key;
}
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * PLANNING / MRP over HTTP.
 *
 * The read surface is deliberately larger than the write surface. Almost everything this
 * module produces is something to look at and decide about; the only writes are the run
 * itself, a forecast or MPS edit, and the two acts that turn a suggestion into a
 * commitment — firming and converting.
 */
@Controller("planning")
export class PlanningController {
  constructor(
    private readonly mrp: MrpService,
    private readonly demand: DemandService,
    private readonly policies: PlanningPolicyService,
    private readonly orders: PlannedOrderService,
    private readonly exceptions: PlanExceptionService,
    private readonly schedules: PlanScheduleService,
  ) {}

  /* --------------------------------- policy ------------------------------- */

  @Get("policies")
  @RequirePermission("planning.policy.read")
  async listPolicies() {
    return { data: await this.policies.list() };
  }

  @Post("policies/recompute-levels")
  @RequirePermission("planning.policy.manage")
  async recomputeLevels() {
    return this.policies.recomputeLowLevelCodes();
  }

  @Get("policies/conflicts")
  @RequirePermission("planning.policy.read")
  async conflicts() {
    const rows = await this.policies.conflicts();
    return {
      data: rows,
      headline:
        rows.length === 0
          ? "No policy conflicts — every item is replenished by exactly one mechanism."
          : `${rows.length} policy conflict(s). Each one orders material twice, or not at all.`,
    };
  }

  @Get("policies/where-used/:itemId")
  @RequirePermission("planning.policy.read")
  async whereUsed(@Param("itemId") itemId: string) {
    return this.policies.whereUsed(itemId);
  }

  @Post("policies/safety-stock")
  @RequirePermission("planning.policy.read")
  async safetyStock(@Body() body: unknown) {
    const p = safetyStockSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.policies.proposeSafetyStock(p.data);
  }

  @Post("policies/abc")
  @RequirePermission("planning.policy.read")
  async abc(@Body() body: unknown) {
    const p = abcSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return { data: await this.policies.abcClassification(p.data.items) };
  }

  @Get("calendar")
  @RequirePermission("planning.policy.read")
  async calendar() {
    return this.policies.calendar();
  }

  /* --------------------------------- demand ------------------------------- */

  @Get("demand")
  @RequirePermission("planning.demand.read")
  async demandGrid(@Query() query: unknown) {
    const q = horizonQuery.safeParse(query);
    if (!q.success) badRequest(q.error.issues);
    return { data: await this.demand.assemble(bucketHorizon(q.data.from ?? today(), q.data.buckets)) };
  }

  @Get("demand/consumption")
  @RequirePermission("planning.demand.read")
  async consumption(@Query() query: unknown) {
    const q = horizonQuery.safeParse(query);
    if (!q.success) badRequest(q.error.issues);
    return { data: await this.demand.consumption(bucketHorizon(q.data.from ?? today(), q.data.buckets)) };
  }

  @Post("forecast")
  @RequirePermission("planning.demand.manage")
  async setForecast(@Body() body: unknown) {
    const p = forecastSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.demand.setForecast(p.data);
  }

  /* ----------------------------------- MPS -------------------------------- */

  @Get("mps/:itemId")
  @RequirePermission("planning.mps.read")
  async mps(@Param("itemId") itemId: string, @Query() query: unknown) {
    const q = horizonQuery.safeParse(query);
    if (!q.success) badRequest(q.error.issues);
    return this.demand.mps(itemId, bucketHorizon(q.data.from ?? today(), q.data.buckets));
  }

  @Post("mps")
  @RequirePermission("planning.mps.manage")
  async setMps(@Body() body: unknown) {
    const p = mpsSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.demand.setMpsReceipt({
      ...p.data,
      buckets: bucketHorizon(p.data.from ?? today(), p.data.buckets ?? 6),
    });
  }

  /** "When can I promise twelve more?" — the sales desk's actual question. */
  @Post("mps/promise")
  @RequirePermission("planning.mps.read")
  async promise(@Body() body: unknown) {
    const p = promiseSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.demand.promise(p.data.itemId, p.data.qty, bucketHorizon(p.data.from ?? today(), p.data.buckets ?? 6));
  }

  /* ----------------------------------- MRP -------------------------------- */

  @Post("mrp/run")
  @RequirePermission("planning.mrp.run")
  async run(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    requireKey(key);
    const p = runSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.mrp.run(p.data);
  }

  @Get("mrp/runs/latest")
  @RequirePermission("planning.mrp.read")
  async latest() {
    return this.mrp.latestRun();
  }

  @Get("mrp/runs/:runNo")
  @RequirePermission("planning.mrp.read")
  async getRun(@Param("runNo") runNo: string) {
    return this.mrp.getRun(runNo);
  }

  /** The per-bucket working for one item — "why fifty?", without re-running anything. */
  @Get("mrp/runs/:runNo/explain/:itemCode")
  @RequirePermission("planning.mrp.read")
  async explain(@Param("runNo") runNo: string, @Param("itemCode") itemCode: string) {
    return this.mrp.explainItem(runNo, itemCode);
  }

  @Get("mrp/runs/:runNo/capacity")
  @RequirePermission("planning.capacity.read")
  async capacity(@Param("runNo") runNo: string) {
    return this.mrp.capacityReport(runNo);
  }

  /* ------------------------------ planned orders -------------------------- */

  @Get("planned-orders")
  @RequirePermission("planning.mrp.read")
  async listPlanned(@Query("runNo") runNo?: string, @Query("status") status?: string, @Query("sourceType") sourceType?: string, @Query("releaseBucket") releaseBucket?: string) {
    return { data: await this.orders.list({ runNo, status, sourceType, releaseBucket }) };
  }

  @Get("planned-orders/:orderKey/peg")
  @RequirePermission("planning.mrp.read")
  async peg(@Param("orderKey") orderKey: string, @Query("runNo") runNo?: string) {
    return this.orders.peg(orderKey, runNo);
  }

  @Post("planned-orders/:orderKey/firm")
  @RequirePermission("planning.order.manage")
  async firm(@Param("orderKey") orderKey: string, @Query("runNo") runNo?: string) {
    return this.orders.firm(orderKey, runNo);
  }

  @Post("planned-orders/:orderKey/convert")
  @RequirePermission("planning.order.convert")
  async convert(@Param("orderKey") orderKey: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = convertSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.orders.convert(orderKey, idk, p.data);
  }

  @Post("planned-orders/convert-bulk")
  @RequirePermission("planning.order.convert")
  async convertBulk(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = convertBulkSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.orders.convertBulk(p.data.orderKeys, idk, p.data.runNo);
  }

  @Post("planned-orders/:orderKey/cancel")
  @RequirePermission("planning.order.manage")
  async cancel(@Param("orderKey") orderKey: string, @Body() body: unknown) {
    const p = cancelSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.orders.cancel(orderKey, p.data.reason, p.data.runNo);
  }

  @Get("requisitions")
  @RequirePermission("planning.mrp.read")
  async requisitions(@Query("status") status?: string) {
    return { data: await this.orders.requisitions(status) };
  }

  /* -------------------------------- exceptions ---------------------------- */

  @Get("exceptions")
  @RequirePermission("planning.mrp.read")
  async listExceptions(
    @Query("runNo") runNo?: string,
    @Query("status") status?: string,
    @Query("severity") severity?: string,
    @Query("exceptionType") exceptionType?: string,
    @Query("itemCode") itemCode?: string,
  ) {
    return { data: await this.exceptions.list({ runNo, status, severity, exceptionType, itemCode }) };
  }

  @Get("exceptions/summary")
  @RequirePermission("planning.mrp.read")
  async exceptionSummary(@Query("runNo") runNo?: string) {
    return this.exceptions.summary(runNo);
  }

  @Post("exceptions/:id/accept")
  @RequirePermission("planning.exception.action")
  async accept(@Param("id") id: string, @Body() body: unknown) {
    const p = noteSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.exceptions.accept(id, p.data.note);
  }

  @Post("exceptions/:id/snooze")
  @RequirePermission("planning.exception.action")
  async snooze(@Param("id") id: string, @Body() body: unknown) {
    const p = snoozeSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.exceptions.snooze(id, p.data.until, p.data.note);
  }

  @Post("exceptions/:id/close")
  @RequirePermission("planning.exception.action")
  async close(@Param("id") id: string, @Body() body: unknown) {
    const p = noteSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.exceptions.close(id, p.data.note);
  }

  /* --------------------------------- schedule ----------------------------- */

  @Post("schedule/propose")
  @RequirePermission("planning.schedule.manage")
  async propose(@Body() body: unknown) {
    const p = scheduleSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.schedules.propose(p.data);
  }

  @Post("schedule/:scheduleNo/publish")
  @RequirePermission("planning.schedule.publish")
  async publish(@Param("scheduleNo") scheduleNo: string) {
    return this.schedules.publish(scheduleNo);
  }

  @Get("schedule/:scheduleNo")
  @RequirePermission("planning.schedule.read")
  async getSchedule(@Param("scheduleNo") scheduleNo: string) {
    return this.schedules.get(scheduleNo);
  }
}
