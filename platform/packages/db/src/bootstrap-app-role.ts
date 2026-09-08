import pg from "pg";

/**
 * Creates the non-owner login expected by every XELOR migration.
 *
 * Docker Compose does this in `/docker-entrypoint-initdb.d`; managed Postgres
 * has no such hook, so deployment runs this once before the forward migrations.
 */
async function main(): Promise<void> {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  const password = process.env.APP_DATABASE_PASSWORD;
  if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is required.");
  if (!password || password.length < 32) {
    throw new Error("APP_DATABASE_PASSWORD must contain at least 32 characters.");
  }

  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    // Docker installs these in 00-init.sql. Managed Postgres has no container
    // init directory, so establish the same prerequisites before migrations.
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    const exists = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') AS exists",
    );
    const passwordLiteral = client.escapeLiteral(password);
    if (!exists.rows[0]?.exists) {
      await client.query(
        `CREATE ROLE app_user LOGIN PASSWORD ${passwordLiteral} NOBYPASSRLS`,
      );
    } else {
      await client.query(`ALTER ROLE app_user PASSWORD ${passwordLiteral} NOBYPASSRLS`);
    }

    const database = await client.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    const databaseName = database.rows[0]?.name;
    if (!databaseName) throw new Error("Managed Postgres returned no current database.");

    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(databaseName)} TO app_user`);
    await client.query("GRANT USAGE ON SCHEMA public TO app_user");
    await client.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user",
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user",
    );
    console.log("Managed Postgres application role is ready.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
