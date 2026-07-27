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
 *      and the clerk clicks again; without a key that second click is a second purchase
 *      order. The key is minted here, once per logical action, so no screen can forget.
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
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(API_BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.pathname + url.search;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };

  const token = tokenProvider();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  if (method !== "GET") {
    headers["idempotency-key"] = opts.idempotencyKey ?? crypto.randomUUID();
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: opts.signal ?? null,
    });
  } catch (e) {
    // The request never reached a server. Distinguished from a server error on purpose:
    // "check your connection" and "the system refused this" need different responses from
    // the user, and conflating them sends people to the wrong person for help.
    if ((e as Error)?.name === "AbortError") throw e;
    throw new AppError({
      code: "NETWORK_UNREACHABLE",
      message: "Could not reach the server. Check your connection and try again.",
      httpStatus: 0,
    });
  }

  if (res.status === 401) {
    onUnauthenticated();
    throw new AppError({
      code: "UNAUTHENTICATED",
      message: "Your session has ended. Please sign in again.",
      httpStatus: 401,
    });
  }

  if (res.status === 204) return undefined as T;

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
        message: "The server sent a response this application could not read.",
        httpStatus: res.status,
      });
    }
  }

  if (!res.ok) {
    const envelope = parsed as ErrorEnvelope | null;
    throw AppError.fromEnvelope(envelope, res.status);
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PATCH", path, body, opts),
};
