import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { assertMatchingIdempotencyKey } from "../../common/idempotency-key.js";
import { PipelineService } from "./pipeline.service.js";
import { MessageService } from "./message.service.js";
import { StatutoryService } from "./statutory.service.js";
import { WebhookService } from "./webhook.service.js";
import { FactoryConnectService } from "./factory-connect.service.js";
import { MACHINE_INSPECTION_TYPES, MACHINE_STATES } from "@ind-core/platform";

const simulateSchema = z.object({
  httpStatus: z.number().int().optional(),
  timedOut: z.boolean().optional(),
  errorCode: z.string().optional(),
  message: z.string().optional(),
  retryAfterSeconds: z.number().int().optional(),
});
const dispatchSchema = z.object({
  flowCode: z.string().min(1),
  correlationId: z.string().optional(),
  entityRef: z.string().optional(),
  payload: z.unknown(),
  simulate: simulateSchema.optional(),
});
const preflightSchema = z.object({ flowCode: z.string().min(1), samples: z.array(z.unknown()).min(1).max(200) });
const pauseSchema = z.object({ reason: z.string().min(3) });
const replaySchema = z.object({ confirmStatutory: z.boolean().optional() });
const resolveSchema = z.object({ note: z.string().min(3) });
const invoiceSchema = z.object({
  invoiceRef: z.string().min(1),
  gstin: z.string().length(15),
  buyerGstin: z.string().length(15).optional(),
  shipToGstin: z.string().optional(),
  docType: z.enum(["INV", "CRN", "DBN"]).optional(),
  docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fy: z.string().min(4),
  taxableValue: z.number().min(0),
  totalValue: z.number().min(0),
  aato: z.number().min(0),
  simulate: z.object({ timedOut: z.boolean().optional(), httpStatus: z.number().int().optional(), errorCode: z.string().optional() }).optional(),
});
const cancelSchema = z.object({ reason: z.string().min(2), asOf: z.string().optional() });
const ewbSchema = z.object({
  shipmentRef: z.string().min(1),
  invoiceRef: z.string().optional(),
  irn: z.string().optional(),
  consignmentValue: z.number().min(0),
  distanceKm: z.number().int().min(0),
  vehicleNo: z.string().optional(),
  transporterGstin: z.string().optional(),
  shipToGstin: z.string().optional(),
  billToState: z.string().optional(),
  shipToState: z.string().optional(),
  portalHealth: z.object({ ewb1Healthy: z.boolean(), ewb2Healthy: z.boolean() }).optional(),
  asOf: z.string().optional(),
});
const closeSchema = z.object({ remarks: z.string().min(2) });
const subscribeSchema = z.object({ subscriberName: z.string().min(1), targetUrl: z.string().url(), eventNames: z.array(z.string().min(1)).min(1) });
const deliverSchema = z.object({
  subscriberName: z.string().min(1),
  eventName: z.string().min(1),
  payload: z.unknown(),
  secret: z.string().min(8),
  simulate: z.object({ responseCode: z.number().int() }).optional(),
  asOf: z.string().optional(),
});
const verifySchema = z.object({ payload: z.string(), header: z.string(), secret: z.string(), previousSecret: z.string().optional(), nowSeconds: z.number().int() });
const factoryIdentifier = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const factoryStateSchema = z.object({
  assetCode: factoryIdentifier, sourceEventId: factoryIdentifier, observedAt: z.string().datetime({ offset: true }),
  state: z.enum(["running", "idle", "blocked", "faulted", "protective_stop", "offline"]),
  safetyState: z.string().trim().min(1).max(64), activeProgram: factoryIdentifier.optional(), productionOrderRef: factoryIdentifier.optional(),
  materialRef: factoryIdentifier.optional(), cycleTimeSeconds: z.number().finite().min(0).optional(), goodCount: z.number().int().min(0).optional(),
  rejectCount: z.number().int().min(0).optional(), energyKwh: z.number().finite().min(0).optional(), alarmCode: factoryIdentifier.optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
}).strict();
const commandEnvelope = {
  assetCode: factoryIdentifier,
  requiredState: z.enum(MACHINE_STATES),
  approvalRef: z.string().uuid().transform((value) => value.toLowerCase()),
  idempotencyKey: z.string().trim().min(8).max(200),
  expiresAt: z.string().datetime({ offset: true }),
};
const machineCommandSchema = z.discriminatedUnion("capability", [
  z.object({
    ...commandEnvelope,
    capability: z.literal("robot.job.enqueue"),
    parameters: z.object({ jobId: factoryIdentifier, productionOrderRef: factoryIdentifier.optional() }).strict(),
  }).strict(),
  z.object({
    ...commandEnvelope,
    capability: z.literal("robot.program.select_approved"),
    parameters: z.object({ programId: factoryIdentifier, approvedRevision: factoryIdentifier }).strict(),
  }).strict(),
  z.object({
    ...commandEnvelope,
    capability: z.literal("robot.pause_after_cycle"),
    parameters: z.object({ reasonCode: factoryIdentifier }).strict(),
  }).strict(),
  z.object({
    ...commandEnvelope,
    capability: z.literal("amr.route.dispatch"),
    parameters: z.object({ routeId: factoryIdentifier, missionRef: factoryIdentifier.optional() }).strict(),
  }).strict(),
  z.object({
    ...commandEnvelope,
    capability: z.literal("quality.output.quarantine"),
    parameters: z.object({ lotRef: factoryIdentifier, reasonCode: factoryIdentifier }).strict(),
  }).strict(),
  z.object({
    ...commandEnvelope,
    capability: z.literal("maintenance.inspection.request"),
    parameters: z.object({ inspectionType: z.enum(MACHINE_INSPECTION_TYPES), reasonCode: factoryIdentifier.optional() }).strict(),
  }).strict(),
]);

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}

/**
 * INTEGRATION over HTTP.
 *
 * `simulate` appears on the write endpoints on purpose. It is the fake adapter's
 * failure-injection surface — the only way to rehearse a portal outage, a timeout that may
 * have succeeded, or a dead webhook endpoint without causing one.
 */
@Controller("integration")
export class IntegrationController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly messages: MessageService,
    private readonly statutory: StatutoryService,
    private readonly webhooks: WebhookService,
    private readonly factory: FactoryConnectService,
  ) {}

  /* -------------------------- factory connectivity ----------------------- */

  @Get("factory/overview")
  @RequirePermission("factory.connect.read")
  async factoryOverview() {
    return this.factory.overview();
  }

  @Get("factory/views/integration")
  @RequirePermission("integration.factory-connect.read")
  async integrationFactoryView() {
    return this.factory.integrationView();
  }

  @Get("factory/views/production")
  @RequirePermission("production.factory-connect.read")
  async productionFactoryView() {
    return this.factory.productionView();
  }

  @Get("factory/views/planning")
  @RequirePermission("planning.factory-flow.read")
  async planningFactoryView() {
    return this.factory.planningView();
  }

  @Post("factory/telemetry/state")
  @RequirePermission("factory.telemetry.ingest")
  async ingestFactoryState(@Body() body: unknown) {
    const parsed = factoryStateSchema.safeParse(body);
    if (!parsed.success) badRequest(parsed.error.issues);
    return this.factory.ingestState(parsed.data);
  }

  @Post("factory/commands")
  @RequirePermission("factory.command.execute")
  async requestMachineCommand(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = machineCommandSchema.safeParse(body);
    if (!parsed.success) badRequest(parsed.error.issues);
    assertMatchingIdempotencyKey(
      idempotencyKey,
      parsed.data.idempotencyKey,
      "body.idempotencyKey",
    );
    return this.factory.requestCommand(parsed.data);
  }

  @Get("factory/commands/by-approval/:approvalRef")
  @RequirePermission("factory.command.execute")
  async factoryCommandEvidence(@Param("approvalRef") approvalRef: string) {
    return this.factory.commandEvidence(approvalRef);
  }

  /* ------------------------------ configuration --------------------------- */

  @Get("connectors")
  @RequirePermission("integration.connector.read")
  async connectors() {
    return { data: await this.pipeline.connectors() };
  }

  @Get("connections")
  @RequirePermission("integration.connector.read")
  async connections() {
    return { data: await this.pipeline.connections() };
  }

  @Get("connections/:name/circuit")
  @RequirePermission("integration.connector.read")
  async circuit(@Param("name") name: string, @Query("asOf") asOf?: string) {
    return this.pipeline.circuitCheck(name, asOf);
  }

  @Post("connections/:name/outcome/:outcome")
  @RequirePermission("integration.flow.manage")
  async outcome(@Param("name") name: string, @Param("outcome") outcome: string, @Query("asOf") asOf?: string) {
    if (outcome !== "success" && outcome !== "failure") badRequest([{ path: ["outcome"], message: "success or failure" }]);
    return this.pipeline.recordOutcome(name, outcome, asOf);
  }

  @Get("flows")
  @RequirePermission("integration.flow.read")
  async flows() {
    return { data: await this.pipeline.flows() };
  }

  /** Dry-run a mapping over samples. Nothing is sent. */
  @Post("flows/preflight")
  @RequirePermission("integration.flow.read")
  async preflight(@Body() body: unknown) {
    const p = preflightSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.pipeline.preflight(p.data.flowCode, p.data.samples);
  }

  @Post("flows/:code/pause")
  @RequirePermission("integration.flow.manage")
  async pause(@Param("code") code: string, @Body() body: unknown) {
    const p = pauseSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.pipeline.pauseFlow(code, p.data.reason);
  }

  @Post("flows/:code/resume")
  @RequirePermission("integration.flow.manage")
  async resume(@Param("code") code: string) {
    return this.pipeline.resumeFlow(code);
  }

  /* --------------------------------- messages ----------------------------- */

  @Post("messages/dispatch")
  @RequirePermission("integration.message.send")
  async dispatch(@Body() body: unknown) {
    const p = dispatchSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    // z.unknown() infers an OPTIONAL property; naming it explicitly keeps the key present.
    return this.messages.dispatch({ ...p.data, payload: p.data.payload });
  }

  @Get("messages/trace/:correlationId")
  @RequirePermission("integration.message.read")
  async trace(@Param("correlationId") correlationId: string) {
    return this.messages.trace(correlationId);
  }

  @Get("dlq")
  @RequirePermission("integration.message.read")
  async dlq(@Query("status") status?: string) {
    return this.messages.dlq(status ?? "new");
  }

  @Post("dlq/:id/replay")
  @RequirePermission("integration.dlq.replay")
  async replay(@Param("id") id: string, @Body() body: unknown) {
    const p = replaySchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.messages.replay(id, p.data);
  }

  @Post("dlq/:id/resolve")
  @RequirePermission("integration.dlq.replay")
  async resolve(@Param("id") id: string, @Body() body: unknown) {
    const p = resolveSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.messages.resolve(id, p.data.note);
  }

  /* -------------------------------- statutory ----------------------------- */

  @Post("einvoice/submit")
  @RequirePermission("integration.statutory.submit")
  async submitInvoice(@Body() body: unknown) {
    const p = invoiceSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.statutory.submitInvoice(p.data);
  }

  /** The Get-before-retry step. Called after a timeout, never a blind resubmit. */
  @Post("einvoice/:invoiceRef/fetch")
  @RequirePermission("integration.statutory.submit")
  async fetchIrn(@Param("invoiceRef") invoiceRef: string) {
    return this.statutory.fetchByDocument(invoiceRef);
  }

  @Post("einvoice/:invoiceRef/cancel")
  @RequirePermission("integration.statutory.submit")
  async cancelIrn(@Param("invoiceRef") invoiceRef: string, @Body() body: unknown) {
    const p = cancelSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.statutory.cancelIrn(invoiceRef, p.data.reason, p.data.asOf);
  }

  /** Every unreported invoice against the 30-day cliff. */
  @Get("einvoice/window-watch")
  @RequirePermission("integration.statutory.read")
  async windowWatch(@Query("asOf") asOf?: string) {
    return this.statutory.windowWatch(asOf);
  }

  @Post("ewaybill/generate")
  @RequirePermission("integration.statutory.submit")
  async generateEwb(@Body() body: unknown) {
    const p = ewbSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.statutory.generateEwayBill(p.data);
  }

  @Post("ewaybill/:shipmentRef/close")
  @RequirePermission("integration.statutory.submit")
  async closeEwb(@Param("shipmentRef") shipmentRef: string, @Body() body: unknown) {
    const p = closeSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.statutory.closeEwayBill(shipmentRef, p.data.remarks);
  }

  @Get("ewaybill")
  @RequirePermission("integration.statutory.read")
  async ewbs(@Query("asOf") asOf?: string) {
    return { data: await this.statutory.ewayBills(asOf) };
  }

  /* -------------------------------- webhooks ------------------------------ */

  @Get("webhooks")
  @RequirePermission("integration.webhook.manage")
  async subscriptions() {
    return { data: await this.webhooks.subscriptions() };
  }

  @Post("webhooks")
  @RequirePermission("integration.webhook.manage")
  async subscribe(@Body() body: unknown) {
    const p = subscribeSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.webhooks.subscribe(p.data);
  }

  @Post("webhooks/deliver")
  @RequirePermission("integration.webhook.manage")
  async deliver(@Body() body: unknown) {
    const p = deliverSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.webhooks.deliver({ ...p.data, payload: p.data.payload });
  }

  /** The same verification we ask receivers to run — so they can test theirs against ours. */
  @Post("webhooks/verify")
  @RequirePermission("integration.webhook.manage")
  async verify(@Body() body: unknown) {
    const p = verifySchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.webhooks.verify(p.data);
  }

  @Post("webhooks/:name/rotate")
  @RequirePermission("integration.webhook.manage")
  async rotate(@Param("name") name: string, @Query("graceHours") graceHours?: string) {
    return this.webhooks.rotate(name, graceHours ? Number(graceHours) : 48);
  }
}
