#!/usr/bin/env node

const url = process.argv[2];
if (!url) {
  console.error("Usage: node wait-for-url.mjs <url>");
  process.exit(2);
}

const timeoutMs = Number(process.env.WAIT_TIMEOUT_MS ?? 600_000);
const deadline = Date.now() + timeoutMs;
let attempt = 0;
let lastError;

while (Date.now() < deadline) {
  attempt += 1;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (response.ok) {
      console.log(`${url} is ready (attempt ${attempt}).`);
      process.exit(0);
    }
    lastError = new Error(`HTTP ${response.status}`);
  } catch (error) {
    lastError = error;
  }
  if (attempt === 1 || attempt % 10 === 0) console.log(`Waiting for ${url} ...`);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}

console.error(`${url} was not ready within ${timeoutMs}ms.`, lastError);
process.exit(1);
