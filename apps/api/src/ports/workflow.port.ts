/**
 * The WorkflowExecutor port (DECISIONS-V2 §1.3). Lives at app level (not inside the
 * workflow module) so ANY business module can depend on the interface without a
 * module→module import — cross-module access via a shared service interface (§1.1).
 * A heavier engine (Temporal) could replace W1 behind this same contract.
 */
export const WORKFLOW_EXECUTOR = Symbol("WorkflowExecutor");

export interface StartWorkflowInput {
  definitionCode: string; // which template (e.g. po_approval)
  subjectType: string; // what is being approved (e.g. purchase_order)
  subjectId: string; // the document's id (logical reference)
}

export type WorkflowDecision = "approve" | "reject";

export interface WorkflowInstanceView {
  id: string;
  definitionCode: string;
  subjectType: string;
  subjectId: string;
  currentStepSeq: number;
  currentStepName: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  slaDueAt: string | null;
}

export interface WorkflowActionView {
  seq: number;
  action: string;
  stepSeq: number;
  actorId: string;
  comment: string | null;
  at: string;
  prevHash: string;
  hash: string;
}

export interface WorkflowExecutor {
  /** Submit a document into an approval template (idempotent on the key). */
  start(input: StartWorkflowInput, idempotencyKey: string): Promise<WorkflowInstanceView>;
  /** The current approver approves or rejects the step they are on. */
  act(
    instanceId: string,
    decision: WorkflowDecision,
    comment: string | undefined,
  ): Promise<WorkflowInstanceView>;
  /** Read an instance plus its full, tamper-proof action trail. */
  get(instanceId: string): Promise<{ instance: WorkflowInstanceView; actions: WorkflowActionView[] }>;
  /** Pending instances whose current step is past its SLA deadline. */
  overdue(): Promise<WorkflowInstanceView[]>;
}
