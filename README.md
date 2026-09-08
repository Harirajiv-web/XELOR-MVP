# AIKYANTRA — four products, one manufacturing platform

The workspace now contains four launchable products. Their implementation lives in `platform/`, so shared improvements reach every phase.

The latest source and design for all four products are maintained together on `main` in [Harirajiv-web/XELOR-MVP](https://github.com/Harirajiv-web/XELOR-MVP). The older phase branches remain available as historical snapshots.

| Phase | Product | Purpose | Local application |
|---|---|---|---|
| 1 | ONYX ERP | Engineering, quotations, sales, purchasing, stock, production, quality, maintenance, people and finance | http://localhost:4001 |
| 2 | XELOR AI layer | Connect manufacturing systems; ask questions with source evidence; assess commitments, recovery options and outcomes | http://localhost:4101 |
| 3 | SOURCE supplier network | Suppliers, RFQs, quote links, multi-line tenders, technical gates, awards and supplier performance | http://localhost:4201 |
| 4 | AIKYANTRA integrated | All three in one workspace, sharing business records and governed workflows | http://localhost:4301 |

```text
phase-1-erp/                 ERP product launcher and definition
phase-2-ai/                  Intelligence product launcher and definition
phase-3-supplier-network/    Supplier product launcher and definition
phase-4-integrated/          Complete product launcher and definition
platform/                   Canonical NestJS + Next.js + PostgreSQL implementation
docs/                       Architecture and governance
deliverables/               Product guide, comparison and verification evidence
archive/                    Local historical snapshots (excluded from Git)
```

## Run the products

```bash
./run-phase.sh 4             # API + responsive web app in development mode
./run-phase.sh 1             # run another phase in a second terminal
./run-phase.sh 2 build       # compile an individual product
./run-phase.sh 2 start       # serve the compiled product
./run-phase.sh stop          # stop processes created by these launchers
```

Starting a phase preserves its data. The four local profiles use the new, dedicated `aikyantra_demo` database. Original demo databases remain separate. Separate customer deployments can configure separate databases; phase 4 integrates the modules in one tenant and database.

## First setup on another machine

Clone the complete repository, including all four phase folders and `platform/`. Run the phase launchers from the repository root; run `pnpm` commands from `platform/`. GitHub CI lives in `.github/workflows/ci.yml` at the repository root and runs its checks and container builds from `platform/`.

Use Node 22–24 and pnpm 9 or later. Copy `platform/.env.example` to `platform/.env`; keep private credentials out of source control. Start PostgreSQL 17 with pgvector, Valkey, Keycloak and Gotenberg using `platform/infra/docker-compose.yml` (`docker compose`, or `docker-compose` where installed). The compose stack uses the existing `ind-core` volume name: do not delete volumes during an upgrade.

```bash
cd platform
pnpm install --frozen-lockfile
pnpm setup:local             # creates only an aikyantra_* database; never resets one
pnpm db:migrate
node scripts/phase.mjs 4 build
node scripts/phase.mjs 4 start
```

To populate an **isolated demo**, enable `API_PUBLIC_DEMO=true` and `NEXT_PUBLIC_PUBLIC_DEMO=true` in its environment before building/starting, then run `DEMO_PUBLIC_MODE=true API_BASE=http://127.0.0.1:4300 pnpm demo:seed-all` in another terminal. Keep those flags false for a real customer deployment. On an already imported Keycloak realm, add the new application origins and `/callback` URLs to the `indcore-web` client; the updated realm JSON includes them for fresh imports. The example environment leaves them false.

## Phone and laptop

The same responsive web application works on both. On this computer’s current network, open `http://192.168.0.48:4301/home` from a phone on the same Wi-Fi (the IP can change). Phone navigation has a drawer and bottom shortcuts; both devices read the same server records. A web app manifest and service worker provide installation and an offline reconnect screen. Installation on a physical phone requires a trusted HTTPS URL; this workspace does not contain native App Store or Play Store packages. Offline writes are not implemented.

## Read next

- [Product map and user journeys](deliverables/Four-Phase-Product.md)
- [Competitor comparison and practical differentiation](deliverables/Competitive-Positioning.md)
- [Architecture decision](docs/00-governance/02-four-product-consolidation.md)
- [Connected-system contract](platform/docs/07-product/connectivity-contract.md)
- [Supplier and tender behavior](platform/docs/04-integrated-product/sourcing-and-tenders.md)
- [Verification report](deliverables/Verification-2026-09-07.md)

Earlier decks describe the historical five-phase prototype. The documents linked above describe this implementation.
