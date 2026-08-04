#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Run Next.js with the browser-safe values from the repository's shared `.env`.
 *
 * pnpm executes workspace scripts from `apps/web`, while the documented XELOR setup keeps
 * one `.env` at the repository root for both API and web. Next does not search parent
 * directories for env files. Loading the whole file with Node is also wrong: backend-only
 * values such as `NODE_ENV=development` must not leak into a production web build. This
 * small launcher deliberately imports only `NEXT_PUBLIC_*` values and leaves Next in charge
 * of its own build mode.
 */

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../../../.env");
const nextBin = resolve(here, "../node_modules/next/dist/bin/next");
const [command, ...args] = process.argv.slice(2);

if (!command || !["dev", "build", "start"].includes(command)) {
  console.error("Usage: node scripts/run-next.mjs <dev|build|start> [...args]");
  process.exit(2);
}

try {
  const lines = readFileSync(rootEnv, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquote(match[2]);
  }
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
}

// Container platforms inject PORT. Local development keeps the familiar 3001
// default without baking that port into the package script.
const effectiveArgs = [...args];
if (
  (command === "dev" || command === "start") &&
  !effectiveArgs.some((arg) => arg === "--port" || arg === "-p")
) {
  effectiveArgs.push("--port", process.env.PORT ?? "3001");
}

const child = spawn(process.execPath, [nextBin, command, ...effectiveArgs], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
