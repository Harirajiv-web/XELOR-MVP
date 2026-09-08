#!/usr/bin/env node

/**
 * Keep stable technical-report facts tied to the implementation that owns them.
 *
 * Stable repository facts are derived from their owning implementation. The verified test
 * snapshot below is updated only after a complete verification run so stale report totals
 * fail closed as well. Commercial assumptions are owned by
 * check-business-revenue-model.mjs and are not interpreted here.
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const reportDir = resolve(root, "docs/reports");
const guideDir = resolve(reportDir, "agent-guides");

const source = {
  permissions: resolve(
    root,
    "packages/platform/src/access/permission-registry.ts",
  ),
  agents: resolve(root, "packages/platform/src/agent-os/types.ts"),
  capabilities: resolve(
    root,
    "apps/api/src/agent-os/capability-registry.service.ts",
  ),
  graphs: resolve(root, "apps/api/src/agent-os/graph-registry.service.ts"),
  modules: resolve(root, "apps/web/src/modules"),
  moduleRegistry: resolve(root, "apps/web/src/modules/registry.ts"),
  apiSource: resolve(root, "apps/api/src"),
  migrations: resolve(root, "packages/db/migrations"),
  guideRenderer: resolve(root, "apps/web/scripts/render-agent-guides.mjs"),
  projectRenderer: resolve(root, "apps/web/scripts/render-project-reports.mjs"),
  guideRenderManifest: resolve(reportDir, "agent-guides/render-manifest.json"),
  projectRenderManifest: resolve(reportDir, "project-report-render-manifest.json"),
  guidePdfDir: resolve(root, "docs/05-deliverables/agent-guides"),
  projectPdfDir: resolve(root, "docs/05-deliverables/project-reports"),
  factoryBoundary: resolve(root, "docs/01-agent-os/06-factory-connect.md"),
};

const problems = [];
const expect = (condition, message) => {
  if (!condition) problems.push(message);
};
const verifiedTests = Object.freeze({
  total: 994,
  platform: 821,
  api: 103,
  database: 6,
  edge: 6,
  web: 58,
});
expect(
  verifiedTests.platform +
    verifiedTests.api +
    verifiedTests.database +
    verifiedTests.edge +
    verifiedTests.web ===
    verifiedTests.total,
  "The verified unit/service test breakdown does not sum to its recorded total.",
);
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const unique = (values) => [...new Set(values)];
async function filesUnder(directory, suffix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return filesUnder(path, suffix);
      return entry.isFile() && entry.name.endsWith(suffix) ? [path] : [];
    }),
  );
  return nested.flat();
}
const sha256 = async (path) =>
  createHash("sha256").update(await readFile(path)).digest("hex");

const [
  permissionSource,
  agentSource,
  capabilitySource,
  graphSource,
  moduleRegistrySource,
] = await Promise.all([
  readFile(source.permissions, "utf8"),
  readFile(source.agents, "utf8"),
  readFile(source.capabilities, "utf8"),
  readFile(source.graphs, "utf8"),
  readFile(source.moduleRegistry, "utf8"),
]);

const permissionKeys = [
  ...permissionSource.matchAll(/permission:\s*"([a-z0-9_.-]+)"/g),
].map((match) => match[1]);
expect(
  permissionKeys.length === unique(permissionKeys).length,
  `${rel(source.permissions)} contains duplicate permission keys.`,
);

const agentRegistryBlock = agentSource.match(
  /export const AGENT_REGISTRY:[\s\S]*?=\s*\[([\s\S]*?)\n\] as const;/,
)?.[1];
expect(
  Boolean(agentRegistryBlock),
  `Could not parse AGENT_REGISTRY in ${rel(source.agents)}.`,
);
const agentKeys = agentRegistryBlock
  ? [...agentRegistryBlock.matchAll(/^\s{4}key:\s*"([A-Z]+)"/gm)].map(
      (match) => match[1],
    )
  : [];
expect(
  agentKeys.length === unique(agentKeys).length,
  `${rel(source.agents)} contains duplicate agent keys.`,
);

const capabilityKeys = [
  ...capabilitySource.matchAll(/^\s{8}key:\s*"([a-z0-9_.-]+)"/gm),
].map((match) => match[1]);
const sideEffectFlags = [
  ...capabilitySource.matchAll(/^\s{8}sideEffecting:\s*(true|false),/gm),
].map((match) => match[1] === "true");
expect(
  capabilityKeys.length === unique(capabilityKeys).length,
  `${rel(source.capabilities)} contains duplicate capability keys.`,
);
expect(
  sideEffectFlags.length === capabilityKeys.length,
  `${rel(source.capabilities)} does not declare one sideEffecting flag per capability.`,
);

const graphNames = [
  ...graphSource.matchAll(
    /^const\s+([A-Z0-9_]+):\s*AgentGraphDefinition\s*=\s*\{/gm,
  ),
].map((match) => match[1]);
expect(
  graphNames.length === unique(graphNames).length,
  `${rel(source.graphs)} contains duplicate graph constants.`,
);

const registeredModules = [
  ...moduleRegistrySource.matchAll(/from\s+"\.\/([a-z0-9-]+)\/manifest"/g),
].map((match) => match[1]);
const moduleEntries = (await readdir(source.modules, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
expect(
  registeredModules.length === unique(registeredModules).length,
  `${rel(source.moduleRegistry)} imports a module manifest more than once.`,
);
expect(
  JSON.stringify([...registeredModules].sort()) ===
    JSON.stringify(moduleEntries),
  `${rel(source.moduleRegistry)} and apps/web/src/modules directories do not describe the same modules.`,
);

let navigationPermissionReferences = 0;
for (const moduleKey of registeredModules) {
  const manifest = await readFile(
    resolve(source.modules, moduleKey, "manifest.ts"),
    "utf8",
  );
  navigationPermissionReferences += [
    ...manifest.matchAll(/permission:\s*"([a-z0-9_.-]+)"/g),
  ].length;
}

const migrationFiles = (await readdir(source.migrations))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
const migrationPrefixes = migrationFiles.map((name) => name.slice(0, 4));
expect(
  migrationPrefixes.length === unique(migrationPrefixes).length,
  `${rel(source.migrations)} contains duplicate numeric migration prefixes.`,
);
const migrationHeadFile = migrationFiles.at(-1) ?? "";
const migrationHead = migrationHeadFile.slice(0, 4);
const migrationSources = await Promise.all(
  migrationFiles.map((name) => readFile(resolve(source.migrations, name), "utf8")),
);
const migrationCreateTables = migrationSources.reduce(
  (count, sqlSource) =>
    count + [...sqlSource.matchAll(/^\s*CREATE\s+TABLE\b/gim)].length,
  0,
);
const controllerFiles = await filesUnder(source.apiSource, ".controller.ts");
const controllerSources = await Promise.all(
  controllerFiles.map((path) => readFile(path, "utf8")),
);
const controllerSurfaces = controllerSources.reduce(
  (count, controllerSource) =>
    count + [...controllerSource.matchAll(/@Controller\s*\(/g)].length,
  0,
);

const facts = {
  permissions: unique(permissionKeys).length,
  migrations: migrationFiles.length,
  migrationHead,
  migrationHeadFile,
  migrationCreateTables,
  controllerSurfaces,
  modules: registeredModules.length,
  navigationPermissionReferences,
  agents: unique(agentKeys).length,
  capabilities: unique(capabilityKeys).length,
  sideEffectingCapabilities: sideEffectFlags.filter(Boolean).length,
  graphs: unique(graphNames).length,
};

expect(facts.permissions > 0, "Permission registry parsed as empty.");
expect(
  facts.migrations > 0 && /^\d{4}$/.test(facts.migrationHead),
  "Migration inventory parsed as empty.",
);
expect(facts.modules > 0, "Module registry parsed as empty.");
expect(
  facts.navigationPermissionReferences > 0,
  "Navigation permission inventory parsed as empty.",
);
expect(facts.agents > 0, "Agent registry parsed as empty.");
expect(facts.capabilities > 0, "Capability registry parsed as empty.");
expect(facts.graphs > 0, "Graph registry parsed as empty.");
expect(facts.migrationCreateTables > 0, "Migration CREATE TABLE inventory parsed as empty.");
expect(facts.controllerSurfaces > 0, "API controller inventory parsed as empty.");

/* The guide generator has one compact stable-fact block. Keep it reconciled too. */
const guideRenderer = await readFile(source.guideRenderer, "utf8");
const systemBlock = guideRenderer.match(
  /const SYSTEM = \{([\s\S]*?)\n\};/,
)?.[1];
expect(
  Boolean(systemBlock),
  `Could not parse SYSTEM facts in ${rel(source.guideRenderer)}.`,
);
for (const [field, expected] of [
  ["agents", facts.agents],
  ["capabilities", facts.capabilities],
  ["graphs", facts.graphs],
  ["modules", facts.modules],
  ["permissions", facts.permissions],
  ["sideEffecting", facts.sideEffectingCapabilities],
]) {
  const actualText = systemBlock?.match(
    new RegExp(`\\b${field}:\\s*(\\d+)`),
  )?.[1];
  expect(
    actualText !== undefined,
    `${rel(source.guideRenderer)} SYSTEM.${field} is missing or not a numeric literal.`,
  );
  if (actualText !== undefined) {
    expect(
      Number(actualText) === expected,
      `${rel(source.guideRenderer)} SYSTEM.${field} says ${actualText}; implementation says ${expected}.`,
    );
  }
}

const projectReports = (await readdir(reportDir))
  .filter((name) => name.endsWith(".html"))
  .map((name) => resolve(reportDir, name));
const agentGuides = (await readdir(guideDir))
  .filter((name) => name.endsWith(".html"))
  .map((name) => resolve(guideDir, name));
const businessReport = resolve(reportDir, "xelor-business-revenue-model.html");
const stableClaimFiles = [
  source.guideRenderer,
  ...projectReports.filter((path) => path !== businessReport),
  ...agentGuides,
];
const qualitativeClaimFiles = unique([
  ...stableClaimFiles,
  businessReport,
  source.factoryBoundary,
]);

async function validateRenderManifest({
  manifestPath,
  rendererPath,
  expectedSources,
  pdfDir,
  label,
}) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    problems.push(
      `${rel(manifestPath)} is missing or invalid; run the complete ${label} renderer (${error instanceof Error ? error.message : String(error)}).`,
    );
    return;
  }
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  expect(manifest.version === 1, `${rel(manifestPath)} has an unsupported manifest version.`);
  expect(
    manifest.renderer === rel(rendererPath),
    `${rel(manifestPath)} names renderer '${String(manifest.renderer)}'; expected '${rel(rendererPath)}'.`,
  );
  try {
    expect(
      manifest.rendererSha256 === await sha256(rendererPath),
      `${rel(manifestPath)} is stale because ${rel(rendererPath)} changed; rerender all ${label}.`,
    );
  } catch (error) {
    problems.push(`${rel(rendererPath)} could not be hashed: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const actualSources = artifacts
    .map((artifact) => artifact?.source)
    .filter((value) => typeof value === "string")
    .sort();
  expect(
    JSON.stringify(actualSources) === JSON.stringify([...expectedSources].sort()),
    `${rel(manifestPath)} does not cover the exact ${expectedSources.length} ${label} HTML sources.`,
  );

  const pdfFiles = (await readdir(pdfDir))
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .map((name) => rel(resolve(pdfDir, name)))
    .sort();
  const manifestPdfs = artifacts
    .map((artifact) => artifact?.pdf)
    .filter((value) => typeof value === "string")
    .sort();
  expect(
    JSON.stringify(manifestPdfs) === JSON.stringify(pdfFiles),
    `${rel(manifestPath)} does not cover the exact ${pdfFiles.length} committed ${label} PDFs.`,
  );

  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") {
      problems.push(`${rel(manifestPath)} contains a malformed artifact entry.`);
      continue;
    }
    for (const [field, hashField] of [
      ["source", "sourceSha256"],
      ["pdf", "pdfSha256"],
    ]) {
      const pathText = artifact[field];
      const recordedHash = artifact[hashField];
      if (typeof pathText !== "string" || typeof recordedHash !== "string") {
        problems.push(`${rel(manifestPath)} artifact '${String(artifact.id)}' is missing ${field}/${hashField}.`);
        continue;
      }
      const absolutePath = resolve(root, pathText);
      if (rel(absolutePath) !== pathText.replaceAll("\\", "/")) {
        problems.push(`${rel(manifestPath)} artifact '${String(artifact.id)}' has a non-canonical ${field} path.`);
        continue;
      }
      try {
        const actualHash = await sha256(absolutePath);
        expect(
          actualHash === recordedHash,
          `${pathText} no longer matches ${rel(manifestPath)}; rerender all ${label}.`,
        );
      } catch (error) {
        problems.push(`${pathText} could not be hashed: ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
  }
}

await validateRenderManifest({
  manifestPath: source.guideRenderManifest,
  rendererPath: source.guideRenderer,
  expectedSources: agentGuides.map(rel),
  pdfDir: source.guidePdfDir,
  label: "agent-guide",
});
await validateRenderManifest({
  manifestPath: source.projectRenderManifest,
  rendererPath: source.projectRenderer,
  expectedSources: projectReports.map(rel),
  pdfDir: source.projectPdfDir,
  label: "project-report",
});

const stripMarkup = (line) =>
  line
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();

const countClaims = [
  {
    label: "permission registry",
    expected: facts.permissions,
    patterns: [
      /\b(\d+)\s+(?:(?:registered|typed|route)\s+)?permissions?(?![-\w]|\s+references?)/gi,
      /\bpermissions?\s+(\d+)\s+keys?\b/gi,
    ],
  },
  {
    label: "SQL migration",
    expected: facts.migrations,
    patterns: [
      /\b(\d+)\s+(?:(?:forward|SQL)\s+){0,2}migration(?:s| files)\b/gi,
    ],
  },
  {
    label: "web module",
    expected: facts.modules,
    patterns: [
      /\b(\d+)\s+(?:(?:registered|installed)\s+)?(?:web\s+)?module(?:s| manifests)\b/gi,
    ],
  },
  {
    label: "navigation permission reference",
    expected: facts.navigationPermissionReferences,
    patterns: [
      /\b(\d+)\s+(?:navigation permissions?|permission references?|nav permissions?)\b/gi,
    ],
  },
  {
    label: "agent",
    expected: facts.agents,
    patterns: [
      /\b(\d+)\s+(?:(?:named|registered|governed)\s+)?agents\b(?!\s+it may delegate)/gi,
      /\b(\d+)\s+(?:governed\s+)?agent identities\b/gi,
    ],
  },
  {
    label: "capability/tool",
    expected: facts.capabilities,
    patterns: [
      /\b(\d+)\s+capabilities\b/gi,
      /\b(?:all\s+)?(\d+)\s+(?:registered|callable)\s+tools\b/gi,
    ],
  },
  {
    label: "mission graph",
    expected: facts.graphs,
    patterns: [/\b(\d+)\s+(?:registered\s+)?(?:mission\s+)?graphs?\b/gi],
  },
  {
    label: "API controller surface",
    expected: facts.controllerSurfaces,
    patterns: [/\b(\d+)\s+(?:NestJS\s+)?controller surfaces?\b/gi],
  },
  {
    label: "migration CREATE TABLE declaration",
    expected: facts.migrationCreateTables,
    patterns: [/\b(\d+)\s+migration CREATE TABLE declarations?\b/gi],
  },
  {
    label: "verified unit/service test",
    expected: verifiedTests.total,
    patterns: [
      /\b(\d+)\s*(?:\/\s*\d+\s*)?(?:unit\s+and\s+service|unit\/service|service\/unit)\s+tests?\b/gi,
      /\/\s*(\d+)\s*(?:unit\s+and\s+service|unit\/service|service\/unit)\s+tests?\b/gi,
    ],
  },
  {
    label: "verified platform test",
    expected: verifiedTests.platform,
    patterns: [/\b(\d+)\s+platform(?=\s*(?:tests?\b|,|\)))/gi],
  },
  {
    label: "verified API test",
    expected: verifiedTests.api,
    patterns: [/\b(\d+)\s+API(?=\s*(?:tests?\b|,|\)))/g],
  },
  {
    label: "verified database test",
    expected: verifiedTests.database,
    patterns: [/\b(\d+)\s+database(?=\s*(?:tests?\b|,|\)))/gi],
  },
  {
    label: "verified edge test",
    expected: verifiedTests.edge,
    patterns: [/\b(\d+)\s+edge(?=\s*(?:tests?\b|,|and\b|\)))/gi],
  },
  {
    label: "verified web-client test",
    expected: verifiedTests.web,
    patterns: [/\b(\d+)\s+web-client(?=\s*(?:tests?\b|,|\)))/gi],
  },
  {
    label: "verified edge + web test",
    expected: verifiedTests.edge + verifiedTests.web,
    patterns: [/\b(\d+)\s+edge\s*\+\s*web\s+tests?\b/gi],
  },
];

for (const path of stableClaimFiles) {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = stripMarkup(rawLine);
    for (const claim of countClaims) {
      for (const pattern of claim.patterns) {
        for (const match of line.matchAll(
          new RegExp(pattern.source, pattern.flags),
        )) {
          const actual = Number(match[1]);
          if (actual !== claim.expected) {
            problems.push(
              `${rel(path)}:${index + 1} claims ${actual} ${claim.label}(s); implementation says ${claim.expected}.`,
            );
          }
        }
      }
    }

    for (const match of line.matchAll(/\bthrough\s+(\d{4})\b/gi)) {
      if (match[1] !== facts.migrationHead) {
        problems.push(
          `${rel(path)}:${index + 1} claims migration head ${match[1]}; implementation head is ${facts.migrationHead} (${facts.migrationHeadFile}).`,
        );
      }
    }
    for (const match of line.matchAll(
      /\b(\d+)\s*\/\s*(\d+)\s+Agent OS identities\b/gi,
    )) {
      if (
        Number(match[1]) !== facts.agents ||
        Number(match[2]) !== facts.agents
      ) {
        problems.push(
          `${rel(path)}:${index + 1} claims ${match[1]}/${match[2]} Agent OS identities; implementation says ${facts.agents}/${facts.agents}.`,
        );
      }
    }
    for (const match of line.matchAll(
      /\b(\d+)\s+of\s+(\d+)\s+cannot change anything\b/gi,
    )) {
      const expectedReadOnly =
        facts.capabilities - facts.sideEffectingCapabilities;
      if (
        Number(match[1]) !== expectedReadOnly ||
        Number(match[2]) !== facts.capabilities
      ) {
        problems.push(
          `${rel(path)}:${index + 1} claims ${match[1]} of ${match[2]} read-only capabilities; implementation says ${expectedReadOnly} of ${facts.capabilities}.`,
        );
      }
    }
    for (const match of line.matchAll(
      /\b(\d+)\s+of\s+(?:the\s+)?(\d+)\s+cannot act\b/gi,
    )) {
      const expectedNonActing = facts.graphs - 1;
      if (
        Number(match[1]) !== expectedNonActing ||
        Number(match[2]) !== facts.graphs
      ) {
        problems.push(
          `${rel(path)}:${index + 1} claims ${match[1]} of ${match[2]} non-acting graphs; implementation says ${expectedNonActing} of ${facts.graphs}.`,
        );
      }
    }
  });
}

const knownStaleAssertions = [
  /\bseventeen of eighteen cannot change anything\b/i,
  /\b17\s*\/\s*18\s+(?:tools|capabilities)\b/i,
  /\bfive of the six cannot act\b/i,
  /\b5\s*\/\s*6\s+(?:side-effecting|non-acting|read-only)\b/i,
  /\bsix mission graphs\b/i,
  /\b6 registered mission graphs\b/i,
  /\beight governed identities are registered\b/i,
  /\ball eight agent maps\b/i,
  /\bpermission guard does not filter is_active\b/i,
  /\bsoft-revoked grants? (?:is|are) still honoured\b/i,
  /\bsoft-revoked grants? (?:is|are) still honored\b/i,
  /\bsoft-revoked grants? need a guard correction\b/i,
  /\bsigned telemetry\b/i,
  /\bdurable edge replay\b/i,
  /\bexactly-once physical execution\b/i,
  /\bedge execution (?:is|are|was|were) simulator-only\b/i,
  /\boutstanding controller acknowledgement\b/i,
  /\baccepts idempotent edge evidence\b/i,
  /\bconnects business systems and the factory edge\b/i,
  /\bfive OT connector definitions and edge simulator are real and tested\b/i,
  /\bassesses safe recovery and records the approved work item\b/i,
  /\bverifies tenant, connector, allow-list and local-controller safety boundaries\b/i,
  /\bKILN records recovery while local control remains authoritative\b/i,
];

const unnegatedPhysicalClaims = [
  /\bphysical controller executed\b/gi,
  /\bcontroller acknowledgement (?:was |is )?(?:received|recorded|confirmed)\b/gi,
  /\bcontroller acknowledged (?:the )?(?:command|request)\b/gi,
  /\b(?:physical|edge) (?:dispatch|execution) (?:was |is )?(?:completed|successful|acknowledged)\b/gi,
  /\bdispatch(?:ed)? to (?:the )?(?:edge|controller|robot|PLC|AMR)\b/gi,
];
const isNegatedOrFuture = (line, matchIndex) => {
  const prefix = line
    .slice(Math.max(0, matchIndex - 120), matchIndex)
    .toLowerCase();
  return (
    /\b(?:no|not|never|without|neither|nor)\b[^.;:]{0,100}$/.test(prefix) ||
    /\b(?:future|would|requires?|disabled|unavailable)\b[^.;:]{0,100}$/.test(
      prefix,
    )
  );
};

for (const path of qualitativeClaimFiles) {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = stripMarkup(rawLine);
    for (const pattern of knownStaleAssertions) {
      if (pattern.test(line)) {
        problems.push(
          `${rel(path)}:${index + 1} contains a prohibited stale assertion: ${pattern.source}.`,
        );
      }
    }
    for (const pattern of unnegatedPhysicalClaims) {
      for (const match of line.matchAll(
        new RegExp(pattern.source, pattern.flags),
      )) {
        if (!isNegatedOrFuture(line, match.index ?? 0)) {
          problems.push(
            `${rel(path)}:${index + 1} overclaims physical dispatch/controller acknowledgement near "${match[0]}".`,
          );
        }
      }
    }
  });
}

const factoryBoundary = await readFile(source.factoryBoundary, "utf8");
for (const required of [
  "simulated policy evaluation",
  "not wired to the Factory Connect API command path",
  "Catalogue/reserved connector definitions",
  "not cryptographic proof that a sensor or controller originated an event",
]) {
  expect(
    factoryBoundary.includes(required),
    `${rel(source.factoryBoundary)} is missing required boundary language: ${required}`,
  );
}

if (problems.length > 0) {
  console.error(
    `Technical report fact check FAILED — ${problems.length} problem(s):`,
  );
  for (const problem of unique(problems)) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Technical report fact check OK — ${facts.permissions} permissions; ` +
    `${facts.migrations} SQL migrations through ${facts.migrationHead}; ` +
    `${facts.migrationCreateTables} migration CREATE TABLE declarations; ` +
    `${facts.controllerSurfaces} API controller surfaces; ` +
    `${facts.modules} modules and ${facts.navigationPermissionReferences} nav permission references; ` +
    `${facts.agents} agents, ${facts.capabilities} capabilities ` +
    `(${facts.sideEffectingCapabilities} side-effecting), ${facts.graphs} graphs; ` +
    `${verifiedTests.total} verified tests (${verifiedTests.platform} platform, ` +
    `${verifiedTests.api} API, ${verifiedTests.database} database, ${verifiedTests.edge} edge, ` +
    `${verifiedTests.web} web); ` +
    `Factory/robotics boundary claims remain simulator-only.`,
);
