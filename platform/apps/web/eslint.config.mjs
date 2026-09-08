import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

/**
 * The web app's boundary rules — the same mechanism the API uses, for the same reason.
 *
 * `src/modules/inventory/` may import from `src/spine/` and from itself. It may not import
 * from `src/modules/sales/`. That single rule is what makes a module folder deletable: the
 * moment one module reaches into another, removing the second breaks the first, and
 * "removable" quietly stops being true while everyone carries on saying it.
 *
 * The rule points the other way too — the SPINE may not import a module. A spine that knew
 * about Inventory would have to be edited every time a module was added or removed, which
 * is precisely the coupling this arrangement exists to prevent.
 *
 * One exception, and it is deliberate: `src/modules/registry.ts` imports every installed
 * manifest. That file IS the list of installed modules, so it is the one place the coupling
 * belongs, and `pnpm module-check` verifies it matches the folders on disk.
 */
export default [
  {
    ignores: ["**/.next/**", "**/node_modules/**", "next-env.d.ts", "scripts/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { boundaries, "react-hooks": reactHooks },
    settings: {
      "boundaries/elements": [
        { type: "spine", pattern: "src/spine/**" },
        {
          type: "module",
          pattern: "src/modules/*/**",
          capture: ["moduleName"],
          mode: "full",
        },
        // The registry is its own element type: it is allowed to import every module, and
        // nothing else is.
        { type: "registry", pattern: "src/modules/registry.ts", mode: "full" },
        { type: "app", pattern: "src/app/**" },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "boundaries/no-unknown": "off",
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // The spine is the floor. It may use itself and the registry (to assemble the
            // navigation), and it must never reach into a specific module.
            { from: "spine", allow: ["spine", "registry"] },
            // A module may use the spine and ITSELF. Never a sibling.
            {
              from: "module",
              allow: ["spine", ["module", { moduleName: "${from.moduleName}" }]],
            },
            // The registry exists to know about every module.
            { from: "registry", allow: ["module", "spine"] },
            // Routes compose everything.
            { from: "app", allow: ["spine", "module", "registry"] },
          ],
        },
      ],
    },
  },
];
