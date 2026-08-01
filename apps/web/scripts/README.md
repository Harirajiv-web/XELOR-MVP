# Web operational scripts

- `build/build-login-theme.mjs` — bundles the Keycloak login backdrop.
- `validation/check-module-manifests.mjs` — validates module folders, registry entries,
  screens and permissions.

Run them through the package scripts `build-login-theme` and `module-check` so their physical
locations can evolve without changing developer commands.
