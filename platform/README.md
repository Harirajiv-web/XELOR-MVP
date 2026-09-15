# Shared platform for XELOR, ONYX and AIKYANTRA

Application source for the [main workspace](../README.md). **XELOR** is the ERP, **ONYX** is the AI intelligence layer, and **AIKYANTRA** is the supplier network. The integrated profile combines them.

| Directory | Responsibility |
|---|---|
| `apps/api` | NestJS API, domain services, connectors and workers |
| `apps/web` | Next.js web application and product profiles |
| `apps/edge` | Bounded edge simulator runtime |
| `packages/platform` | Shared domain rules and contracts |
| `packages/db` | Schema, tenant-scoped database access and migrations |
| `infra` | Deployment and local infrastructure |
| `scripts` | Product profile and setup tooling |
| `docs` | Technical specifications and historical implementation records |

## Development

Use Node 22-24 and pnpm 9 or later. From this directory:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

The Windows workspace launchers in the parent directory handle the existing native setup. See [LOCAL-HOSTING.md](../LOCAL-HOSTING.md); do not run fresh-machine setup against an already configured database.

For a genuinely new environment, create a private `.env` from `.env.example`, configure PostgreSQL 17 with pgvector, Valkey, Keycloak and Gotenberg, then follow the documented setup commands:

```powershell
docker compose -f infra/docker-compose.yml up -d
pnpm setup:local
pnpm db:migrate
```

`setup:local` creates only a permitted `aikyantra_*` database and does not reset an existing one. Migrations must be reviewed before they are applied. Demo population is a separate explicit operation, never part of startup.

Use `../XELOR/start.ps1`, `../ONYX/start.ps1`, `../AIKYANTRA/start.ps1` or `../INTEGRATED/start.ps1` on this Windows machine. The existing numeric profile IDs remain 1-4 with API/web ports 4000/4001, 4100/4101, 4200/4201 and 4300/4301.

## Current references

- [Product naming](../docs/00-governance/03-product-names-and-workspace.md)
- [Product guide](../deliverables/Four-Phase-Product.md)
- [Connectivity contract](docs/07-product/connectivity-contract.md)
- [Sourcing and tenders](docs/04-integrated-product/sourcing-and-tenders.md)
- [Dated implementation verification](../deliverables/Verification-2026-09-07.md)

The previous long platform README and environment notes are preserved in the local `archive/history/` directory and source history. Their old product names, ports and machine-specific instructions are historical.
