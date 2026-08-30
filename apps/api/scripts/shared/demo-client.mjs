/**
 * THE PLUMBING BOTH SEEDERS RUN ON.
 *
 * `demo/01-seed-base-world.mjs` builds the §7 base world;
 * `demo/02-seed-northstar-story.mjs` builds the investor
 * story on top of it. They share a token exchange, an HTTP client with idempotency keys,
 * a step runner and an assertion helper — and they share them from HERE rather than each
 * carrying a copy.
 *
 * That is not tidiness. This codebase has already paid for duplicated infrastructure once:
 * migration 0045 exists because three hand-maintained permission registries drifted until
 * 59 of 87 readable endpoints answered 403 to every user in the system. Two copies of a
 * token exchange drift the same way, and the symptom — one seeder authenticating slightly
 * differently from the other — would show up as a mysterious 401 halfway through a demo
 * build rather than as an obvious duplicate.
 */

/**
 * `localhost`, NOT the literal `127.0.0.1`, and that is a measured difference rather than a
 * style choice. The API runs as a process inside WSL while Keycloak and Postgres run as
 * containers with published ports. From Windows, `localhost:3000` reaches the WSL process
 * and `127.0.0.1:3000` does not — WSL2's loopback forwarding resolves by name — so the
 * seeder's old default failed at the first API call with a bare `fetch failed`, several
 * steps after the token exchange had succeeded against Keycloak on the same host.
 * `localhost` works from both sides of the boundary; the dotted quad works from one.
 */
/**
 * PHASE-2 runs its API on :3100. PHASE-1 runs on :3000.
 *
 * This default used to be :3000 in both checkouts, which meant that running
 * `pnpm demo:rebuild` from PHASE-2 dropped PHASE-2's schema and then seeded PHASE-1
 * through its API — reported as success, because every call really did succeed; just
 * against the wrong database. The symptom was six "PO is already approved" failures,
 * which were PHASE-1's existing documents refusing to be submitted a second time.
 *
 * Override with API_BASE when pointing a script at the other phase on purpose.
 */
export const API = process.env.API_BASE ?? "http://localhost:3100";
export const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
export const REALM = process.env.KEYCLOAK_REALM ?? "indcore";
export const PUBLIC_DEMO = process.env.DEMO_PUBLIC_MODE === "true";

/** Demo "today" — §7 fixes it at Monday 20 July 2026 so every screen agrees. */
export const TODAY = "2026-07-20";
export const TRISHUL_GSTIN_PUNE = "27AABCT1234F1Z5";
export const TRISHUL_GSTIN_CBE = "33AABCT1234F1Z9";

export const VERBOSE = process.argv.includes("--verbose");

/** A step that found its work already done. Counted as ok, printed differently. */
export const SKIPPED = Symbol("skipped");

const counters = { ok: 0, failed: 0 };
export const tally = () => ({ ...counters });

export async function token(username, password = "demo") {
  // The hosted investor stack intentionally omits Keycloak. API_PUBLIC_DEMO
  // still keeps requests inside the isolated demo tenant and normal RBAC/RLS;
  // this marker only selects one of the seeded demo people for workflow steps.
  if (PUBLIC_DEMO) return `public-demo:${username}`;

  const res = await fetch(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "indcore-api",
      grant_type: "password",
      username,
      password,
      scope: "openid",
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`no token for ${username}: ${JSON.stringify(j)}`);
  return j.access_token;
}

export function makeClient(tok) {
  return async function call(method, path, body, idemKey) {
    const headers = {};
    if (tok.startsWith("public-demo:")) {
      headers["x-xelor-public-demo"] = "investor-presentation";
      headers["x-xelor-demo-persona"] = tok.slice("public-demo:".length);
    } else {
      headers.authorization = `Bearer ${tok}`;
    }
    if (body !== undefined) headers["content-type"] = "application/json";
    // The key is derived from the path and the payload, so re-running a seeder replays
    // rather than duplicates — the same guarantee a retrying client gets.
    if (idemKey) headers["idempotency-key"] = idemKey;
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };
}

/** Run a step, print one line, keep going. A failed step must not hide the ones after it. */
export async function step(label, fn) {
  try {
    const result = await fn();
    if (result === SKIPPED) {
      console.log(`  --   ${label} (already present)`);
      counters.ok++;
      return null;
    }
    console.log(`  ok   ${label}${result?.note ? ` — ${result.note}` : ""}`);
    counters.ok++;
    return result?.value ?? result ?? null;
  } catch (e) {
    counters.failed++;
    console.log(`  FAIL ${label}`);
    console.log(`         ${e.message}`);
    if (VERBOSE && e.detail) console.log(`         ${JSON.stringify(e.detail)}`);
    return null;
  }
}

export function expect(res, want, what) {
  const wants = Array.isArray(want) ? want : [want];
  if (!wants.includes(res.status)) {
    const env = res.body?.error;
    const detail = env
      ? `${env.code}: ${env.message}${env.details ? ` ${JSON.stringify(env.details)}` : ""}`
      : JSON.stringify(res.body).slice(0, 300);
    const err = new Error(`${what} → HTTP ${res.status} (wanted ${wants.join("/")}) — ${detail}`);
    err.detail = res.body;
    throw err;
  }
  return res.body;
}

/** List endpoints answer in three shapes across the modules; this flattens all of them. */
export const rows = (b) => (Array.isArray(b) ? b : (b?.data ?? b?.items ?? b?.entries ?? []));

/* ------------------------------------------------------------------ dates */

const DAY = 86_400_000;
export const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export const daysAgo = (n) => isoDate(Date.now() - n * DAY);

/** Days from the fixed demo date, so a document dated "three days ago" stays there. */
export const fromToday = (n) => isoDate(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY);

/** Indian financial year for a date: April to March. 20-Jul-2026 falls in FY 2026-27. */
export function fyOf(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * ISO week bucket, the form planning uses everywhere (`2026-W30`).
 *
 * Written out rather than pulled from @ind-core/platform on purpose: these scripts are
 * plain `.mjs` run by node with no build step, and importing the workspace package would
 * make the seeders depend on `dist/` being current — the stale-`dist` trap CLAUDE.md warns
 * about, arriving here as a seeder that mysteriously plans into the wrong week.
 */
export function weekBucket(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  // ISO-8601: week 1 is the week containing the first Thursday, weeks start Monday.
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // the Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * DAY));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Print the run summary and choose the exit code. Shared so both seeders end alike. */
export function finish(extraLines = []) {
  console.log(`\n${"=".repeat(74)}`);
  console.log(`  ${counters.ok} step(s) ok, ${counters.failed} failed`);
  for (const line of extraLines) console.log(`  ${line}`);
  process.exit(counters.failed > 0 ? 1 : 0);
}
