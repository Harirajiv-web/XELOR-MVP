import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * THE PALETTE HAS TO STAY READABLE WHEN SOMEBODY MOVES IT.
 *
 * `globals.css` states its measured contrast ratios in prose, and prose does not fail a
 * build. This test exists because that gap was not hypothetical: the navy frame was lifted
 * to lighten the product, every ink token was re-measured against its new ground, and the
 * one pair nobody thought to check was THE ACCENT AS TEXT — `--brand` inside the chrome
 * scope, which draws the active nav label, the active tab and the module icon. It fell to
 * 2.3:1 and was two commits from shipping as an unreadable primary navigation state. The
 * same pair broke again, independently, when the palette moved to blue: a sky label on a
 * sky frame measured 2.60:1. Twice is a pattern, which is why it is pinned here. The palette
 * has since moved a third time, to navy/teal/sky/beige, and this file is why that move was
 * a measurement rather than a hope.
 *
 * The lesson is the shape of the bug, not the specific pair: a token can be safe on the
 * ground it was designed for and illegible on the ground it is USED on, and only the second
 * one matters. So this walks the actual (ink, ground) pairs the product renders, in all
 * three scopes — light, dark, and the chrome that overrides both.
 *
 * FLOORS. 4.5:1 is WCAG AA for body text. 3:1 is AA for non-text indicators such as a focus
 * ring. Below that are structural hairlines, which are not required to meet a contrast floor
 * at all; the values there are the design's own promise that a rule is actually visible on
 * the panel it divides, and are deliberately low.
 */

const CSS = readFileSync(
  join(import.meta.dirname, "..", "..", "app", "globals.css"),
  "utf8",
);

/** Read one rule's custom properties. Selector must match the file byte for byte. */
function tokensOf(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `selector not found in globals.css: ${selector}`);
  let depth = 0;
  let i = CSS.indexOf("{", start);
  const open = i;
  for (; i < CSS.length; i += 1) {
    const char = CSS.charAt(i);
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const out: Record<string, string> = {};
  for (const m of CSS.slice(open + 1, i).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = m;
    if (name && value) out[name] = value.trim();
  }
  return out;
}

/** Follow `var(--x)` chains until a literal hex falls out. */
function resolve(set: Record<string, string>, token: string, depth = 0): string {
  assert.ok(depth < 8, `var() chain too deep at ${token}`);
  const raw = (set[token] ?? "").trim();
  const indirect = raw.match(/^var\((--[a-z0-9-]+)\)$/);
  const next = indirect?.[1];
  if (next) return resolve(set, next, depth + 1);
  assert.match(raw, /^#[0-9a-f]{6}$/i, `${token} does not resolve to a hex colour (got "${raw}")`);
  return raw;
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const one = luminance(a);
  const two = luminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

const light = tokensOf(":root");
const dark = { ...light, ...tokensOf(':root[data-theme="dark"]') };
const chrome = {
  ...light,
  ...tokensOf(".x-shell-sidebar,\n.x-shell-topbar,\n.x-workbench-tabs"),
};

type Pair = [ink: string, ground: string, floor: number];

const SCOPES: ReadonlyArray<[string, Record<string, string>, ReadonlyArray<Pair>]> = [
  ["light theme", light, [
    ["--text-primary", "--bg", 7],
    ["--text-primary", "--surface", 7],
    ["--text-primary", "--surface-data", 7],
    ["--text-secondary", "--bg", 4.5],
    ["--text-muted", "--bg", 4.5],
    ["--text-muted", "--surface", 4.5],
    ["--text-on-brand", "--brand", 4.5],
    ["--brand", "--bg", 4.5],
    ["--border-focus", "--bg", 3],
    ["--border-subtle", "--bg", 1.4],
    // The primary button. Its ink is a separate token from --text-on-brand and was the
    // second pair this file did not cover; white on the first sky fill was 4.25:1.
    ["--action-ink", "--action", 4.5],
    // A hover on a LIGHT page has to go darker. Lightening it is the intuitive move and it
    // degrades the ink on the very control the pointer is over; the first sky hover did
    // exactly that and measured 4.25:1.
    ["--action-ink", "--action-hover", 4.5],
    ["--brand-hover", "--bg", 4.5],
    ["--brand", "--brand-soft", 4.5],
    ["--text-primary", "--surface-sunken", 7],
    ["--gold-ink", "--bg", 4.5],
    ["--gold-ink", "--surface", 4.5],
    ["--gold-line", "--surface", 3],
    ["--gold-mark-ink", "--gold", 4.5],
    ["--good-fg", "--good-bg", 4.5],
    ["--warn-fg", "--warn-bg", 4.5],
    ["--bad-fg", "--bad-bg", 4.5],
    ["--text-on-fill", "--warn-fill", 4.5],
    ["--text-on-fill", "--bad-fill", 4.5],
    ["--ai", "--ai-soft", 4.5],
  ]],
  ["dark theme", dark, [
    ["--text-primary", "--bg", 7],
    ["--text-primary", "--surface", 7],
    ["--text-primary", "--surface-raised", 7],
    ["--text-primary", "--surface-data", 7],
    ["--text-secondary", "--bg", 4.5],
    ["--text-muted", "--bg", 4.5],
    ["--text-muted", "--surface", 4.5],
    ["--text-on-brand", "--brand", 4.5],
    // The accent IS text in this theme — on the page, on a card and on a raised card.
    ["--brand", "--bg", 4.5],
    ["--brand", "--surface", 4.5],
    ["--brand", "--surface-raised", 4.5],
    ["--border-focus", "--bg", 3],
    ["--border-subtle", "--bg", 1.4],
    ["--gold-ink", "--bg", 4.5],
    ["--gold-ink", "--surface-raised", 4.5],
    ["--gold-line", "--surface-raised", 3],
    ["--gold-mark-ink", "--gold", 4.5],
    ["--good-fg", "--good-bg", 4.5],
    ["--warn-fg", "--warn-bg", 4.5],
    ["--bad-fg", "--bad-bg", 4.5],
    ["--text-on-fill", "--warn-fill", 4.5],
    ["--text-on-fill", "--bad-fill", 4.5],
    ["--ai", "--ai-soft", 4.5],
  ]],
  ["chrome — sidebar, topbar and tabs, identical in both themes", chrome, [
    ["--chrome-ink", "--chrome", 4.5],
    ["--chrome-ink", "--chrome-top", 4.5],
    ["--chrome-ink", "--chrome-deep", 4.5],
    ["--chrome-ink", "--chrome-active", 4.5],
    ["--chrome-ink", "--chrome-raised", 4.5],
    ["--chrome-ink", "--chrome-hover", 4.5],
    ["--chrome-ink-soft", "--chrome", 4.5],
    ["--chrome-ink-muted", "--chrome", 4.5],
    ["--chrome-ink-faint", "--chrome", 3],
    // THE PAIR THAT BROKE, TWICE. `--brand` here is the accent, and it is the active
    // nav label — the same hue family as the frame, so only lightness separates them.
    ["--brand", "--chrome", 4.5],
    ["--brand", "--chrome-top", 4.5],
    ["--brand", "--chrome-deep", 4.5],
    ["--brand", "--chrome-active", 4.5],
    ["--brand", "--chrome-raised", 4.5],
    ["--brand", "--chrome-hover", 4.5],
    ["--figure", "--chrome", 4.5],
    ["--border-focus", "--chrome", 3],
    ["--chrome-line", "--chrome", 1.4],
    ["--chrome-line-accent", "--chrome", 2.5],
    ["--gold-line", "--chrome", 3],
  ]],
];

for (const [scope, tokens, pairs] of SCOPES) {
  test(`every ink clears its floor on the ground it is drawn on — ${scope}`, () => {
    const failures: string[] = [];
    for (const [ink, ground, floor] of pairs) {
      const a = resolve(tokens, ink);
      const b = resolve(tokens, ground);
      const ratio = contrast(a, b);
      if (ratio < floor) {
        failures.push(
          `${ink} (${a}) on ${ground} (${b}) is ${ratio.toFixed(2)}:1, below the ${floor}:1 floor`,
        );
      }
    }
    assert.deepEqual(failures, [], `\n  ${failures.join("\n  ")}\n`);
  });
}

test("the accent is never ink on a light surface — the rule the whole palette is built on", () => {
  // Stated at the top of globals.css and easy to undo by accident: full-strength teal
  // (#567C8D) on the beige page is 3.95:1 — close enough to look fine and still under the
  // floor. If a future edit points `--brand` at the raw accent in the LIGHT theme, this
  // catches it; that is the one substitution the prose warns about and nothing else
  // enforced. It is also why `--brand` is a DEEPENED teal rather than the palette's own.
  const brand = resolve(light, "--brand");
  const page = resolve(light, "--bg");
  assert.ok(
    contrast(brand, page) >= 4.5,
    `the light theme's --brand (${brand}) is only ${contrast(brand, page).toFixed(2)}:1 on the page (${page}) — it cannot be used as text`,
  );
});
