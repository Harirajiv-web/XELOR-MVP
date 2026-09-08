import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { AiRegistryService } from "./registry.service.js";
import { AiPromptService } from "./prompt.service.js";
import { AiOperationsService } from "./operations.service.js";

const DATE = /^\d{4}-\d{2}-\d{2}/;
const rolloutSchema = z.object({ stage: z.enum(["off", "internal", "pilot", "general", "rolled_back"]), reason: z.string().max(500).optional() });
const killSchema = z.object({ featureKey: z.string().optional(), reason: z.string().min(5) });
const probeSchema = z.object({ refused: z.boolean().optional(), elapsedMs: z.number().int().min(0).optional() });
const routeSchema = z.object({
  featureKey: z.string().min(1),
  allowedRegions: z.array(z.string()).default([]),
  steps: z.array(z.object({
    order: z.number().int().min(1),
    kind: z.enum(["model", "deterministic"]),
    providerCode: z.string().optional(),
    modelCode: z.string().optional(),
    region: z.string().optional(),
    fallbackDescription: z.string().optional(),
  })).min(1),
});
const promptSchema = z.object({
  featureKey: z.string().min(1),
  template: z.string().min(1),
  declaredVariables: z.array(z.string()).default([]),
  outputSchema: z.string().optional(),
  changeSummary: z.string().max(500).optional(),
});
const rollbackSchema = z.object({ toVersion: z.number().int().min(1), reason: z.string().min(5) });
const preSchema = z.object({
  featureKey: z.string().min(1),
  correlationId: z.string().min(1),
  source: z.record(z.unknown()),
  allowList: z.array(z.string()).min(1),
});
const postSchema = z.object({
  featureKey: z.string().min(1),
  correlationId: z.string().min(1),
  modelInput: z.unknown(),
  modelOutput: z.unknown(),
  derivedNumbers: z.array(z.number()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  schemaValid: z.boolean(),
  docType: z.string().optional(),
  docRef: z.string().optional(),
});
const reviewSchema = z.object({
  decision: z.enum(["accepted", "corrected", "rejected"]),
  correction: z.record(z.unknown()).optional(),
  note: z.string().max(500).optional(),
});
const meterSchema = z.object({
  featureKey: z.string().min(1),
  correlationId: z.string().min(1),
  modelCode: z.string().min(1),
  providerCode: z.string().optional(),
  region: z.string().optional(),
  promptContentHash: z.string().optional(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  latencyMs: z.number().int().min(0).optional(),
  degraded: z.boolean().optional(),
  usedFallback: z.boolean().optional(),
  calledAt: z.string().optional(),
});
const budgetSchema = z.object({ dailyBudget: z.number().min(0), estimatedCost: z.number().min(0), asOf: z.string().optional() });
const driftSchema = z.object({
  featureKey: z.string().min(1),
  baselineFrom: z.string().regex(DATE), baselineTo: z.string().regex(DATE),
  currentFrom: z.string().regex(DATE), currentTo: z.string().regex(DATE),
});
const evalSchema = z.object({
  featureKey: z.string().min(1),
  datasetVersion: z.string().min(1),
  promptContentHash: z.string().optional(),
  metric: z.string().min(1),
  baselineScore: z.number(),
  candidateScore: z.number(),
  tolerance: z.number().min(0),
  mustPassFailures: z.array(z.string()).default([]),
  caseCount: z.number().int().min(0),
  failureClusters: z.array(z.object({ label: z.string(), count: z.number().int() })).optional(),
});
const incidentSchema = z.object({
  incidentNo: z.string().min(1),
  featureKey: z.string().optional(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string().min(1),
  description: z.string().min(1),
  detectedAt: z.string().min(10),
});

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}

/**
 * AI OPERATIONS over HTTP — the console for the AI itself.
 *
 * Note what has no endpoint: there is no way to force a promotion, no way to bypass a
 * guardrail, and no way for anything here to act without a person's name on it. The AI
 * cannot ship itself, and the absence of those routes is how that is enforced rather than
 * merely stated.
 */
@Controller("aiops")
export class AiOpsController {
  constructor(
    private readonly registry: AiRegistryService,
    private readonly prompts: AiPromptService,
    private readonly ops: AiOperationsService,
  ) {}

  /* -------------------------------- registry ------------------------------ */

  @Get("registry")
  @RequirePermission("aiops.registry.read")
  async listRegistry() {
    return { data: await this.registry.registry() };
  }

  @Get("providers")
  @RequirePermission("aiops.registry.read")
  async providers() {
    return { data: await this.registry.providers() };
  }

  @Post("features/:featureKey/rollout")
  @RequirePermission("aiops.rollout.manage")
  async setRollout(@Param("featureKey") featureKey: string, @Body() body: unknown) {
    const p = rolloutSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.registry.setRollout(featureKey, p.data.stage, p.data.reason);
  }

  /* ------------------------------ kill switch ----------------------------- */

  @Post("kill-switch/engage")
  @RequirePermission("aiops.killswitch.operate")
  async engage(@Body() body: unknown) {
    const p = killSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.registry.engageKillSwitch(p.data);
  }

  @Post("kill-switch/release")
  @RequirePermission("aiops.killswitch.operate")
  async release(@Query("featureKey") featureKey?: string) {
    return this.registry.releaseKillSwitch(featureKey ?? null);
  }

  /** Every registered feature's switch state, one read. Declared before the parameterised
   *  route so `/kill-switch` can never be mistaken for a feature named nothing. */
  @Get("kill-switch")
  @RequirePermission("aiops.registry.read")
  async killStates() {
    return { data: await this.registry.killSwitchStates() };
  }

  @Get("kill-switch/:featureKey")
  @RequirePermission("aiops.registry.read")
  async killState(@Param("featureKey") featureKey: string) {
    return this.registry.killSwitchState(featureKey);
  }

  /** The drill. A kill switch nobody has tried is a belief. */
  @Post("kill-switch/:featureKey/probe")
  @RequirePermission("aiops.killswitch.operate")
  async probe(@Param("featureKey") featureKey: string, @Body() body: unknown) {
    const p = probeSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.registry.probeKillSwitch(featureKey, p.data);
  }

  /* --------------------------------- routing ------------------------------ */

  @Post("routes")
  @RequirePermission("aiops.route.manage")
  async createRoute(@Body() body: unknown) {
    const p = routeSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.registry.createRoute(p.data);
  }

  @Post("routes/:featureKey/:version/activate")
  @RequirePermission("aiops.route.manage")
  async activateRoute(@Param("featureKey") featureKey: string, @Param("version") version: string) {
    return this.registry.activateRoute(featureKey, Number(version));
  }

  /** Walk the active chain against a simulated provider health map. */
  @Post("routes/:featureKey/simulate")
  @RequirePermission("aiops.registry.read")
  async simulateRoute(@Param("featureKey") featureKey: string, @Body() body: unknown) {
    const p = z.record(z.boolean()).safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.registry.simulateRoute(featureKey, p.data);
  }

  /* --------------------------------- prompts ------------------------------ */

  @Get("prompts/:featureKey")
  @RequirePermission("aiops.prompt.read")
  async versions(@Param("featureKey") featureKey: string) {
    return { data: await this.prompts.versions(featureKey) };
  }

  @Get("prompts/:featureKey/production")
  @RequirePermission("aiops.prompt.read")
  async production(@Param("featureKey") featureKey: string) {
    return this.prompts.production(featureKey);
  }

  @Post("prompts")
  @RequirePermission("aiops.prompt.author")
  async createPrompt(@Body() body: unknown) {
    const p = promptSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.prompts.create(p.data);
  }

  @Get("prompts/:featureKey/diff")
  @RequirePermission("aiops.prompt.read")
  async diff(@Param("featureKey") featureKey: string, @Query("from") from: string, @Query("to") to: string) {
    return this.prompts.diff(featureKey, Number(from), Number(to));
  }

  /** Promotion. Refused without a passing gate for THIS content and a second person. */
  @Post("prompts/:featureKey/:version/promote")
  @RequirePermission("aiops.prompt.approve")
  async promote(@Param("featureKey") featureKey: string, @Param("version") version: string) {
    return this.prompts.promote(featureKey, Number(version));
  }

  @Post("prompts/:featureKey/rollback")
  @RequirePermission("aiops.prompt.approve")
  async rollback(@Param("featureKey") featureKey: string, @Body() body: unknown) {
    const p = rollbackSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.prompts.rollback(featureKey, p.data.toVersion, p.data.reason);
  }

  /* -------------------------------- guardrails ---------------------------- */

  @Post("guardrails/pre")
  @RequirePermission("aiops.guardrail.run")
  async pre(@Body() body: unknown) {
    const p = preSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.guardPre(p.data);
  }

  @Post("guardrails/post")
  @RequirePermission("aiops.guardrail.run")
  async post(@Body() body: unknown) {
    const p = postSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.guardPost({ ...p.data, modelInput: p.data.modelInput, modelOutput: p.data.modelOutput });
  }

  /* ---------------------------------- HITL -------------------------------- */

  @Get("hitl")
  @RequirePermission("aiops.hitl.review")
  async hitl(@Query("status") status?: string) {
    return { data: await this.ops.hitlQueue(status ?? "open") };
  }

  @Post("hitl/:id/review")
  @RequirePermission("aiops.hitl.review")
  async review(@Param("id") id: string, @Body() body: unknown) {
    const p = reviewSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.reviewHitl(id, p.data);
  }

  /* ---------------------------------- cost -------------------------------- */

  @Post("metrics")
  @RequirePermission("aiops.guardrail.run")
  async meter(@Body() body: unknown) {
    const p = meterSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.meterCall(p.data);
  }

  @Post("budget/check")
  @RequirePermission("aiops.cost.read")
  async budget(@Body() body: unknown) {
    const p = budgetSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.budgetCheck(p.data);
  }

  @Get("cost")
  @RequirePermission("aiops.cost.read")
  async cost(@Query("from") from: string, @Query("to") to: string) {
    if (!from || !to) badRequest([{ path: ["from", "to"], message: "required" }]);
    return this.ops.costDashboard(from, to);
  }

  /* ---------------------------- drift and evals --------------------------- */

  @Post("drift/scan")
  @RequirePermission("aiops.cost.read")
  async drift(@Body() body: unknown) {
    const p = driftSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.driftScan(p.data);
  }

  @Post("evals")
  @RequirePermission("aiops.eval.run")
  async recordEval(@Body() body: unknown) {
    const p = evalSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.recordEvalRun(p.data);
  }

  @Get("evals")
  @RequirePermission("aiops.registry.read")
  async evals(@Query("featureKey") featureKey?: string) {
    return { data: await this.ops.evalRuns(featureKey) };
  }

  /* --------------------------- audit and evidence ------------------------- */

  /** The five-part answer to "what did the AI do with this document?". */
  @Get("explain/:correlationId")
  @RequirePermission("aiops.audit.read")
  async explain(@Param("correlationId") correlationId: string) {
    return this.ops.explainCall(correlationId);
  }

  @Get("evidence-pack")
  @RequirePermission("aiops.audit.read")
  async evidence(@Query("from") from: string, @Query("to") to: string) {
    if (!from || !to) badRequest([{ path: ["from", "to"], message: "required" }]);
    return this.ops.evidencePack(from, to);
  }

  /* -------------------------- incidents and vectors ----------------------- */

  @Post("incidents")
  @RequirePermission("aiops.killswitch.operate")
  async raise(@Body() body: unknown) {
    const p = incidentSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.raiseIncident(p.data);
  }

  @Get("incidents")
  @RequirePermission("aiops.registry.read")
  async incidents() {
    return { data: await this.ops.incidents() };
  }

  @Get("indexes")
  @RequirePermission("aiops.registry.read")
  async indexes() {
    return { data: await this.ops.indexes() };
  }

  /** The ANN leak probe: a similarity search must never reach another tenant's vectors. */
  @Post("indexes/:indexName/leak-probe")
  @RequirePermission("aiops.registry.read")
  async leakProbe(@Param("indexName") indexName: string, @Query("foreignHits") foreignHits?: string) {
    return this.ops.annLeakProbe(indexName, Number(foreignHits ?? 0));
  }
}
