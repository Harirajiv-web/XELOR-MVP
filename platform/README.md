# AIKYANTRA platform

Canonical implementation for four products: ONYX ERP, XELOR connected intelligence, SOURCE supplier network and integrated AIKYANTRA. See the [workspace guide](../README.md) and [product map](../deliverables/Four-Phase-Product.md).

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:migrate
node scripts/phase.mjs 4 build
node scripts/phase.mjs 4 start
```

The phase launcher sets API/web ports and product capabilities. It preserves data. `.env.example` contains configuration templates; use a private `.env` locally. The demo database is deliberately separate from all five original databases.

## Source

- `apps/api`: NestJS modular API, profile gate, authentication and permissions.
- `apps/web`: Next.js responsive application, profile navigation, module screens and PWA assets.
- `packages/platform`: shared contracts and domain rules.
- `packages/db`: tenant-scoped schema, migrations and database helpers.
- `apps/edge`: retained edge-runtime foundation.
- `scripts/phase.mjs`: four-product build/start/stop entry point.
- `docs/07-product/connectivity-contract.md`: actual connector capabilities and constraints.
- `docs/04-integrated-product/sourcing-and-tenders.md`: supplier workflow and provider configuration.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm module-check
pnpm db:rls-check
pnpm db:perm-check
pnpm db:naming-check
DEMO_PUBLIC_MODE=true API_BASE=http://127.0.0.1:4300 pnpm demo:tenders
DEMO_PUBLIC_MODE=true API_BASE=http://127.0.0.1:4300 node apps/api/scripts/diagnostics/verify-connectivity.mjs
```

The last two commands add clearly identified verification fixtures to an isolated demo. They do not send live supplier messages. Existing historical report-generation scripts remain available, but those earlier reports describe the original prototype; the current product and verification documents are in `../deliverables`.
