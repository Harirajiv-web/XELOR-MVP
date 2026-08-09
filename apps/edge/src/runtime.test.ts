import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EdgeRuntime,
  FactorySimulatorAdapter,
  type EdgeCommand,
  type EdgeStateEvent,
  type LocalControllerAdapter,
} from "./runtime.js";

function amrCommand(overrides: Partial<EdgeCommand> = {}): EdgeCommand {
  return {
    commandKey: "MC-001",
    assetCode: "AMR-07",
    capability: "amr.route.dispatch",
    parameters: { routeId: "ROUTE-CELL-03" },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

test("edge runtime provides process-local replay for one current simulator command", async () => {
  const runtime = new EdgeRuntime(new FactorySimulatorAdapter());
  const command = amrCommand();
  const first = await runtime.execute(command);
  const replay = await runtime.execute(command);
  assert.equal(first.acknowledged, true);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
});

test("edge runtime rejects invalid expiry and unknown capability parameters", async () => {
  const runtime = new EdgeRuntime(new FactorySimulatorAdapter());
  assert.equal((await runtime.execute(amrCommand({ commandKey: "MC-NAN", expiresAt: "not-a-date" }))).acknowledged, false);
  assert.equal(
    (
      await runtime.execute(
        amrCommand({ commandKey: "MC-PARAM", parameters: { routeId: "R-1", rawVelocity: 4 } }),
      )
    ).acknowledged,
    false,
  );
});

test("edge runtime enforces the simulator's per-asset capability mapping", async () => {
  const runtime = new EdgeRuntime(new FactorySimulatorAdapter());
  const result = await runtime.execute(
    amrCommand({
      commandKey: "MC-WRONG-ASSET",
      assetCode: "ROBOT-CELL-03",
    }),
  );
  assert.equal(result.acknowledged, false);
  assert.match(String(result.evidence.reason), /has not mapped capability/);
});

test("same command key with a different fingerprint is refused", async () => {
  const runtime = new EdgeRuntime(new FactorySimulatorAdapter());
  assert.equal((await runtime.execute(amrCommand())).acknowledged, true);
  const mismatch = await runtime.execute(
    amrCommand({ parameters: { routeId: "ROUTE-DIFFERENT" } }),
  );
  assert.equal(mismatch.acknowledged, false);
  assert.match(String(mismatch.evidence.reason), /different payload/);
});

test("concurrent identical commands are single-flight within the process", async () => {
  class CountingAdapter implements LocalControllerAdapter {
    readonly kind = "simulator" as const;
    executions = 0;
    readState(): Promise<EdgeStateEvent[]> { return Promise.resolve([]); }
    capabilitiesFor(): readonly ["amr.route.dispatch"] { return ["amr.route.dispatch"]; }
    checkSafety(): Promise<{ ready: boolean; reason: string }> {
      return Promise.resolve({ ready: true, reason: "test" });
    }
    async execute(): Promise<{ acknowledged: boolean; evidence: Record<string, unknown> }> {
      this.executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { acknowledged: true, evidence: { outcome: "simulated" } };
    }
  }
  const adapter = new CountingAdapter();
  const runtime = new EdgeRuntime(adapter);
  const command = amrCommand();
  const [first, second] = await Promise.all([
    runtime.execute(command),
    runtime.execute(command),
  ]);
  assert.equal(adapter.executions, 1);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
});

test("a ready non-simulator adapter is hard-refused before any physical callback", async () => {
  class MockOpcUaAdapter implements LocalControllerAdapter {
    readonly kind = "opcua" as const;
    safetyChecks = 0;
    executions = 0;
    readState(): Promise<EdgeStateEvent[]> { return Promise.resolve([]); }
    capabilitiesFor(): readonly ["amr.route.dispatch"] { return ["amr.route.dispatch"]; }
    checkSafety(): Promise<{ ready: boolean; reason: string }> {
      this.safetyChecks += 1;
      return Promise.resolve({ ready: true, reason: "mock controller ready" });
    }
    execute(): Promise<{ acknowledged: boolean; evidence: Record<string, unknown> }> {
      this.executions += 1;
      return Promise.resolve({ acknowledged: true, evidence: { physical: true } });
    }
  }
  const adapter = new MockOpcUaAdapter();
  const result = await new EdgeRuntime(adapter).execute(amrCommand());
  assert.equal(result.acknowledged, false);
  assert.match(String(result.evidence.reason), /physical command transport is unavailable/);
  assert.equal(adapter.safetyChecks, 0);
  assert.equal(adapter.executions, 0);
});
