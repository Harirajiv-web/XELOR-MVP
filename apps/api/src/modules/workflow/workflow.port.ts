/**
 * The WorkflowExecutor port (DECISIONS-V2 §1.3). Other modules depend on this
 * interface, never on the W1 implementation, so a heavier engine (Temporal) could
 * replace it behind the same contract without touching callers.
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
