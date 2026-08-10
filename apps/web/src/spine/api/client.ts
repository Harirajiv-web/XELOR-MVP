"use client";

/**
 * THE ONE DOOR TO THE BACKEND.
 *
 * Every screen in every module calls the API through this file and nothing else. Not a
 * style preference — four things have to happen identically on every single request, and
 * sixteen modules will not each get them right:
 *
 *   1. THE ACCESS TOKEN is attached. Never read from a cookie a script can see, never
 *      passed in a query string where it would sit in a proxy log forever.
 *   2. THE ERROR ENVELOPE is parsed. The backend answers every failure with one shape
 *      (`{error:{code,message,details?,traceId}}`), and a UI that shows "Something went
 *      wrong" while the server sent a `traceId` has thrown away the only thing that makes
 *      the support call short.
 *   3. IDEMPOTENCY-KEY on every mutation. A factory-office connection drops mid-request
 *      and the clerk clicks again; without a stable retry key that second click can become
 *      a second purchase order. Explicit keys are honoured, and otherwise this client keeps
 *      one fingerprinted key until a non-ambiguous response is received.
 *   4. A 401 ENDS THE SESSION rather than showing an error. An expired token is not a
 *      failure the user can do anything about.
 */

import { AppError, type ErrorEnvelope } from "./errors";

export const API_BASE = "/api/v1";

/** Supplied by the session provider; kept as a getter so a refreshed token is picked up. */
let tokenProvider: () => string | null = () => null;
let onUnauthenticated: () => void = () => {};

export function configureApi(opts: {
  getToken: () => string | null;
  onUnauthenticated: () => void;
}): void {
  tokenProvider = opts.getToken;
  onUnauthenticated = opts.onUnauthenticated;
}

export interface RequestOptions {
  /** Query string values; undefined and null entries are dropped rather than sent as "undefined". */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Overrides the generated key. Pass a stable one to make a retry replay rather than repeat. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /**
   * How long to wait before giving up. Defaults below; pass 0 to wait indefinitely.
   *
   * There was no default at all, and the consequence was not a slow screen — it was a
   * screen that said "Loading…" for ever. A request that never returns produces no error,
   * no retry and no way for a user to tell a slow network from a broken one.
   */
  timeoutMs?: number;
}

/**
 * A read that has not answered in fifteen seconds is not going to. Failing is strictly
 * better than spinning: an error can be retried and reported, a spinner can only be
 * stared at.
 */
const READ_TIMEOUT_MS = 15_000;

/**
 * Mutations get longer. They are user-initiated, the person is watching, and giving up on
 * a write that may already have committed is a worse outcome than waiting — the
 * `Idempotency-Key` machinery makes the retry safe, but only once the caller knows to retry.
 */
const WRITE_TIMEOUT_MS = 30_000;

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(API_BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.pathname + url.search;
}

/** JSON.stringify semantics with recursively stable object-key ordering. */
export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item))
      return item;
    return Object.keys(item as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = (item as Record<string, unknown>)[key];
        return sorted;
      }, {});
  });
  if (serialized === undefined) {
    throw new TypeError("The request body is not JSON serializable.");
  }
  return serialized;
}

function mutationActorContext(): unknown {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem("aikyantra.session") ?? "null",
    ) as { accessToken?: string } | null;
    const payload = stored?.accessToken?.split(".")[1];
    if (!payload) return { subject: "public-demo-presenter" };
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { sub?: unknown; groups?: unknown };
    return {
      subject:
        typeof decoded.sub === "string" ? decoded.sub : "unknown-subject",
      groups: Array.isArray(decoded.groups)
        ? decoded.groups
            .filter((group): group is string => typeof group === "string")
            .sort()
        : [],
    };
  } catch {
    return { subject: "unresolved-session" };
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

interface PendingRequest {
  key: string;
  storageKey: string;
}

interface PendingRequestGroup {
  active: number;
  ambiguous: boolean;
  pending: Promise<PendingRequest>;
}

interface PendingRequestLease {
  identity: string;
  group: PendingRequestGroup;
}

type PendingRequestOutcome = "definitive" | "ambiguous";

/** Active browser requests only. Durable retry identity remains in sessionStorage. */
const pendingRequestGroups = new Map<string, PendingRequestGroup>();

async function pendingRequestKey(identity: string): Promise<PendingRequest> {
  const fingerprint = await sha256(identity);
  const storageKey = `xelor:pending-request:${fingerprint}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return { key: existing, storageKey };
  } catch {
    // A hardened browser can disable storage. The request still receives a unique key;
    // only retry continuity across that browser boundary is unavailable.
  }
  const key = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(storageKey, key);
  } catch {
    // See the storage boundary above.
  }
  return { key, storageKey };
}

function beginPendingRequest(
  method: string,
  url: string,
  jsonBody: unknown,
): PendingRequestLease {
  const identity = canonicalJson({
    actor: mutationActorContext(),
    body: jsonBody,
    method,
    url,
  });
  const current = pendingRequestGroups.get(identity);
  if (current) {
    current.active += 1;
    return { identity, group: current };
  }

  const group: PendingRequestGroup = {
    active: 1,
    ambiguous: false,
    pending: pendingRequestKey(identity),
  };
  pendingRequestGroups.set(identity, group);
  return { identity, group };
}

function completePendingRequest(pending: PendingRequest): void {
  try {
    if (window.sessionStorage.getItem(pending.storageKey) === pending.key) {
      window.sessionStorage.removeItem(pending.storageKey);
    }
  } catch {
    // No stored retry state exists in this browser context.
  }
}

function settlePendingRequest(
  lease: PendingRequestLease,
  pending: PendingRequest | null,
  outcome: PendingRequestOutcome,
): void {
  if (outcome === "ambiguous") lease.group.ambiguous = true;
  lease.group.active -= 1;
  if (lease.group.active > 0) return;

  if (pendingRequestGroups.get(lease.identity) === lease.group) {
    pendingRequestGroups.delete(lease.identity);
  }
  if (!lease.group.ambiguous && pending) completePendingRequest(pending);
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  const url = buildUrl(path, opts.query);
  const serializedBody = body === undefined ? undefined : canonicalJson(body);
  const jsonBody: unknown =
    serializedBody === undefined ? undefined : JSON.parse(serializedBody);

  // This header is a selector, not a credential. The API honours it only when its
  // separately configured API_PUBLIC_DEMO flag is enabled against an isolated demo DB.
  if (process.env.NEXT_PUBLIC_PUBLIC_DEMO === "true") {
    headers["x-xelor-public-demo"] = "investor-presentation";
  }

  const token = tokenProvider();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const clearTimers: Array<() => void> = [];
  let generatedLease: PendingRequestLease | null = null;
  let generatedPending: PendingRequest | null = null;
  if (method !== "GET") {
    if (opts.idempotencyKey) {
      headers["idempotency-key"] = opts.idempotencyKey;
    } else {
      generatedLease = beginPendingRequest(method, url, jsonBody);
    }
  }

  let outcome: PendingRequestOutcome = "ambiguous";
  let requestMayHaveReachedServer = false;
  let timedOut = false;

  /**
   * The caller's signal and our deadline, as one signal.
   *
   * `AbortSignal.any` is used where available so a caller cancelling still wins
   * immediately; the manual fallback keeps this working on older Safari, which matters
   * because a plant office is exactly where an old browser turns up.
   */
  function timeoutSignal(m: string, o: RequestOptions): AbortSignal | null {
    const ms = o.timeoutMs ?? (m === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
    if (ms <= 0) return o.signal ?? null;

    const deadline = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      deadline.abort();
    }, ms);
    // Never let the timer hold a page open; it is cleared as soon as anything settles.
    clearTimers.push(() => clearTimeout(timer));

    if (!o.signal) return deadline.signal;
    const anyOf = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
    if (anyOf) return anyOf([o.signal, deadline.signal]);
    o.signal.addEventListener("abort", () => deadline.abort(), { once: true });
    return deadline.signal;
  }
  try {
    if (generatedLease) {
      generatedPending = await generatedLease.group.pending;
      headers["idempotency-key"] = generatedPending.key;
    }

    let res: Response;
    try {
      // A rejected fetch can happen after the server committed but before its response
      // arrived, so entering fetch makes the outcome ambiguous until proved otherwise.
      requestMayHaveReachedServer = true;
      res = await fetch(url, {
        method,
        headers,
        body: serializedBody,
        signal: timeoutSignal(method, opts),
      });
    } catch (e) {
      // A timeout aborts, so it arrives here as an AbortError indistinguishable from a
      // caller cancelling. `timedOut` is the flag that tells them apart — a cancelled
      // request should stay silent, a timed-out one must surface as a failure the screen
      // can render and the user can retry.
      if ((e as Error)?.name === "AbortError") {
        if (timedOut) {
          throw new AppError({
            code: "REQUEST_TIMED_OUT",
            message:
              "The server did not answer in time. It may be busy — try again in a moment.",
            httpStatus: 0,
          });
        }
        throw e;
      }
      throw new AppError({
        code: "NETWORK_UNREACHABLE",
        message:
          "Could not reach the server. Check your connection and try again.",
        httpStatus: 0,
      });
    }

    // A 4xx is a definitive refusal even if its optional response body is unreadable.
    if (res.status >= 400 && res.status < 500) outcome = "definitive";

    if (res.status === 401) {
      onUnauthenticated();
      throw new AppError({
        code: "UNAUTHENTICATED",
        message: "Your session has ended. Please sign in again.",
        httpStatus: 401,
      });
    }

    if (res.status === 204) {
      outcome = "definitive";
      return undefined as T;
    }

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // A non-JSON body from a JSON API means something in front of it answered — a proxy,
        // a gateway, a captive portal. Say so rather than showing the user raw HTML.
        throw new AppError({
          code: "MALFORMED_RESPONSE",
          message:
            "The server sent a response this application could not read.",
          httpStatus: res.status,
        });
      }
    }

    if (!res.ok) {
      // A 5xx can be raised after a transaction committed but before its response was
      // assembled, so it deliberately remains ambiguous for a safe replay.
      const envelope = parsed as ErrorEnvelope | null;
      throw AppError.fromEnvelope(envelope, res.status);
    }

    outcome = "definitive";
    return parsed as T;
  } finally {
    // Always, on every path. A pending timer keeps a reference alive and, on a screen that
    // navigates away mid-request, would fire an abort against a request nobody is waiting for.
    for (const clear of clearTimers) clear();
    if (generatedLease) {
      settlePendingRequest(
        generatedLease,
        generatedPending,
        requestMayHaveReachedServer ? outcome : "definitive",
      );
    }
  }
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PATCH", path, body, opts),
};
