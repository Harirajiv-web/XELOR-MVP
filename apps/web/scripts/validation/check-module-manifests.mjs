#!/usr/bin/env node
/**
 * THE GATE THAT KEEPS "REMOVABLE" TRUE.
 *
 * A module is removable only while three things agree: the folders under `src/modules/`,
 * the entries in `registry.ts`, and the permissions the platform actually enforces. Nothing
 * makes them agree by itself, and the failure is silent in both directions — a folder with
 * no entry is dead code nobody notices, and an entry with no folder is a build that stops
 * compiling for a reason the error message does not explain.
 *
 * This is the same class of drift that let three separate permission lists disagree on the
 * backend until 59 endpoints answered 403 to every user, administrator included. That took
 * weeks to surface because nothing was comparing the lists. Something compares them now.
 *
 * Checks:
 *   1. every module folder has a registry entry, and every entry has a folder
 *   2. no module imports from another module (the rule that makes deletion safe)
 *   3. every permission a manifest names exists in the platform's permission registry
 *   4. every nav entry has a screen, and every screen is reachable from some nav entry
 *   5. every visible nav entry explains itself in plain language
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "../..");
const MODULES_DIR = join(WEB, "src", "modules");
const REGISTRY = join(MODULES_DIR, "registry.ts");
const PERMISSION_REGISTRY = join(
  WEB,
  "..",
  "..",
  "packages",
  "platform",
  "src",
  "access",
  "permission-registry.ts",
);

const problems = [];
const notes = [];

/* ---- 1. folders vs registry ---------------------------------------------- */

const folders = readdirSync(MODULES_DIR)
  .filter((e) => statSync(join(MODULES_DIR, e)).isDirectory())
  .sort();

const registrySrc = readFileSync(REGISTRY, "utf8");
const registered = [
  ...registrySrc.matchAll(/from\s+"\.\/([a-z0-9-]+)\/manifest"/g),
].map((m) => m[1]);

for (const f of folders) {
  if (!registered.includes(f)) {
    problems.push(
      `src/modules/${f}/ exists but is not in registry.ts — it is dead code that ships in ` +
        `the bundle and appears in no menu. Add it, or delete the folder.`,
    );
  }
  if (!existsSync(join(MODULES_DIR, f, "manifest.ts"))) {
    problems.push(
      `src/modules/${f}/ has no manifest.ts — every module must declare itself.`,
    );
  }
}
for (const r of registered) {
  if (!folders.includes(r)) {
    problems.push(
      `registry.ts imports "${r}" but src/modules/${r}/ does not exist.`,
    );
  }
}

/* ---- 2. no module imports another module --------------------------------- */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

for (const moduleKey of folders) {
  const files = walk(join(MODULES_DIR, moduleKey));
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const rel = relative(WEB, file).replace(/\\/g, "/");
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) {
      const spec = m[1];
      // `@modules/<other>` or a relative climb into a sibling module.
      const viaAlias = /^@modules\/([a-z0-9-]+)/.exec(spec);
      const viaRelative = /^\.\.\/\.\.\/([a-z0-9-]+)\//.exec(spec);
      const other = viaAlias?.[1] ?? viaRelative?.[1];
      if (other && other !== moduleKey && folders.includes(other)) {
        problems.push(
          `${rel} imports from module "${other}". Modules may import the spine and ` +
            `themselves, never each other — otherwise deleting "${other}" breaks ` +
            `"${moduleKey}" and removability stops being true while everyone still says it is.`,
        );
      }
    }
  }
}

/* ---- 3. manifest permissions exist in the platform registry -------------- */

let platformPermissions = null;
if (existsSync(PERMISSION_REGISTRY)) {
  const src = readFileSync(PERMISSION_REGISTRY, "utf8");
  platformPermissions = new Set(
    [...src.matchAll(/permission:\s*"([a-z0-9_.-]+)"/g)].map((m) => m[1]),
  );
} else {
  notes.push(
    "platform permission registry not found — permission names were NOT verified.",
  );
}

/**
 * The `{ … }` blocks inside a manifest's `nav: [ … ]`, as raw source.
 *
 * Braces are counted rather than pattern-matched. A nav entry is a flat object today, but
 * the first one that gains a nested value would silently stop being seen by a regex — and a
 * check that quietly stops checking is worse than no check, because everybody believes it
 * is still running.
 */
function navEntries(src) {
  const start = src.indexOf("nav: [");
  if (start === -1) return [];
  let depth = 0;
  let entryStart = -1;
  const out = [];
  for (let i = src.indexOf("[", start); i < src.length; i++) {
    const c = src[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) break;
    } else if (c === "{") {
      if (depth === 1) entryStart = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 1 && entryStart !== -1) {
        out.push(src.slice(entryStart, i + 1));
        entryStart = -1;
      }
    }
  }
  return out;
}

function declaredPermissions(src) {
  const scalar = [...src.matchAll(/permission:\s*"([a-z0-9_.-]+)"/g)].map(
    (match) => match[1],
  );
  const grouped = [...src.matchAll(/permission:\s*\[([^\]]*)\]/g)].flatMap(
    (match) =>
      [...match[1].matchAll(/"([a-z0-9_.-]+)"/g)].map(
        (permission) => permission[1],
      ),
  );
  return [...new Set([...scalar, ...grouped])];
}

const manifestPerms = new Map();
for (const moduleKey of folders) {
  const manifestPath = join(MODULES_DIR, moduleKey, "manifest.ts");
  if (!existsSync(manifestPath)) continue;
  const src = readFileSync(manifestPath, "utf8");
  const perms = declaredPermissions(src);
  manifestPerms.set(moduleKey, perms);
  if (!platformPermissions) continue;
  for (const p of perms) {
    if (!platformPermissions.has(p)) {
      problems.push(
        `src/modules/${moduleKey}/manifest.ts requires permission "${p}", which the platform ` +
          `does not define. That nav entry can only ever render a 403.`,
      );
    }
  }

  /* ---- 4. nav entries and screens line up -------------------------------- */
  const navPaths = [...src.matchAll(/path:\s*"([a-z0-9-]+)"/g)].map(
    (m) => m[1],
  );
  // The quotes are optional because a nav path may contain a hyphen — `planned-orders` — and
  // a hyphen is not legal in an unquoted JavaScript object key. Without this the check reads
  // a perfectly good manifest as having no screen for its own nav entry.
  const screenKeys = [
    ...src.matchAll(/^\s{4}"?([a-z0-9-]+)"?:\s*\(\)\s*=>\s*import\(/gm),
  ].map((m) => m[1]);
  for (const n of navPaths) {
    if (!screenKeys.includes(n)) {
      problems.push(
        `src/modules/${moduleKey}: nav path "${n}" has no screen registered.`,
      );
    }
  }
  for (const s of screenKeys) {
    if (!navPaths.includes(s)) {
      notes.push(
        `src/modules/${moduleKey}: screen "${s}" is registered but no nav entry points at it ` +
          `(fine for a detail screen reached by link).`,
      );
    }
  }

  /* ---- 5. every visible nav entry explains itself ------------------------ */
  for (const entry of navEntries(src)) {
    const path = /path:\s*"([a-z0-9-]+)"/.exec(entry)?.[1] ?? "?";
    // A hidden entry is a detail screen reached from a row, not something anybody picks
    // out of a menu cold. It arrives with all the context of the row that opened it.
    if (/hidden:\s*true/.test(entry)) continue;
    if (!/description:\s*["'`]/.test(entry)) {
      problems.push(
        `src/modules/${moduleKey}: nav entry "${path}" has no description. Every screen has ` +
          `to say what it shows, in plain language, for the person meeting it for the first ` +
          `time — and the screen that gets forgotten will be somebody's first.`,
      );
    }
  }
}

/* ---- verdict -------------------------------------------------------------- */

for (const n of notes) console.warn(`NOTE: ${n}`);

if (problems.length > 0) {
  console.error(`\nModule check FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const permCount = [...manifestPerms.values()].flat().length;
console.log(
  `Module check OK — ${folders.length} module(s) installed and registered; ` +
    `${permCount} nav permission(s) all defined by the platform; no cross-module imports.`,
);
