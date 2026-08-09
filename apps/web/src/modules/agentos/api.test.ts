import assert from "node:assert/strict";
import { after, test } from "node:test";
import { configureApi } from "../../spine/api/client";
import { AppError } from "../../spine/api/errors";
import { agentOsApi } from "./api";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

interface FetchCall {
  init?: RequestInit;
  resolve: (response: Response) => void;
  reject: (cause: unknown) => void;
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");

after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalFetch) Object.defineProperty(globalThis, "fetch", originalFetch);
  else Reflect.deleteProperty(globalThis, "fetch");
});

async function waitForCalls(calls: readonly FetchCall[], count: number): Promise<void> {
  for (let turn = 0; turn < 100 && calls.length < count; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(calls.length, count, `expected ${count} fetch calls`);
}

test("concurrent signal launches retain their explicit key after one ambiguous sibling", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://xelor.test" }, sessionStorage: storage },
  });
  configureApi({ getToken: () => null, onUnauthenticated: () => {} });
  const calls: FetchCall[] = [];
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => calls.push({ init, resolve, reject }))) as typeof fetch;

  const first = agentOsApi.signal();
  const second = agentOsApi.signal();
  await waitForCalls(calls, 2);

  const firstBody = JSON.parse(String(calls[0]!.init?.body)) as { eventId: string };
  const secondBody = JSON.parse(String(calls[1]!.init?.body)) as { eventId: string };
  const firstHeader = new Headers(calls[0]!.init?.headers).get("idempotency-key");
  const secondHeader = new Headers(calls[1]!.init?.headers).get("idempotency-key");
  assert.equal(firstBody.eventId, secondBody.eventId);
  assert.equal(firstHeader, firstBody.eventId);
  assert.equal(secondHeader, secondBody.eventId);

  calls[0]!.resolve(new Response(JSON.stringify({ data: { run: { id: "run-1" } } })));
  await first;
  assert.ok(storage.getItem("xelor:pending-mutation:agent-os-signal"));

  const failed = assert.rejects(
    second,
    (cause: unknown) => cause instanceof AppError && cause.code === "NETWORK_UNREACHABLE",
  );
  calls[1]!.reject(new TypeError("response lost after send"));
  await failed;
  assert.ok(storage.getItem("xelor:pending-mutation:agent-os-signal"));

  const retry = agentOsApi.signal();
  await waitForCalls(calls, 3);
  const retryBody = JSON.parse(String(calls[2]!.init?.body)) as { eventId: string };
  assert.equal(retryBody.eventId, firstBody.eventId);
  calls[2]!.resolve(new Response(JSON.stringify({ data: { run: { id: "run-1" } } })));
  await retry;
  assert.equal(storage.getItem("xelor:pending-mutation:agent-os-signal"), null);
});
