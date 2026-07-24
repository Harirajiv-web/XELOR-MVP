import { Global, Module } from "@nestjs/common";
import { WorkflowController } from "./workflow.controller.js";
import { W1Service } from "./w1.service.js";
import { WORKFLOW_EXECUTOR } from "../../ports/workflow.port.js";

/**
 * ADMINISTRATION's W1 approval engine, exposed behind the WorkflowExecutor port and made
 * @Global so sibling modules (Purchase, Expenditure) can inject WORKFLOW_EXECUTOR without
 * a module→module import (§1.1) — never the concrete W1Service, so the engine can be
 * swapped (e.g. Temporal) later.
 */
@Global()
@Module({
  controllers: [WorkflowController],
  providers: [W1Service, { provide: WORKFLOW_EXECUTOR, useExisting: W1Service }],
  exports: [WORKFLOW_EXECUTOR],
})
export class WorkflowModule {}
