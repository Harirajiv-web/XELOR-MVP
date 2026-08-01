import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { QmsWorkflowService } from "./qms-workflow.service.js";

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw Errors.validation(result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  return result.data;
}
function key(value?: string): string {
  if (!value) throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
  return value;
}

const findingSchema = z.object({ sourceType: z.enum(["inspection", "audit", "complaint", "supplier", "manual"]), sourceRef: z.string().min(1), inspectionId: z.string().uuid().optional(), title: z.string().min(3), description: z.string().min(3), severity: z.enum(["critical", "major", "minor"]), ownerRef: z.string().min(1), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const capaSchema = z.object({ findingNo: z.string().min(1), title: z.string().min(3), actionPlan: z.string().min(3), ownerRef: z.string().min(1), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), effectivenessCriteria: z.string().min(3) });

@Controller("quality")
export class QmsWorkflowController {
  constructor(private readonly workflow: QmsWorkflowService) {}

  @Get("findings") @RequirePermission("quality.inspection.read") findings() { return this.workflow.listFindings(); }
  @Post("findings") @RequirePermission("quality.inspection.execute") createFinding(@Body() body: unknown, @Headers("idempotency-key") idk?: string) { return this.workflow.createFinding(parse(findingSchema, body), key(idk)); }
  @Post("findings/:no/contain") @RequirePermission("quality.disposition.decide") contain(@Param("no") no: string, @Body() body: unknown, @Headers("idempotency-key") idk?: string) { return this.workflow.contain(no, parse(z.object({ containment: z.string().min(3) }), body).containment, key(idk)); }
  @Post("findings/:no/root-cause") @RequirePermission("quality.disposition.decide") rootCause(@Param("no") no: string, @Body() body: unknown, @Headers("idempotency-key") idk?: string) { return this.workflow.confirmRootCause(no, parse(z.object({ rootCause: z.string().min(3) }), body).rootCause, key(idk)); }
  @Get("corrective-actions") @RequirePermission("quality.inspection.read") capas() { return this.workflow.listCapas(); }
  @Post("corrective-actions") @RequirePermission("quality.disposition.decide") createCapa(@Body() body: unknown, @Headers("idempotency-key") idk?: string) { return this.workflow.createCapa(parse(capaSchema, body), key(idk)); }
  @Post("corrective-actions/:no/complete") @RequirePermission("quality.disposition.decide") completeCapa(@Param("no") no: string, @Body() body: unknown, @Headers("idempotency-key") idk?: string) { return this.workflow.completeCapa(no, parse(z.object({ completionEvidence: z.string().min(3) }), body).completionEvidence, key(idk)); }
  @Post("corrective-actions/:no/verify") @RequirePermission("quality.disposition.decide") verifyCapa(@Param("no") no: string, @Body() body: unknown, @Headers("idempotency-key") idk?: string) { const input = parse(z.object({ effective: z.boolean(), evidence: z.string().min(3) }), body); return this.workflow.verifyCapa(no, input.effective, input.evidence, key(idk)); }
}
