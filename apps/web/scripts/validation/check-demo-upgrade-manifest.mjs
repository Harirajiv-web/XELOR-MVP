#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const MANIFEST_PATH = join(
  ROOT,
  "workspace",
  "docs",
  "07-execution",
  "03-demo-upgrade-codebase-manifest.json",
);
const BLUEPRINT_PATH = join(
  ROOT,
  "workspace",
  "docs",
  "07-execution",
  "02-xelor-demo-upgrade-implementation-blueprint.md",
);

const problems = [];

function requireCondition(condition, message) {
  if (!condition) problems.push(message);
}

requireCondition(
  existsSync(MANIFEST_PATH),
  "Implementation manifest is missing.",
);
requireCondition(
  existsSync(BLUEPRINT_PATH),
  "Canonical implementation blueprint is missing.",
);

if (problems.length > 0) {
  for (const problem of problems) console.error("  - " + problem);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const blueprint = readFileSync(BLUEPRINT_PATH, "utf8");

requireCondition(
  manifest.schemaVersion === "xelor-demo-upgrade.v1",
  "schemaVersion must be xelor-demo-upgrade.v1.",
);
requireCondition(
  Array.isArray(manifest.workstreams),
  "workstreams must be an array.",
);
requireCondition(
  manifest.workstreams.length >= 8,
  "At least eight workstreams are required.",
);

const allowedStatuses = new Set(manifest.allowedStatuses ?? []);
const allowedPhases = new Set(["D0", "D1", "D2", "D3", "D4"]);
const allowedOwners = new Set([
  "HEXA",
  "ONYX",
  "AXLE",
  "KILN",
  "SPAR",
  "MICA",
  "RASP",
]);
const ids = new Set();
const proposedPaths = new Map();

for (const workstream of manifest.workstreams ?? []) {
  const prefix = workstream.id || "<missing-id>";
  requireCondition(
    typeof workstream.id === "string" &&
      /^D[0-4]-[A-Z0-9-]+$/.test(workstream.id),
    prefix + ": id must use D0-D4 and uppercase words.",
  );
  requireCondition(
    !ids.has(workstream.id),
    prefix + ": duplicate workstream id.",
  );
  ids.add(workstream.id);
  requireCondition(
    allowedPhases.has(workstream.phase),
    prefix + ": invalid phase.",
  );
  requireCondition(
    allowedOwners.has(workstream.owner),
    prefix + ": invalid owner.",
  );
  requireCondition(
    allowedStatuses.has(workstream.status),
    prefix + ": invalid status.",
  );

  for (const field of [
    "existingPaths",
    "proposedPaths",
    "apis",
    "events",
    "permissions",
    "tests",
    "acceptance",
  ]) {
    requireCondition(
      Array.isArray(workstream[field]),
      prefix + ": " + field + " must be an array.",
    );
  }
  requireCondition(
    (workstream.acceptance ?? []).length >= 3,
    prefix + ": at least three acceptance statements are required.",
  );

  for (const path of workstream.existingPaths ?? []) {
    requireCondition(
      existsSync(join(ROOT, path)),
      prefix + ": existing path not found: " + path,
    );
  }

  for (const path of workstream.proposedPaths ?? []) {
    const owner = proposedPaths.get(path);
    requireCondition(
      !owner,
      prefix + ": proposed path is also owned by " + owner + ": " + path,
    );
    proposedPaths.set(path, prefix);
  }

  for (const api of workstream.apis ?? []) {
    requireCondition(
      /^(GET|POST|PATCH|PUT|DELETE) \//.test(api),
      prefix + ": API must start with an HTTP method and absolute path: " + api,
    );
  }
  for (const event of workstream.events ?? []) {
    requireCondition(
      /^[a-z0-9.-]+\.v[0-9]+$/.test(event),
      prefix + ": invalid event name: " + event,
    );
  }
  for (const permission of workstream.permissions ?? []) {
    requireCondition(
      /^[a-z0-9.-]+$/.test(permission),
      prefix + ": invalid permission name: " + permission,
    );
  }
}

const requiredDisclosures = [
  "configured simulator evidence",
  "not an offline PWA",
  "planning review only",
  "HTTP separation currently exists only for Factory Intelligence",
  "No predictive-maintenance accuracy",
];
for (const phrase of requiredDisclosures) {
  requireCondition(
    blueprint.includes(phrase),
    "Canonical blueprint is missing mandatory disclosure: " + phrase,
  );
}

if (problems.length > 0) {
  console.error(
    "\nDemo upgrade manifest check FAILED - " +
      problems.length +
      " problem(s):",
  );
  for (const problem of problems) console.error("  - " + problem);
  process.exit(1);
}

console.log(
  "Demo upgrade manifest OK - " +
    manifest.workstreams.length +
    " workstreams, " +
    proposedPaths.size +
    " proposed paths, and all current-path/disclosure checks passed.",
);
