import assert from "node:assert/strict";
import test from "node:test";
import { MvpReadinessService } from "./mvp-readiness.service.js";

test("readiness reports simulated integrations and honest document measures", async () => {
  const service = new MvpReadinessService(
    {
      connectors: async () => [{ code: "GST" }, { code: "BANK" }],
      connections: async () => [
        { name: "gst-demo", healthStatus: "healthy", adapterMode: "fake" },
        { name: "bank-live", healthStatus: "healthy", adapterMode: "live" },
      ],
      flows: async () => [{ code: "invoice", status: "active" }, { code: "bank", status: "paused" }],
    } as never,
    {
      acceptance: async () => ({ drafts: 10, confirmed: 8, acceptanceRatePct: 80, fieldEditRatePct: 5, fallbackRatePct: 10 }),
    } as never,
    {
      registry: async () => [{ key: "receipt", rolloutStage: "pilot" }, { key: "none", rolloutStage: "off" }],
    } as never,
    {
      incidents: async () => [],
    } as never,
    {
      operationalSnapshot: async () => ({ database: { status: "connected", queryMs: 2 }, eventDelivery: { status: "healthy", unpublished: 0 } }),
    } as never,
  );

  const result = await service.snapshot();
  assert.equal(result.integrations.status, "ready");
  assert.equal(result.integrations.simulatedConnections, 1);
  assert.equal(result.integrations.liveConnections, 1);
  assert.match(result.integrations.disclosure, /without sending data outside/i);
  assert.equal(result.documents.fieldEditRatePct, 5);
  assert.equal(result.documents.humanConfirmationRequired, true);
  assert.equal(result.aiGovernance.enabledFeatures, 1);
  assert.equal(result.upgrades.length, 7);
});
