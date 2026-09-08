export const NODE_RESULT_SOURCE_STATUS = "running" as const;
export const NODE_EXHAUSTION_SOURCE_STATUS = "pending" as const;
export const RUN_COMPLETION_SOURCE_STATUS = "running" as const;
export const RUN_FAILURE_SOURCE_STATUSES = [
  "pending",
  "running",
  "waiting_step",
  "waiting_approval",
  "halted",
] as const;
export const HALT_RUN_SOURCE_STATUSES = [
  "pending",
  "running",
  "waiting_step",
  "waiting_approval",
] as const;
export const CANCEL_RUN_SOURCE_STATUSES = [
  ...HALT_RUN_SOURCE_STATUSES,
  "halted",
] as const;

// Every claimed attempt owns a short renewable database lease. A healthy executor renews
// it well before expiry; a crashed executor can therefore be reclaimed while the graph's
// ten-minute execution deadline still has useful time remaining. The execution token makes
// every completion/retry CAS attempt-specific, so a late pre-reclaim process cannot win.
export const MAX_REGISTERED_AGENT_GRAPH_TIMEOUT_MS = 10 * 60_000;
export const AGENT_NODE_EXECUTION_LEASE_MS = 90_000;
export const AGENT_NODE_HEARTBEAT_INTERVAL_MS = 30_000;
// Only pre-0083 rows can be running without a lease. Recover those conservatively after
// the old threshold; all newly claimed work uses the renewable lease above.
export const LEGACY_AGENT_NODE_STALE_AFTER_MS = MAX_REGISTERED_AGENT_GRAPH_TIMEOUT_MS + 5 * 60_000;

export function canFailRunFrom(status: string): boolean {
  return (RUN_FAILURE_SOURCE_STATUSES as readonly string[]).includes(status);
}

export function isNodeClaimConflict(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "AGENT_NODE_NOT_READY",
  );
}

export function anotherExecutorIsRunning(statuses: Readonly<Record<string, string>>): boolean {
  return Object.values(statuses).some((status) => status === "running");
}

/** Do not publish a terminal timeout while another replica still owns live node work. */
export function shouldDeferRunTimeout(statuses: Readonly<Record<string, string>>): boolean {
  return anotherExecutorIsRunning(statuses);
}

export function shouldRestoreApprovalWait(
  runStatus: string,
  statuses: Readonly<Record<string, string>>,
): boolean {
  return runStatus === "halted" && Object.values(statuses).some((status) => status === "waiting_approval");
}

/** Human review time is paused; only actual execution consumes the graph deadline. */
export function approvalPausedDeadline(
  timeoutAt: Date,
  approvalRequestedAt: Date,
  decidedAt: Date,
): Date {
  const pausedMs = Math.max(0, decidedAt.getTime() - approvalRequestedAt.getTime());
  return new Date(timeoutAt.getTime() + pausedMs);
}
