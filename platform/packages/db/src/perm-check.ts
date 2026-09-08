/**
 * PERMISSION GATE — the routes, the registry and the catalogue must say the same thing.
 *
 * Runs alongside rls-check and naming-check. It exists because these three drifted apart
 * silently once already: 56 permissions were demanded by a route and held by nobody (so
 * those routes answered 403 to the administrator too), and 6 were granted to roles while
 * no code checked them (so the access console showed control that did not exist).
 *
 * Neither failure announces itself. A 403 looks like access control working. A grant that
 * controls nothing looks like a grant. Only a diff finds them, so the diff runs in CI.
 *
 * Checks, in order of how much damage the failure does:
 *   1. A route demands a permission that is not registered  -> the route is unreachable.
 *   2. A registered permission no route enforces            -> a grant that grants nothing.
 *   3. A catalogued permission that is not registered       -> grantable, unenforceable.
 *   4. A registered permission missing from a tenant's catalogue -> cannot be granted there.
 *   5. A grant whose permission is not catalogued           -> the 0039 rule, verified live.
 *
 * The database part is skipped (loudly) when DATABASE_URL is unset, so the source-level
 * checks still gate a machine with no Postgres.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { PERMISSION_REGISTRY } from "@ind-core/platform";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_SRC = resolve(HERE, "../../../apps/api/src");

const problems: string[] = [];
const notes: string[] = [];

// ---- 1 + 2. the routes vs the registry -------------------------------------------

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...controllerFiles(p));
    else if (entry.endsWith(".controller.ts")) out.push(p);
  }
  return out;
}

const demanded = new Map<string, string[]>(); // permission -> files that demand it
for (const file of controllerFiles(API_SRC)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/@RequirePermission\("([^"]+)"\)/g)) {
    const key = m[1]!;
    if (!demanded.has(key)) demanded.set(key, []);
    demanded.get(key)!.push(file.replace(API_SRC, "apps/api/src"));
  }
}

// Explicitly Set<string>: this checker's whole job is to compare the registry against
// strings scraped from source and read from the database, neither of which the type
// system can vouch for. Inferring Set<PermissionKey> here would refuse the comparison
// that finds the bug.
const registered = new Set<string>(PERMISSION_REGISTRY.map((p) => p.permission));

for (const [permission, files] of demanded) {
  if (!registered.has(permission)) {
    problems.push(
      `route demands an UNREGISTERED permission '${permission}' (${files[0]}) — ` +
        `that route can only ever return 403. Add it to permission-registry.ts.`,
    );
  }
}

for (const spec of PERMISSION_REGISTRY) {
  if (!demanded.has(spec.permission)) {
    problems.push(
      `registered permission '${spec.permission}' is enforced by NO route — ` +
        `granting it confers nothing. Remove it, or guard the route that needs it.`,
    );
  }
}

console.log(
  `routes demand ${demanded.size} permission(s); registry declares ${registered.size}.`,
);

// ---- 3 + 4 + 5. the database ------------------------------------------------------

const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
if (!url) {
  notes.push("DATABASE_URL unset — catalogue and grant checks were SKIPPED, not passed.");
} else {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tenants = await client.query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id FROM permission_catalogue ORDER BY tenant_id`,
    );
    const cat = await client.query<{ tenant_id: string; permission: string }>(
      `SELECT tenant_id, permission FROM permission_catalogue`,
    );

    const byTenant = new Map<string, Set<string>>();
    for (const row of cat.rows) {
      if (!byTenant.has(row.tenant_id)) byTenant.set(row.tenant_id, new Set());
      byTenant.get(row.tenant_id)!.add(row.permission);
    }

    for (const [tenantId, perms] of byTenant) {
      for (const p of perms) {
        if (!registered.has(p)) {
          problems.push(
            `tenant ${tenantId}: catalogue lists '${p}', which is not in the registry — ` +
              `it can be granted but nothing enforces it.`,
          );
        }
      }
      const missing = [...registered].filter((p) => !perms.has(p));
      if (missing.length > 0) {
        problems.push(
          `tenant ${tenantId}: ${missing.length} registered permission(s) absent from its ` +
            `catalogue (e.g. ${missing.slice(0, 3).join(", ")}) — they cannot be granted there.`,
        );
      }
    }
    if (tenants.rowCount === 0) {
      problems.push("permission_catalogue is empty — no tenant can grant anything.");
    }

    const orphanGrants = await client.query<{ tenant_id: string; permission: string }>(
      `SELECT p.tenant_id, p.permission
         FROM role_permission p
        WHERE NOT EXISTS (
          SELECT 1 FROM permission_catalogue c
           WHERE c.tenant_id = p.tenant_id AND c.permission = p.permission)
        ORDER BY 1, 2`,
    );
    for (const row of orphanGrants.rows) {
      problems.push(
        `tenant ${row.tenant_id}: '${row.permission}' is GRANTED but not catalogued — ` +
          `migration 0039's rule is being violated in live data.`,
      );
    }

    console.log(
      `catalogue covers ${byTenant.size} tenant(s); ${cat.rowCount} catalogue row(s); ` +
        `${orphanGrants.rowCount} uncatalogued grant(s).`,
    );
  } finally {
    await client.end();
  }
}

// ---- verdict ----------------------------------------------------------------------

for (const n of notes) console.warn(`NOTE: ${n}`);

if (problems.length > 0) {
  console.error(`\nPermission check FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `Permission check OK — ${registered.size} permissions; every route's demand is ` +
    `registered, every registered permission is enforced, every grant is catalogued.`,
);
