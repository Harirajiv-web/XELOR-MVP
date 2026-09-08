// Flat ESLint config (ESLint 9). Enforces the DECISIONS-V2 §1.1 rule mechanically:
// "Module boundaries are enforced mechanically, not by convention ... Boundary
//  violations must fail CI ... wired in sprint 1, not 'later'."
//
// Element model:
//   platform  -> packages/platform  (the bootstrap; may depend on nothing internal)
//   db        -> packages/db        (schema/migrations; may depend on platform only)
//   module    -> apps/api/src/modules/<name>  (one ERP domain each)
//   app       -> apps/api/src (everything else: bootstrap, common)
//
// The load-bearing rule: a `module` may import platform + db + ITS OWN module only.
// Cross-module access must go through a sibling module's public `index.ts`
// (exported service interface) or an outbox event — never a deep import.

import boundaries from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/migrations/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tsParser, ecmaVersion: 2023, sourceType: "module" },
    plugins: { boundaries, import: importPlugin },
    settings: {
      // A TS-aware resolver is REQUIRED for the boundary rules to bite: without it
      // the plugin can't resolve .js->.ts imports and silently classifies nothing.
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["apps/*/tsconfig.json", "packages/*/tsconfig.json"],
        },
      },
      "boundaries/elements": [
        { type: "platform", pattern: "packages/platform/src/**" },
        { type: "db", pattern: "packages/db/src/**" },
        {
          type: "module",
          pattern: "apps/api/src/modules/*/**",
          capture: ["moduleName"],
          mode: "full",
        },
        { type: "app", pattern: "apps/api/src/**" },
      ],
    },
    rules: {
      "boundaries/no-unknown": "off",
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // platform is the floor — depends on nothing internal
            { from: "platform", allow: ["platform"] },
            // db builds on platform only
            { from: "db", allow: ["platform", "db"] },
            // a module may use platform, db, shared app infrastructure (common/), and
            // only its OWN module — never a sibling business module.
            {
              from: "module",
              allow: [
                "platform",
                "db",
                "app",
                ["module", { moduleName: "${from.moduleName}" }],
              ],
            },
            // app bootstrap may wire everything
            { from: "app", allow: ["platform", "db", "module", "app"] },
          ],
        },
      ],
      // packages may never import from the app; enforced structurally too
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            { target: "./packages", from: "./apps", message: "packages must not depend on apps." },
            {
              target: "./packages/platform",
              from: "./packages/db",
              message: "platform is the foundation; it must not depend on db.",
            },
          ],
        },
      ],
    },
  },
  {
    // ESLint resolves one flat config from the workspace root. The web package also keeps
    // its focused config for package-local runs, but the root CI command must register the
    // rules named by web source comments too.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
];
