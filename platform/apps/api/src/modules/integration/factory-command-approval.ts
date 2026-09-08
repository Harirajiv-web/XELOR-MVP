import { createHash } from "node:crypto";
import {
  AppError,
  canonicalMachineCommandIntent,
  normalizeMachineCommandIntent,
  type MachineCommandIntent,
} from "@ind-core/platform";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID text has one canonical representation, so case variants cannot bypass approval-once. */
export function canonicalFactoryApprovalRef(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_RE.test(normalized)) {
    throw new AppError(
      "FACTORY_APPROVAL_REF_INVALID",
      422,
      "The Factory approval reference must be a valid UUID.",
    );
  }
  return normalized;
}

export function factoryCommandIntentDigest(intent: MachineCommandIntent): string {
  return createHash("sha256")
    .update(canonicalMachineCommandIntent(intent), "utf8")
    .digest("hex");
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

/** A skipped/refused KILN read is not Factory evidence and cannot feed an approval gate. */
export function isSuccessfulFactoryEvidenceNode(node: {
  status: string;
  output: unknown;
} | undefined): boolean {
  if (node?.status !== "succeeded") return false;
  const output = recordOf(node.output);
  return Boolean(
    output &&
      output.capabilityKey === "production.factory-connect.read" &&
      output.mode === "live_read" &&
      "data" in output &&
      recordOf(output.data),
  );
}

/** Refuse recording an approval after its exact simulator command intent has expired. */
export function assertFactoryApprovalIntentFresh(proposed: unknown, now = new Date()): void {
  const proposal = recordOf(proposed);
  if (typeof proposal?.graph !== "string" || !proposal.graph.startsWith("factory.flow-recovery@")) {
    return;
  }
  if (proposal.factoryCommand === null) return;
  const intent = normalizeMachineCommandIntent(proposal.factoryCommand, {
    enforceExpiryWindow: false,
  });
  if (!intent.valid) {
    throw new AppError(
      "FACTORY_APPROVAL_INTENT_INVALID",
      409,
      "The Factory approval proposal no longer contains a valid exact command intent.",
    );
  }
  if (Date.parse(intent.value.expiresAt) <= now.getTime()) {
    throw new AppError(
      "FACTORY_APPROVAL_INTENT_EXPIRED",
      409,
      "The Factory command intent expired before approval; start a new mission with fresh evidence.",
    );
  }
}

export function assertFactoryAutomationActive(state: unknown): void {
  const gate = recordOf(state);
  if (gate?.routingAllowed === false || gate?.allowed === false) {
    throw new AppError(
      "FACTORY_AUTOMATION_STOPPED",
      423,
      `Factory simulator evaluation is stopped by the global automation switch${
        typeof gate.reason === "string" && gate.reason.length > 0 ? `: ${gate.reason}` : "."
      }`,
    );
  }
}

export function factoryCommandDigestFromProposal(proposed: unknown): string | null {
  const digest = recordOf(proposed)?.factoryCommandDigest;
  return typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest) ? digest : null;
}

/** Build the immutable Factory portion of an approval proposal from mission input. */
export function factoryCommandApprovalEvidence(
  missionInput: unknown,
  now?: string,
): { factoryCommand: MachineCommandIntent | null; factoryCommandDigest: string | null } {
  const input =
    typeof missionInput === "object" && missionInput !== null && !Array.isArray(missionInput)
      ? (missionInput as Record<string, unknown>)
      : {};
  if (!("factoryCommand" in input)) {
    return { factoryCommand: null, factoryCommandDigest: null };
  }
  const normalized = normalizeMachineCommandIntent(input.factoryCommand, { now });
  if (!normalized.valid) {
    throw new AppError(
      "FACTORY_COMMAND_INTENT_INVALID",
      422,
      normalized.reason,
    );
  }
  return {
    factoryCommand: normalized.value,
    factoryCommandDigest: factoryCommandIntentDigest(normalized.value),
  };
}
