import { Injectable } from "@nestjs/common";
import { AppError } from "@ind-core/platform";

/**
 * AN IMPORT IS A ROBOT FILLING IN THE SAME FORM.
 *
 * Every accepted row is committed by calling this application's OWN endpoint for that
 * entity — `POST /sales/customers`, `POST /engineering/items`, `POST /stock/entries` — over
 * the configured HTTP origin, carrying the credentials of the person who started the import.
 * Not a shortcut into the services, and emphatically not an INSERT.
 *
 * WHY, WHEN A DIRECT SERVICE CALL LOOKS OBVIOUSLY CHEAPER:
 *
 *  1. THE MODULE BOUNDARY IS REAL AND MECHANICALLY ENFORCED. `eslint-plugin-boundaries`
 *     fails the build if a module under `src/modules/` imports a sibling module, and it is
 *     right to: an import module that reaches into Sales, Engineering, Purchase and
 *     Inventory would couple five modules to each other through the least important one.
 *     Cross-module access is by port or by event, and there is no write port for a customer
 *     or a vendor — nor should one be invented for a spreadsheet's benefit.
 *
 *  2. THE PERMISSION CHECK COMES FOR FREE AND CANNOT BE FORGOTTEN. The domain route carries
 *     `@RequirePermission("sales.customer.create")`. Because the row goes through that
 *     route with the caller's own token, an operator who may upload a file but may not
 *     create customers gets a 403 per row, from the same guard the form obeys. The
 *     alternative — a service call under the import's own permission — would make a
 *     spreadsheet a way around every RBAC rule in the product, and nothing in the code
 *     would say so.
 *
 *  3. EVERYTHING ELSE ON THAT ROUTE STILL HAPPENS: GSTIN validation against the state code,
 *     the duplicate brain, document numbering, the audit trail, the outbox event, and the
 *     `Idempotency-Key` ledger that makes a resumed import safe.
 *
 * WHAT IT COSTS: an HTTP round trip per row, which is real but small next to the database
 * work each of those routes does, and one assumption — that the process can reach the
 * configured API origin. A long-lived local/container process may use `127.0.0.1:$PORT`.
 * A request-isolated runtime such as Vercel or Lambda MUST set `API_SELF_ORIGIN`; silently
 * guessing loopback there can call a listener that does not exist, or deadlock the function
 * currently serving the import. The resolver below fails before the first row in that case.
 */

/** The caller's own credentials, forwarded so the domain route authorises THEM, not us. */
export interface ForwardedCredentials {
  authorization?: string | undefined;
  /** The isolated public-demo selector. Honoured by the middleware only when that mode is on. */
  publicDemo?: string | undefined;
  demoPersona?: string | undefined;
}

export interface DomainResponse<T = unknown> {
  status: number;
  body: T;
}

/** A row's own request must not hang the whole import behind it. */
const CALL_TIMEOUT_MS = 20_000;

/** A Vercel/Lambda invocation is request-isolated; loopback is not a deployment contract. */
function isRequestIsolatedRuntime(env: NodeJS.ProcessEnv): boolean {
  return (
    env.VERCEL === "1" ||
    Boolean(env.AWS_LAMBDA_FUNCTION_NAME) ||
    env.AWS_EXECUTION_ENV?.startsWith("AWS_Lambda_") === true
  );
}

function canonicalOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(
      "IMPORT_SELF_ORIGIN_INVALID",
      503,
      "API_SELF_ORIGIN must be an absolute http(s) origin, for example https://api.example.com.",
    );
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new AppError(
      "IMPORT_SELF_ORIGIN_INVALID",
      503,
      "API_SELF_ORIGIN must contain only an http(s) origin, without credentials, a path, query or fragment.",
    );
  }
  return url.origin;
}

/**
 * Resolve the address used for governed cross-module calls.
 *
 * Local and ordinary container processes have an actual listener and retain the convenient
 * loopback default. Vercel/Lambda do not receive that assumption: their deployment must
 * name a reachable API explicitly, so a missing variable is an immediate configuration
 * error rather than hundreds of identical per-row network failures.
 */
export function resolveDomainApiOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.API_SELF_ORIGIN?.trim();
  if (configured) return canonicalOrigin(configured);
  if (isRequestIsolatedRuntime(env)) {
    throw new AppError(
      "IMPORT_SELF_ORIGIN_REQUIRED",
      503,
      "Spreadsheet import is disabled on this serverless deployment until API_SELF_ORIGIN " +
        "is set to the reachable API origin.",
    );
  }
  return canonicalOrigin(`http://127.0.0.1:${env.PORT ?? env.API_PORT ?? "3000"}`);
}

@Injectable()
export class DomainApiClient {
  /**
   * Where this process answers itself.
   *
   * Read per call rather than cached at construction: the API is started by several
   * entrypoints (container, worker, serverless) and reading it late means a test or a
   * differently-hosted deployment can set it without this module having been imported first.
   */
  private origin(): string {
    return resolveDomainApiOrigin();
  }

  private headers(creds: ForwardedCredentials): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };
    if (creds.authorization) headers.authorization = creds.authorization;
    if (creds.publicDemo) headers["x-xelor-public-demo"] = creds.publicDemo;
    if (creds.demoPersona) headers["x-xelor-demo-persona"] = creds.demoPersona;
    return headers;
  }

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    creds: ForwardedCredentials,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<DomainResponse<T>> {
    const headers = this.headers(creds);
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

    // Resolve outside the network-error wrapper so a missing/invalid serverless setting
    // keeps its specific fail-closed code instead of being disguised as a transient 502.
    const origin = this.origin();
    let response: Response;
    try {
      response = await fetch(`${origin}/api/v1${path}`, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (error) {
      // The import cannot reach its own API. That is an infrastructure fault, not a bad
      // row, and reporting it per-row would bury it under four hundred identical failures.
      throw new AppError(
        "IMPORT_SELF_CALL_FAILED",
        502,
        `The import could not reach ${method} ${path} on this API ` +
          `(${error instanceof Error ? error.message : "unknown error"}). ` +
          `Set API_SELF_ORIGIN if this deployment does not answer on its own loopback address.`,
      );
    }

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: { code: "MALFORMED_RESPONSE", message: text.slice(0, 200) } };
      }
    }
    return { status: response.status, body: body as T };
  }

  post<T>(
    path: string,
    body: unknown,
    idempotencyKey: string,
    creds: ForwardedCredentials,
  ): Promise<DomainResponse<T>> {
    return this.call<T>("POST", path, creds, { body, idempotencyKey });
  }

  get<T>(path: string, creds: ForwardedCredentials): Promise<DomainResponse<T>> {
    return this.call<T>("GET", path, creds);
  }

  /**
   * Every page of a cursor-paginated list.
   *
   * The API offers cursor pagination only (§5.4) and this respects it rather than asking
   * for an unbounded page. The page cap stops a tenant with an enormous master from turning
   * one import into a thousand round trips; hitting it is reported to the caller as a
   * refusal to guess, never as a silently short lookup table — a half-loaded code map would
   * reject perfectly good rows for naming parts that do exist.
   */
  async list<T>(
    path: string,
    creds: ForwardedCredentials,
    maxPages = 50,
  ): Promise<readonly T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const res = await this.get<unknown>(`${path}?${query.toString()}`, creds);
      if (res.status >= 400) {
        const envelope = res.body as { error?: { code?: string; message?: string } } | null;
        throw new AppError(
          envelope?.error?.code ?? "IMPORT_LOOKUP_FAILED",
          res.status === 403 ? 403 : 502,
          `Could not read ${path} to resolve the codes in this file: ` +
            `${envelope?.error?.message ?? `HTTP ${res.status}`}`,
        );
      }
      // Two shapes exist in this API and both are legitimate: a bare array for a small
      // fixed list (warehouses) and `{items, nextCursor}` for anything that can grow.
      if (Array.isArray(res.body)) {
        out.push(...(res.body as T[]));
        return out;
      }
      const page1 = res.body as { items?: T[]; nextCursor?: string | null };
      out.push(...(page1.items ?? []));
      if (!page1.nextCursor) return out;
      cursor = page1.nextCursor;
    }
    throw new AppError(
      "IMPORT_LOOKUP_TOO_LARGE",
      422,
      `Reading ${path} to resolve codes needed more than ${maxPages} pages. This import path ` +
        `is sized for master data, not for a master this large.`,
    );
  }
}
