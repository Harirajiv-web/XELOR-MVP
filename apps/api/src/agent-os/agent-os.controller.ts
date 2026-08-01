import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../common/permission.guard.js";
import { AgentOsService } from "./agent-os.service.js";

const startSchema = z.object({
  graphKey: z.string().min(1).default("operations.full-command-review"),
  graphVersion: z.number().int().min(1).optional(),
  goal: z.string().min(5).max(2_000),
  input: z.record(z.unknown()).default({}),
});
const cancelSchema = z.object({ reason: z.string().min(5).max(500) });
const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().min(3).max(500),
});
const signalSchema = z.object({
  eventId: z.string().min(8).max(200),
  eventType: z.string().min(3).max(120),
  sourceDomain: z.string().min(2).max(80),
  summary: z.string().min(5).max(500),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  payload: z.record(z.unknown()).default({}),
});
const outcomeSchema = z.object({
  decisionKey: z.string().min(3).max(240),
  missionRunId: z.string().uuid().optional(),
  actionDispatchId: z.string().uuid().optional(),
  metricKey: z.string().min(2).max(120),
  label: z.string().min(3).max(200),
  unit: z.string().min(1).max(30),
  baselineValue: z.number().finite().optional(),
  targetValue: z.number().finite().optional(),
  observedValue: z.number().finite().optional(),
  estimatedValue: z.number().finite().optional(),
  verifiedValue: z.number().finite().optional(),
  verificationStatus: z.enum(["unverified", "pending", "verified", "rejected"]),
  attributionStatus: z.enum(["not_assessed", "unsupported", "partial", "supported"]),
  verificationMethod: z.string().min(3).max(500).optional(),
  evidence: z.record(z.unknown()).default({}),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw Errors.validation(
      result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

@Controller("agent-os")
export class AgentOsController {
  constructor(private readonly agentOs: AgentOsService) {}

  @Get("catalogue")
  @RequirePermission("agentos.run.read")
  catalogue() {
    return { data: this.agentOs.catalogue() };
  }

  @Get("runs")
  @RequirePermission("agentos.run.read")
  async runs(@Query("limit") rawLimit?: string) {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .catch(25)
      .parse(rawLimit);
    return { data: await this.agentOs.list(limit) };
  }

  @Get("commander")
  @RequirePermission("agentos.run.read")
  async commander() {
    return { data: await this.agentOs.commander() };
  }

  @Get("commander/risks/:riskKey")
  @RequirePermission("agentos.run.read")
  async commanderRisk(@Param("riskKey") riskKey: string) {
    return { data: await this.agentOs.commanderRisk(riskKey) };
  }

  @Post("commander/risks/:riskKey/start")
  @RequirePermission("agentos.run.operate")
  async startCommanderRisk(
    @Param("riskKey") riskKey: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return { data: await this.agentOs.startCommanderRisk(riskKey, idempotencyKey ?? "") };
  }

  @Get("commander/outcomes")
  @RequirePermission("agentos.run.read")
  async outcomes(@Query("limit") rawLimit?: string) {
    const limit = z.coerce.number().int().min(1).max(100).catch(50).parse(rawLimit);
    return { data: await this.agentOs.outcomes(limit) };
  }

  @Post("commander/outcomes")
  @RequirePermission("agentos.run.operate")
  async recordOutcome(@Body() body: unknown) {
    return { data: await this.agentOs.recordOutcome(parse(outcomeSchema, body)) };
  }

  @Get("runs/:runId")
  @RequirePermission("agentos.run.read")
  async run(@Param("runId") runId: string) {
    return { data: await this.agentOs.get(runId) };
  }

  @Post("runs")
  @RequirePermission("agentos.run.operate")
  async start(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parse(startSchema, body);
    return {
      data: await this.agentOs.start({
        graphKey: input.graphKey ?? "operations.full-command-review",
        graphVersion: input.graphVersion,
        goal: input.goal,
        missionInput: input.input ?? {},
        idempotencyKey: idempotencyKey ?? "",
      }),
    };
  }

  @Post("signals")
  @RequirePermission("agentos.run.operate")
  async signal(@Body() body: unknown) {
    const input = parse(signalSchema, body);
    return { data: await this.agentOs.ingestSignal(input) };
  }

  @Post("runs/:runId/cancel")
  @RequirePermission("agentos.run.operate")
  async cancel(@Param("runId") runId: string, @Body() body: unknown) {
    const input = parse(cancelSchema, body);
    return { data: await this.agentOs.cancel(runId, input.reason) };
  }

  @Post("runs/:runId/resume")
  @RequirePermission("agentos.run.operate")
  async resume(@Param("runId") runId: string) {
    return { data: await this.agentOs.resume(runId) };
  }

  @Get("approvals")
  @RequirePermission("agentos.approval.decide")
  async approvals() {
    return { data: await this.agentOs.approvals() };
  }

  @Get("actions")
  @RequirePermission("agentos.run.read")
  async actions(
    @Query("limit") rawLimit?: string,
    @Query("runId") runId?: string,
  ) {
    const limit = z.coerce.number().int().min(1).max(100).catch(50).parse(rawLimit);
    return { data: await this.agentOs.actions(limit, runId) };
  }

  @Post("approvals/:approvalId/decide")
  @RequirePermission("agentos.approval.decide")
  async decide(@Param("approvalId") approvalId: string, @Body() body: unknown) {
    const input = parse(decisionSchema, body);
    return {
      data: await this.agentOs.decideApproval(
        approvalId,
        input.decision,
        input.note,
      ),
    };
  }
}
