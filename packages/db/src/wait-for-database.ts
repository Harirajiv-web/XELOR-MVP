import pg from "pg";

/** Wait for the database container/private endpoint before running migrations. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL is required.");

  const timeoutMs = Number(process.env.DATABASE_WAIT_TIMEOUT_MS ?? 300_000);
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() < deadline) {
    attempt += 1;
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      console.log(`Database is ready (attempt ${attempt}).`);
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      if (attempt === 1 || attempt % 10 === 0) {
        console.log(`Waiting for database (attempt ${attempt}) ...`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  throw new Error(`Database was not ready within ${timeoutMs}ms.`, { cause: lastError });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
