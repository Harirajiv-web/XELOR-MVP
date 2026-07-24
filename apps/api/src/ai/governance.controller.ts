import { Body, Controller, Get, Post } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../common/permission.guard.js";
import { DbAiGovernance } from "./db.governance.js";

const killSchema = z.object({ featureKey: z.string().min(1), reason: z.string().min(1).max(500) });
const optOutSchema = z.object({ optedOut: z.boolean(), reason: z.string().min(1).max(500) });
const budgetSchema = z.object({ dailyLimit: z.number().int().nonnegative(), reason: z.string().min(1).max(500) });

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}

/**
 * Administration's AI governance console (DECISIONS-V2 §4.3). Every action requires a
 * typed reason and is audited (inside DbAiGovernance). Gated behind a single
 * permission — the AI cannot grant itself access, and no one edits governance without
 * the right (and a reason on the record).
 */
@Controller("ai/governance")
export class GovernanceController {
  constructor(private readonly gov: DbAiGovernance) {}

  @Get("state")
  @RequirePermission("ai.governance.manage")
  async state() {
    return this.gov.getState();
  }

  @Post("kill")
  @RequirePermission("ai.governance.manage")
  async kill(@Body() body: unknown) {
    const p = killSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    await this.gov.setKill(p.data.featureKey, true, p.data.reason);
    return this.gov.getState();
  }

  @Post("release")
  @RequirePermission("ai.governance.manage")
  async release(@Body() body: unknown) {
    const p = killSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    await this.gov.setKill(p.data.featureKey, false, p.data.reason);
    return this.gov.getState();
  }

  @Post("opt-out")
  @RequirePermission("ai.governance.manage")
  async optOut(@Body() body: unknown) {
    const p = optOutSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    await this.gov.setOptOut(p.data.optedOut, p.data.reason);
    return this.gov.getState();
  }

  @Post("budget")
  @RequirePermission("ai.governance.manage")
  async budget(@Body() body: unknown) {
    const p = budgetSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    await this.gov.setBudget(p.data.dailyLimit, p.data.reason);
    return this.gov.getState();
  }
}
