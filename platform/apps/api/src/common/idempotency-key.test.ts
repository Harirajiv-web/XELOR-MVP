import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "@ind-core/platform";
import { AgentOsController } from "../agent-os/agent-os.controller.js";
import { IntegrationController } from "../modules/integration/integration.controller.js";

const signal = {
  eventId: "northstar-risk-0192a8c0-0059-7000-8000-000000000099",
  eventType: "delivery.commitment.at_risk",
  sourceDomain: "operations",
  summary: "A governed recovery review is required.",
};

const command = {
  assetCode: "ROBOT-CELL-03",
  requiredState: "blocked",
  approvalRef: "0192a8c0-0059-7000-8000-000000000099",
  idempotencyKey: "factory-command-099",
  expiresAt: "2026-08-08T23:59:00+05:30",
  capability: "maintenance.inspection.request",
  parameters: { inspectionType: "visual" },
};

function isHeaderMismatch(error: unknown): boolean {
  return error instanceof AppError &&
    error.code === "VALIDATION_FAILED" &&
    error.details?.some(
      (detail) =>
        detail.field === "Idempotency-Key" && detail.message.startsWith("must match"),
    ) === true;
}

test("signal ingress rejects a competing header identity before starting a run", async () => {
  let calls = 0;
  const controller = new AgentOsController({
    ingestSignal: async () => {
      calls += 1;
      return { accepted: true };
    },
  } as never);

  await assert.rejects(
    () => controller.signal("another-logical-event", signal),
    isHeaderMismatch,
  );
  assert.equal(calls, 0);
  await controller.signal(signal.eventId, signal);
  await controller.signal(undefined, signal);
  assert.equal(calls, 2, "legacy clients without the optional header remain compatible");
});

test("Factory commands reject a competing header identity before policy evaluation", async () => {
  let calls = 0;
  const controller = new IntegrationController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      requestCommand: async () => {
        calls += 1;
        return { accepted: true };
      },
    } as never,
  );

  await assert.rejects(
    () => controller.requestMachineCommand("another-command", command),
    isHeaderMismatch,
  );
  assert.equal(calls, 0);
  await controller.requestMachineCommand(command.idempotencyKey, command);
  await controller.requestMachineCommand(undefined, command);
  assert.equal(calls, 2, "legacy clients without the optional header remain compatible");
});
