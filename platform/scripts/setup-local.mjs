#!/usr/bin/env node
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (existsSync(".env")) process.loadEnvFile(".env");
const require = createRequire(resolve(root, "packages/db/package.json"));
const { Client } = require("pg");
const owner = new URL(process.env.DATABASE_OWNER_URL ?? "");
const app = new URL(process.env.DATABASE_URL ?? "");
const database = owner.pathname.slice(1);
if (!/^aikyantra_[a-z0-9_]+$/.test(database)) throw new Error("Local setup requires a dedicated aikyantra_* database name.");
const admin = new URL(owner); admin.pathname = "/postgres";
const client = new Client({ connectionString: admin.href });
await client.connect();
try {
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [database]);
  if (!existing.rowCount) await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)} OWNER ${client.escapeIdentifier(decodeURIComponent(owner.username))}`);
} finally { await client.end(); }
const db = new Client({ connectionString: owner.href });
await db.connect();
try {
  const appRole = db.escapeIdentifier(decodeURIComponent(app.username));
  const ownerRole = db.escapeIdentifier(decodeURIComponent(owner.username));
  await db.query("CREATE EXTENSION IF NOT EXISTS vector");
  await db.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  const exists = await db.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [decodeURIComponent(app.username)]);
  if (!exists.rowCount) await db.query(`CREATE ROLE ${appRole} LOGIN PASSWORD ${db.escapeLiteral(decodeURIComponent(app.password))} NOBYPASSRLS`);
  await db.query(`GRANT CONNECT ON DATABASE ${db.escapeIdentifier(database)} TO ${appRole}`);
  await db.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
  await db.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appRole}`);
  await db.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${appRole}`);
  console.log(`Dedicated database ${database} is ready. Existing databases were left intact.`);
} finally { await db.end(); }
