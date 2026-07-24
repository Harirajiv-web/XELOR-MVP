import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { WORKFLOW_EXECUTOR, type WorkflowExecutor } from "./workflow.port.js";

const startSchema = z.object({
  definitionCode: z.string().min(1),
  subjectType: z.string().min(1),
  subjectId: z.string().uuid(),
});
const actSchema = z.object({ comment: z.string().max(500).optional() });

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}

/**
 * Drives the W1 engine over HTTP. Authorization for approve/reject is data-driven
 * (per-step approver, enforced inside the engine), not a static permission — so
 * these routes carry no @RequirePermission.
 */
@Controller("workflow")
export class WorkflowController {
  constructor(@Inject(WORKFLOW_EXECUTOR) private readonly wf: WorkflowExecutor) {}

  @Post("instances")
  async start(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    if (!key) {
      throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
    }
    const p = startSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.wf.start(p.data, key);
  }

  @Post("instances/:id/approve")
  async approve(@Param("id") id: string, @Body() body: unknown) {
    const p = actSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.wf.act(id, "approve", p.data.comment);
  }

  @Post("instances/:id/reject")
  async reject(@Param("id") id: string, @Body() body: unknown) {
    const p = actSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.wf.act(id, "reject", p.data.comment);
  }

  @Get("instances/:id")
  async get(@Param("id") id: string) {
    return this.wf.get(id);
  }

  @Get("overdue")
  async overdue() {
    return this.wf.overdue();
  }
}
