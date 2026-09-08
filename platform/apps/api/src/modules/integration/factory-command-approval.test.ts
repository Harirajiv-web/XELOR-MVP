import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "@ind-core/platform";
import {
  canonicalFactoryApprovalRef,
  assertFactoryApprovalIntentFresh,
  assertFactoryAutomationActive,
  factoryCommandApprovalEvidence,
  factoryCommandDigestFromProposal,
  factoryCommandIntentDigest,
  isSuccessfulFactoryEvidenceNode,
} from "./factory-command-approval.js";

const command = {
  assetCode: "ROBOT-CELL-03",
  capability: "maintenance.inspection.request",
  parameters: { inspectionType: "visual", reasonCode: "FLOW_BLOCKED" },
  requiredState: "blocked",
  expiresAt: "2026-08-08T12:10:00Z",
};

describe("Factory command approval evidence", () => {
  it("canonicalises case variants to one approval-once identity", () => {
    const upper = "ABCDEF12-3456-4789-ABCD-EF1234567890";
    const lower = upper.toLowerCase();
    assert.equal(canonicalFactoryApprovalRef(upper), lower);
    assert.equal(canonicalFactoryApprovalRef(lower), lower);
    assert.throws(
      () => canonicalFactoryApprovalRef("not-an-approval"),
      (error) => error instanceof AppError && error.code === "FACTORY_APPROVAL_REF_INVALID",
    );
  });

  it("copies the normalised command and its canonical SHA-256 digest", () => {
    const evidence = factoryCommandApprovalEvidence(
      { factoryCommand: command },
      "2026-08-08T12:00:00Z",
    );
    assert.ok(evidence.factoryCommand);
    assert.match(evidence.factoryCommandDigest ?? "", /^[a-f0-9]{64}$/);
    assert.equal(
      evidence.factoryCommandDigest,
      factoryCommandIntentDigest(evidence.factoryCommand!),
    );
    assert.equal(
      factoryCommandDigestFromProposal(evidence),
      evidence.factoryCommandDigest,
    );
  });

  it("makes an analysis-only mission authorize no command", () => {
    assert.deepEqual(factoryCommandApprovalEvidence({}, "2026-08-08T12:00:00Z"), {
      factoryCommand: null,
      factoryCommandDigest: null,
    });
  });

  it("rejects an unknown command parameter before approval", () => {
    assert.throws(
      () =>
        factoryCommandApprovalEvidence(
          {
            factoryCommand: {
              ...command,
              parameters: { ...command.parameters, rawMotion: true },
            },
          },
          "2026-08-08T12:00:00Z",
        ),
      (error) => error instanceof AppError && error.code === "FACTORY_COMMAND_INTENT_INVALID",
    );
  });

  it("does not treat a skipped or malformed KILN read as approval evidence", () => {
    assert.equal(
      isSuccessfulFactoryEvidenceNode({
        status: "skipped",
        output: { reason: "capability_not_permitted" },
      }),
      false,
    );
    assert.equal(
      isSuccessfulFactoryEvidenceNode({
        status: "succeeded",
        output: { capabilityKey: "production.factory-connect.read", mode: "live_read" },
      }),
      false,
    );
    assert.equal(
      isSuccessfulFactoryEvidenceNode({
        status: "succeeded",
        output: {
          capabilityKey: "production.factory-connect.read",
          mode: "live_read",
          data: { assets: [], dwell: [] },
        },
      }),
      true,
    );
  });

  it("refuses an overdue Factory intent before recording the approval decision", () => {
    assert.throws(
      () => assertFactoryApprovalIntentFresh(
        {
          graph: "factory.flow-recovery@2",
          factoryCommand: command,
        },
        new Date("2026-08-08T12:11:00Z"),
      ),
      (error) => error instanceof AppError && error.code === "FACTORY_APPROVAL_INTENT_EXPIRED",
    );
    assert.doesNotThrow(() => assertFactoryApprovalIntentFresh(
      {
        graph: "factory.flow-recovery@2",
        factoryCommand: command,
      },
      new Date("2026-08-08T12:09:00Z"),
    ));
  });

  it("refuses simulator evaluation while the global automation switch is stopped", () => {
    assert.throws(
      () => assertFactoryAutomationActive({ routingAllowed: false, reason: "incident" }),
      (error) => error instanceof AppError && error.code === "FACTORY_AUTOMATION_STOPPED",
    );
    assert.throws(
      () => assertFactoryAutomationActive({ allowed: false, reason: "kill_switch" }),
      (error) => error instanceof AppError && error.code === "FACTORY_AUTOMATION_STOPPED",
    );
    assert.doesNotThrow(() => assertFactoryAutomationActive({ routingAllowed: true }));
    assert.doesNotThrow(() => assertFactoryAutomationActive({ allowed: true }));
  });
});
