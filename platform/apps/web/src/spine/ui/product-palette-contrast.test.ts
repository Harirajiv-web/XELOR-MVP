import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse } from "postcss";
import { ALL_PRODUCT_PROFILES } from "../product/profile";

/**
 * Measure actual declarations, including later overrides and selector specificity.
 * Topbar and tabs inherit page colors; the sidebar remaps them to chrome. Resolve
 * root aliases before inheritance, as CSS does. Reading the first :root rule alone
 * misses these distinctions. This is a token regression check, not a layout audit.
 */
const appDirectory = join(import.meta.dirname, "..", "..", "app");
const stylesheets = ["globals.css", "product-palettes.css"].map((filename) =>
  parse(readFileSync(join(appDirectory, filename), "utf8"), { from: filename }),
);
type Phase = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
type Theme = "light" | "dark";
type Scope = "root" | "x-shell-sidebar" | "x-shell-topbar" | "x-workbench-tabs";
type Tokens = Record<string, string>;
type Pair = readonly [ink: string, ground: string, floor: number];
const products: ReadonlyArray<readonly [Phase, string]> = [
  ["1", "XELOR ERP"], ["2", "ONYX intelligence"],
  ["3", "AIKYANTRA supplier network"], ["4", "Integrated workspace"],
  ["5", "Plant Operations"], ["6", "Quality, Safety & Compliance"],
  ["7", "Warehouse & Dispatch"], ["8", "Planning & Engineering"],
  ["9", "Revenue & Service"], ["10", "Delivery & Managed Services"],
];

function rootMatches(selector: string, phase: Phase, theme: Theme): boolean {
  if (!selector.startsWith(":root")) return false;
  const attributes: Record<string, string> = { "data-product-phase": phase, "data-theme": theme };
  let matches = true;
  const positive = selector.replace(/:not\(\[([a-z-]+)="([^"]+)"\]\)/g,
    (_match, name: string, value: string) => {
      if (attributes[name] === value) matches = false;
      return "";
    });
  const remainder = positive.replace(/\[([a-z-]+)(?:="([^"]+)")?\]/g,
    (_match, name: string, value: string) => {
      if (value === undefined ? !(name in attributes) : attributes[name] !== value) matches = false;
      return "";
    });
  return matches && remainder === ":root";
}

function specificity(selector: string, phase: Phase, theme: Theme, scope: Scope): number | undefined {
  const parts = selector.trim().split(/\s+/);
  const last = parts.at(-1);
  if (scope === "root") {
    if (parts.length !== 1 || !last || !rootMatches(last, phase, theme)) return undefined;
  } else if (last === `.${scope}`) {
    if (parts.length > 2) return undefined;
    if (parts.length === 2 && !rootMatches(parts[0]!, phase, theme)) return undefined;
  } else return undefined;
  // Each supported class, attribute and :root counts once. :not contributes only
  // the specificity of its attribute argument, already counted here.
  return (selector.match(/\.[a-z-]+|\[[^\]]+\]|:root/g) ?? []).length;
}

function computedTokens(phase: Phase, theme: Theme, scope: Scope, parent: Tokens = {}): Tokens {
  const declarations = new Map<string, { value: string; weight: number }>();
  for (const stylesheet of stylesheets) {
    stylesheet.walkRules((rule) => {
      // Palette rules are unconditional; arbitrary media query evaluation belongs
      // to browser checks, not this token resolver.
      if (rule.parent?.type !== "root") return;
      const weights = rule.selectors.flatMap((selector) => {
        const weight = specificity(selector, phase, theme, scope);
        return weight === undefined ? [] : [weight];
      });
      if (!weights.length) return;
      const selectorWeight = Math.max(...weights);
      for (const node of rule.nodes) {
        if (node.type !== "decl" || !node.prop.startsWith("--")) continue;
        const weight = selectorWeight + (node.important ? 1000 : 0);
        if (weight >= (declarations.get(node.prop)?.weight ?? -1)) {
          declarations.set(node.prop, { value: node.value, weight });
        }
      }
    });
  }
  const computed: Tokens = { ...parent };
  const resolving = new Set<string>();
  function resolve(token: string): string {
    const declaration = declarations.get(token);
    if (!declaration) {
      assert.ok(token in parent, `undefined ${token} in ${phase}/${theme}/${scope}`);
      return parent[token]!;
    }
    assert.ok(!resolving.has(token), `circular custom property ${token}`);
    resolving.add(token);
    const raw = declaration.value.trim();
    const value = raw === "inherit" || raw === "unset" ? parent[token]!
      : raw.replace(/var\((--[a-z0-9-]+)\)/g, (_match, name: string) => resolve(name));
    resolving.delete(token);
    assert.ok(value !== undefined, `${token} inherits an undefined value`);
    return value;
  }
  for (const token of declarations.keys()) computed[token] = resolve(token);
  return computed;
}

function hex(tokens: Tokens, token: string): string {
  const value = tokens[token] ?? "";
  assert.match(value, /^#[0-9a-f]{6}$/i, `${token} does not resolve to a hex color: ${value}`);
  return value;
}
function luminance(color: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5]
    .map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function verifyPairs(tokens: Tokens, pairs: readonly Pair[]): void {
  const failures: string[] = [];
  for (const [ink, ground, floor] of pairs) {
    const foreground = hex(tokens, ink);
    const background = hex(tokens, ground);
    const ratio = contrast(foreground, background);
    if (ratio < floor) {
      failures.push(`${ink} (${foreground}) on ${ground} (${background}) is ${ratio.toFixed(2)}:1; requires ${floor}:1`);
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
}

const pagePairs: readonly Pair[] = [
  ...["--bg", "--surface", "--surface-raised", "--surface-sunken", "--surface-data"]
    .map((surface): Pair => ["--text-primary", surface, 7]),
  ...["--bg", "--surface", "--surface-raised"].flatMap((surface): Pair[] => [
    ["--text-secondary", surface, 4.5], ["--text-muted", surface, 4.5],
    ["--brand", surface, 4.5], ["--border-focus", surface, 3],
    ["--action-border", surface, 3],
  ]),
  ["--text-on-brand", "--brand", 4.5],
  ["--action-ink", "--action", 4.5], ["--action-ink", "--action-hover", 4.5],
  ["--brand-hover", "--bg", 4.5], ["--brand", "--brand-soft", 4.5],
  ["--border-focus", "--brand-soft", 3], ["--border-subtle", "--bg", 1.4],
  ["--gold-ink", "--bg", 4.5], ["--gold-ink", "--surface-raised", 4.5],
  ["--gold-line", "--surface-raised", 3], ["--gold-mark-ink", "--gold", 4.5],
  ["--good-fg", "--good-bg", 4.5], ["--warn-fg", "--warn-bg", 4.5],
  ["--bad-fg", "--bad-bg", 4.5], ["--text-on-fill", "--warn-fill", 4.5],
  ["--text-on-fill", "--bad-fill", 4.5], ["--ai", "--ai-soft", 4.5],
];
const sidebarPairs: readonly Pair[] = [
  ...["--chrome", "--chrome-top", "--chrome-deep", "--chrome-active", "--chrome-raised", "--chrome-hover"]
    .flatMap((surface): Pair[] => [
      ["--chrome-ink", surface, 4.5], ["--brand", surface, 4.5], ["--border-focus", surface, 3],
    ]),
  ["--chrome-ink-soft", "--chrome", 4.5], ["--chrome-ink-muted", "--chrome", 4.5],
  ["--chrome-ink-faint", "--chrome", 4.5], ["--figure", "--chrome", 4.5],
  ["--chrome-line", "--chrome", 1.4], ["--chrome-line-accent", "--chrome", 2.5],
  ["--gold-line", "--chrome", 3], ["--text-on-brand", "--brand", 4.5],
  ["--text-on-accent", "--ok", 4.5], ["--text-on-accent", "--warn", 4.5],
  ["--text-on-accent", "--bad", 4.5],
];

for (const [phase, name] of products) {
  for (const theme of ["light", "dark"] as const) {
    const page = computedTokens(phase, theme, "root");
    test(`${name}: ${theme} page text, actions, status and focus contrast`, () => {
      verifyPairs(page, pagePairs);
      if (phase === "1") {
        // XELOR's hero, process icons and hovered quick cards use a gold wash.
        // Check their actual small-text inks and control outlines on that surface.
        verifyPairs(page, [
          ["--text-primary", "--gold-soft", 7], ["--text-secondary", "--gold-soft", 4.5],
          ["--text-muted", "--gold-soft", 4.5], ["--brand", "--gold-soft", 4.5],
          ["--gold-ink", "--gold-soft", 4.5], ["--gold-line", "--gold-soft", 3],
          ["--border-focus", "--gold-soft", 3], ["--action-border", "--gold-soft", 3],
        ]);
      }
    });
    test(`${name}: ${theme} sidebar navigation and focus contrast`, () => {
      const sidebar = computedTokens(phase, theme, "x-shell-sidebar", page);
      verifyPairs(sidebar, sidebarPairs);
      if (phase === "1") {
        // Selected navigation and the brand mark now have a solid gold fill.
        verifyPairs(sidebar, [
          ["--nav-active-ink", "--nav-active-fill", 4.5],
          ["--nav-active-fill", "--chrome", 3],
        ]);
      }
    });
    test(`${name}: ${theme} topbar and tabs use readable page colors`, () => {
      for (const scope of ["x-shell-topbar", "x-workbench-tabs"] as const) {
        const tokens = computedTokens(phase, theme, scope, page);
        for (const token of ["--surface", "--text-primary", "--text-muted", "--brand", "--brand-soft", "--border-focus"]) {
          assert.equal(tokens[token], page[token], `${scope} should inherit ${token} from the page`);
        }
        verifyPairs(tokens, [
          ["--text-primary", "--surface", 7], ["--text-muted", "--surface", 4.5],
          ["--brand", "--brand-soft", 4.5], ["--border-focus", "--surface", 3],
        ]);
      }
    });
  }
}
test("the three products retain distinct sidebar and action palettes in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    const palettes = products.slice(0, 3).map(([phase]) => computedTokens(phase, theme, "root"));
    for (const token of ["--chrome", "--brand", "--action"]) {
      assert.equal(new Set(palettes.map((tokens) => hex(tokens, token).toLowerCase())).size, 3,
        `${token} must distinguish all three products in ${theme} mode`);
    }
  }
});
test("AIKYANTRA keeps a light cream/gold sidebar and a readable dark counterpart", () => {
  const light = computedTokens("3", "light", "root");
  const dark = computedTokens("3", "dark", "root");
  assert.ok(luminance(hex(light, "--chrome")) > 0.6, "supplier network light sidebar should remain cream/gold");
  assert.ok(luminance(hex(dark, "--chrome")) < 0.1, "supplier network dark sidebar should remain dark");
});

test("installed app metadata follows each product's actual light palette", () => {
  for (const profile of ALL_PRODUCT_PROFILES) {
    const palette = computedTokens(profile.phase, "light", "root");
    assert.equal(profile.themeColor.toLowerCase(), hex(palette, "--chrome").toLowerCase(), `${profile.name} theme color`);
    assert.equal(profile.backgroundColor.toLowerCase(), hex(palette, "--bg").toLowerCase(), `${profile.name} background color`);
    assert.equal(profile.accent.toLowerCase(), hex(palette, "--brand").toLowerCase(), `${profile.name} brand color`);
  }
});
