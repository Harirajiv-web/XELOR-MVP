import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { api, canonicalJson, configureApi } from "./client";
import { AppError } from "./errors";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

interface FetchCall {
  init: RequestInit | undefined;
  resolve: (response: Response) => void;
  reject: (cause: unknown) => void;
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "https://xelor.test" },
      sessionStorage: storage,
    },
  });
  configureApi({ getToken: () => null, onUnauthenticated: () => {} });
});

afterEach(() => {
  if (originalWindow)
    Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalFetch) Object.defineProperty(globalThis, "fetch", originalFetch);
  else Reflect.deleteProperty(globalThis, "fetch");
});

function controlledFetch(): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      calls.push({ init, resolve, reject });
    })) as typeof fetch;
  return calls;
}

async function waitForCalls(
  calls: readonly FetchCall[],
  count: number,
): Promise<void> {
  for (let turn = 0; turn < 100 && calls.length < count; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(calls.length, count, `expected ${count} fetch calls`);
}

function requestKey(call: FetchCall): string {
  const key = new Headers(call.init?.headers).get("idempotency-key");
  assert.ok(key);
  return key;
}

function pendingKeys(): string[] {
  return Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  )
    .filter(
      (key): key is string =>
        key?.startsWith("xelor:pending-request:") ?? false,
    )
    .map((key) => storage.getItem(key))
    .filter((key): key is string => key !== null);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("canonical JSON sorts recursively while preserving JSON undefined semantics", () => {
  const first = {
    z: 1,
    omitted: undefined,
    nested: { b: 2, a: 1, omitted: undefined },
    array: [undefined, { d: 4, c: 3 }],
  };
  const reordered = {
    array: [undefined, { c: 3, d: 4 }],
    nested: { omitted: undefined, a: 1, b: 2 },
    omitted: undefined,
    z: 1,
  };
  const expected =
    '{"array":[null,{"c":3,"d":4}],"nested":{"a":1,"b":2},"z":1}';

  assert.equal(canonicalJson(first), expected);
  assert.equal(canonicalJson(reordered), expected);
});

test("one definitive sibling cannot erase a key needed by an ambiguous sibling", async () => {
  const calls = controlledFetch();
  const first = api.post<{ ok: boolean }>("/concurrent", {
    nested: { b: 2, a: 1, omitted: undefined },
  });
  const second = api.post<{ ok: boolean }>("/concurrent", {
    nested: { omitted: undefined, a: 1, b: 2 },
  });
  await waitForCalls(calls, 2);

  const key = requestKey(calls[0]!);
  assert.equal(requestKey(calls[1]!), key);
  assert.equal(calls[0]!.init?.body, '{"nested":{"a":1,"b":2}}');
  assert.equal(calls[1]!.init?.body, calls[0]!.init?.body);

  calls[0]!.resolve(jsonResponse({ ok: true }));
  assert.deepEqual(await first, { ok: true });
  assert.deepEqual(pendingKeys(), [key]);

  const secondFailure = assert.rejects(
    second,
    (cause: unknown) =>
      cause instanceof AppError && cause.code === "NETWORK_UNREACHABLE",
  );
  calls[1]!.reject(new TypeError("connection reset after send"));
  await secondFailure;
  assert.deepEqual(pendingKeys(), [key]);

  const retry = api.post<{ ok: boolean }>("/concurrent", {
    nested: { a: 1, b: 2 },
  });
  await waitForCalls(calls, 3);
  assert.equal(requestKey(calls[2]!), key);
  calls[2]!.resolve(jsonResponse({ ok: true }));
  assert.deepEqual(await retry, { ok: true });
  assert.deepEqual(pendingKeys(), []);
});

test("the last definitive sibling clears the shared key", async () => {
  const calls = controlledFetch();
  const first = api.post<{ ok: boolean }>("/definitive", { value: 1 });
  const second = api.post<{ ok: boolean }>("/definitive", { value: 1 });
  await waitForCalls(calls, 2);

  const key = requestKey(calls[0]!);
  assert.equal(requestKey(calls[1]!), key);
  calls[0]!.resolve(jsonResponse({ ok: true }));
  await first;
  assert.deepEqual(pendingKeys(), [key]);

  const secondFailure = assert.rejects(
    second,
    (cause: unknown) => cause instanceof AppError && cause.httpStatus === 422,
  );
  calls[1]!.resolve(
    jsonResponse(
      { error: { code: "VALIDATION", message: "request refused" } },
      422,
    ),
  );
  await secondFailure;
  assert.deepEqual(pendingKeys(), []);
});

test("abort, network failure, and 5xx retain a key until a successful replay", async () => {
  const scenarios: ReadonlyArray<{
    path: string;
    fail: (call: FetchCall) => void;
  }> = [
    {
      path: "/abort",
      fail: (call) => call.reject(new DOMException("cancelled", "AbortError")),
    },
    {
      path: "/network",
      fail: (call) => call.reject(new TypeError("socket closed")),
    },
    {
      path: "/server-error",
      fail: (call) =>
        call.resolve(
          jsonResponse({ error: { code: "INTERNAL", message: "failed" } }, 503),
        ),
    },
  ];

  for (const scenario of scenarios) {
    const calls = controlledFetch();
    const failed = api.post<{ ok: boolean }>(scenario.path, { value: 1 });
    await waitForCalls(calls, 1);
    const key = requestKey(calls[0]!);
    const failure = assert.rejects(failed);
    scenario.fail(calls[0]!);
    await failure;
    assert.deepEqual(pendingKeys(), [key]);

    const retry = api.post<{ ok: boolean }>(scenario.path, { value: 1 });
    await waitForCalls(calls, 2);
    assert.equal(requestKey(calls[1]!), key);
    calls[1]!.resolve(jsonResponse({ ok: true }));
    await retry;
    assert.deepEqual(pendingKeys(), []);
  }
});
