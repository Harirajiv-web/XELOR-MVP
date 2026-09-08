import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKSPACES, groupByWorkspace } from "./workspaces";
import { INSTALLED_MODULES } from "@modules/registry";

/**
 * EVERY MODULE HAS A HOME, AND NO WORKSPACE NAMES ONE THAT DOES NOT EXIST.
 *
 * This test exists because the failure it catches is silent. A workspace listing a module
 * key that no module declares matches nothing, and the real module falls through to the
 * "Everything else" group at the bottom of the sidebar — present, clickable, findable, and
 * quietly in the wrong place. Nothing errors. Nothing logs. The build is green.
 *
 * It happened: `workspaces.ts` listed `critical` where the module key is `planning`, and
 * Planning sat under "Everything else" while the sidebar looked entirely correct.
 *
 * It survived a hand-written check, too, which is the more useful lesson. That check
 * extracted each module's key with a first-match regex for `key: "..."`, and
 * `planning/manifest.ts` declares a severity band `{ key: "critical", label: "Critical" }`
 * nineteen lines ABOVE its own manifest key. The check agreed with the bug because it read
 * the source the same wrong way the bug did.
 *
 * So this test imports the actual registry and reads `.key` off the actual objects. No
 * parsing, nothing that can drift from what the application loads at runtime.
 */

const moduleKeys = INSTALLED_MODULES.map((m) => m.key);
const placed = WORKSPACES.flatMap((w) => w.modules);

test("every workspace names a module that exists", () => {
  const ghosts = placed.filter((key) => !moduleKeys.includes(key));
  assert.deepEqual(
    ghosts,
    [],
    `these workspace entries match no module, so the real module is orphaned into ` +
      `"Everything else": ${ghosts.join(", ")}`,
  );
});

test("every module is placed in a workspace", () => {
  const orphans = moduleKeys.filter((key) => !placed.includes(key));
  assert.deepEqual(
    orphans,
    [],
    `these modules would render under "Everything else": ${orphans.join(", ")}`,
  );
});

test("no module is claimed by two workspaces", () => {
  const seen = new Set<string>();
  const dupes = placed.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
  assert.deepEqual(dupes, [], `claimed more than once: ${dupes.join(", ")}`);
});

test("the sidebar stays inside the group budget", () => {
  // Around eight groups is the researched ceiling: fewer forces unrelated concerns into one
  // bucket, more starts costing the cross-references that break a user's flow. This is a
  // guard rail against the slow drift back to a flat list of twenty-three, not a law.
  assert.ok(
    WORKSPACES.length >= 5 && WORKSPACES.length <= 8,
    `${WORKSPACES.length} workspaces — past eight, this is a list again`,
  );
});

test("grouping the real registry produces no 'Everything else'", () => {
  // The end-to-end assertion: whatever the two lists say individually, the function the
  // shell actually calls must not need the orphanage.
  const groups = groupByWorkspace(INSTALLED_MODULES);
  const orphanage = groups.find((g) => g.workspace.code === "other");
  assert.equal(
    orphanage,
    undefined,
    `${orphanage?.modules.map((m) => m.key).join(", ")} fell through to "Everything else"`,
  );
  assert.equal(
    groups.reduce((n, g) => n + g.modules.length, 0),
    INSTALLED_MODULES.length,
    "grouping lost or duplicated a module",
  );
});
