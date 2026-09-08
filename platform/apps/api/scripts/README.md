# API operational scripts

Scripts are grouped by purpose and use ordered names only where execution sequence matters.

## `demo/`

1. `01-seed-base-world.mjs` — builds the canonical §7 demo universe.
2. `02-seed-northstar-story.mjs` — layers the investor story over the base world.

Use the stable root commands `pnpm demo:seed`, `pnpm demo:northstar` and
`pnpm demo:rebuild`; callers should not depend on the physical script paths.

## `shared/`

- `demo-client.mjs` — authentication, idempotent HTTP calls and step-runner plumbing shared
  by both seeders.

## `diagnostics/`

- `inspect-maintenance-task.mjs` — focused maintenance task API inspection. This mutates the
  named demo work order and is not part of normal setup.
