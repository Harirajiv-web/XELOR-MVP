import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { connectionCreate, importRequest, commitmentRequest, recoveryRequest, outcomeRequest, questionRequest } from "./contracts.js";
import { ConnectivityService } from "./connectivity.service.js";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.validation(result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  return result.data;
}
const identifier = (id: string) => parse(z.string().uuid(), id);
async function mutate<T>(operation: string, key: string | undefined, input: unknown, work: () => Promise<T>) {
  if (!key || key.length > 200) throw Errors.validation([{ field: "Idempotency-Key", message: "A non-empty key up to 200 characters is required" }]);
  const result = await runIdempotent(key, fingerprint({ operation, input }), async () => ({ status: 201, body: { data: await work() } }));
  return result.body;
}

@Controller("connectivity")
export class ConnectivityController {
  constructor(private readonly service: ConnectivityService) {}
  @Get("catalog") @RequirePermission("integration.connector.read")
  catalog() { return { data: this.service.catalog() }; }
  @Get("connections") @RequirePermission("integration.connector.read")
  async list() { return { data: await this.service.list() }; }
  @Post("connections") @RequirePermission("integration.flow.manage")
  async create(@Body() body: unknown, @Headers("idempotency-key") key?: string) { const input = parse(connectionCreate, body); return mutate("connectivity.create", key, input, () => this.service.create(input)); }
  @Post("connections/:id/test") @RequirePermission("integration.flow.manage")
  async test(@Param("id") id: string, @Headers("idempotency-key") key?: string) { identifier(id); return mutate("connectivity.test", key, { id }, () => this.service.test(id)); }
  @Post("connections/:id/sync") @RequirePermission("integration.flow.manage")
  async sync(@Param("id") id: string, @Headers("idempotency-key") key?: string) { identifier(id); return mutate("connectivity.sync", key, { id }, () => this.service.sync(id)); }
  @Post("connections/:id/import") @RequirePermission("integration.flow.manage")
  async import(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) { identifier(id); const input = parse(importRequest, body); return mutate("connectivity.import", key, { id, input }, () => this.service.import(id, input)); }
  @Get("connections/:id/snapshot") @RequirePermission("integration.connector.read")
  async snapshot(@Param("id") id: string) { return { data: await this.service.snapshot(identifier(id)) }; }
  @Post("connections/:id/ask") @RequirePermission("integration.connector.read")
  async ask(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) { identifier(id); const input = parse(questionRequest, body); return mutate("connectivity.ask", key, { id, ...input }, () => this.service.ask(id, input.question)); }
  @Post("decisions/commitment") @RequirePermission("integration.connector.read")
  async commitment(@Body() body: unknown, @Headers("idempotency-key") key?: string) { const input = parse(commitmentRequest, body); return mutate("connectivity.commitment", key, input, () => this.service.commitment(input)); }
  @Post("decisions/recovery") @RequirePermission("integration.connector.read")
  async recovery(@Body() body: unknown, @Headers("idempotency-key") key?: string) { const input = parse(recoveryRequest, body); return mutate("connectivity.recovery", key, input, () => this.service.recovery(input)); }
  @Get("decisions") @RequirePermission("integration.connector.read")
  async recentDecisions() { return { data: await this.service.recentDecisions() }; }
  @Post("outcomes") @RequirePermission("integration.flow.manage")
  async recordOutcome(@Body() body: unknown, @Headers("idempotency-key") key?: string) { const input = parse(outcomeRequest, body); return mutate("connectivity.outcome", key, input, () => this.service.recordOutcome(input)); }
  @Get("outcomes") @RequirePermission("integration.connector.read")
  async outcomeSummary() { return { data: await this.service.outcomeSummary() }; }
}
