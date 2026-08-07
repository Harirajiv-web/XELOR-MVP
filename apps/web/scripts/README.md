# Web operational scripts

- `build/build-login-theme.mjs` — bundles the Keycloak login backdrop.
- `validation/check-module-manifests.mjs` — validates module folders, registry entries,
  screens and permissions.
- `render-agent-guides.mjs` — generates the plain-language master Agent System guide
  and all eight individual agent guides as HTML and PDF, with page-overflow checks and
  visual proof screenshots.

Run them through the package scripts `build-login-theme` and `module-check` so their physical
locations can evolve without changing developer commands.

Regenerate the agent handbook set with `pnpm --filter @ind-core/web render-agent-guides`.
