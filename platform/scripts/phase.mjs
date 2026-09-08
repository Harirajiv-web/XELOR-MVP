#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phase = process.argv[2] ?? "4";
const action = process.argv[3] ?? "dev";
if (!/^[1-4]$/.test(phase) || !["dev", "start", "build", "stop"].includes(action)) {
  console.error("Usage: node scripts/phase.mjs <1|2|3|4> [dev|start|build|stop]"); process.exit(2);
}
process.chdir(root);
if (existsSync(".env")) process.loadEnvFile(".env");
const apiPort = 3900 + Number(phase) * 100;
const webPort = apiPort + 1;
const env = { ...process.env, PRODUCT_PHASE: phase, NEXT_PUBLIC_PRODUCT_PHASE: phase, API_PORT: String(apiPort), API_SELF_ORIGIN: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_API_ORIGIN: `http://127.0.0.1:${apiPort}`, XELOR_WEB_URL: `http://localhost:${webPort}`, SOURCE_PORTAL_BASE_URL: process.env[`PHASE_${phase}_PORTAL_BASE_URL`] ?? process.env.SOURCE_PORTAL_BASE_URL ?? `http://localhost:${webPort}`, ONYX_API_BASE_URL: phase === "2" ? process.env.PHASE_2_ERP_ORIGIN ?? "http://127.0.0.1:4000" : process.env.ONYX_API_BASE_URL ?? `http://127.0.0.1:${apiPort}` };
delete env.PORT;
const runtime = resolve(root, ".run", `phase-${phase}`);
mkdirSync(runtime, { recursive: true });
const pidFile = resolve(runtime, "processes.json");

if (action === "stop") {
  if (existsSync(pidFile)) {
    for (const pid of JSON.parse(readFileSync(pidFile, "utf8"))) { try { process.kill(pid, "SIGTERM"); } catch {} }
    unlinkSync(pidFile);
  }
  console.log(`Phase ${phase} stopped.`); process.exit(0);
}

function command(cmd, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${cmd} exited ${code}`)));
  });
}
if (action === "build") {
  env.NODE_ENV = "production";
  await command("pnpm", ["--filter", "@ind-core/platform", "build"]);
  await command("pnpm", ["--filter", "@ind-core/db", "build"]);
  await command("pnpm", ["--filter", "@ind-core/api", "build"]);
  await command("pnpm", ["--filter", "@ind-core/web", "build"]);
  process.exit(0);
}
if (!existsSync(resolve(root, "apps/api/dist/src/main.js"))) {
  console.error(`Build the API first: pnpm --filter @ind-core/platform build && pnpm --filter @ind-core/db build && pnpm --filter @ind-core/api build`);
  process.exit(1);
}
if (action === "start" && !existsSync(resolve(root, `apps/web/.next/phase-${phase}/BUILD_ID`))) {
  console.error(`Phase ${phase} needs a web build: node scripts/phase.mjs ${phase} build`); process.exit(1);
}
env.NODE_ENV = action === "start" ? "production" : "development";
const api = spawn(process.execPath, ["apps/api/dist/src/main.js"], { cwd: root, env, stdio: "inherit" });
const web = spawn(process.execPath, ["apps/web/scripts/run-next.mjs", action === "dev" ? "dev" : "start", "--hostname", "0.0.0.0"], { cwd: root, env: { ...env, PORT: String(webPort) }, stdio: "inherit" });
writeFileSync(pidFile, JSON.stringify([api.pid, web.pid]));
console.log(`Phase ${phase}: http://localhost:${webPort} · API ${apiPort}. Data is preserved on every launch.`);
let stopping = false;
function stop() { if (stopping) return; stopping = true; api.kill("SIGTERM"); web.kill("SIGTERM"); try { unlinkSync(pidFile); } catch {} }
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, stop);
for (const child of [api, web]) {
  child.on("error", (error) => { console.error(error.message); stop(); process.exitCode = 1; });
  child.on("exit", (code) => { if (!stopping) { process.exitCode = code || 1; stop(); } });
}
