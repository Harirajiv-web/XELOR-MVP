import type { Config } from "drizzle-kit";

/**
 * drizzle-kit config for introspection / studio only. The AUTHORITATIVE DDL is the
 * hand-written SQL in ./migrations (drizzle-kit cannot express FORCE RLS, policies,
 * or the append-only audit trigger). Do not `drizzle-kit push` against a real db.
 */
export default {
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_OWNER_URL ?? "" },
} satisfies Config;
