# XELOR, ONYX and AIKYANTRA

This is the main working directory for three products, with one shared implementation in `platform/`.

| Product folder | Product | Purpose | Web / API |
|---|---|---|---|
| [XELOR](XELOR/README.md) | **XELOR phase 2** | Manufacturing ERP and system of record | 4001 / 4000 |
| [ONYX](ONYX/README.md) | **ONYX** | AI intelligence over ERP and connected business evidence | 4101 / 4100 |
| [AIKYANTRA](AIKYANTRA/README.md) | **AIKYANTRA** | Supplier network, RFQs, quotations and sourcing | 4201 / 4200 |
| [INTEGRATED](INTEGRATED/README.md) | Integrated workspace | Combined access to all three products | 4301 / 4300 |
| [PLANT-OPERATIONS](PLANT-OPERATIONS/README.md) | Plant Operations | Machine signals, maintenance and energy on one asset register | 4401 / 4400 |
| [QUALITY-SAFETY](QUALITY-SAFETY/README.md) | Quality, Safety & Compliance | One corrective-action engine for defects and incidents | 4501 / 4500 |
| [WAREHOUSE-DISPATCH](WAREHOUSE-DISPATCH/README.md) | Warehouse & Dispatch | One handling unit from gate to truck | 4601 / 4600 |
| [PLANNING-ENGINEERING](PLANNING-ENGINEERING/README.md) | Planning & Engineering | One BOM and capacity model; engineering change control | 4701 / 4700 |
| [REVENUE-SERVICE](REVENUE-SERVICE/README.md) | Revenue & Service | Quoting and costing, then warranty, spares and field service | 4801 / 4800 |
| [DELIVERY-SERVICES](DELIVERY-SERVICES/README.md) | Delivery & Managed Services | Implementation, integration, commissioning and support | 4901 / 4900 |

The last six are the connected packages of **Project X** — the technology spine for Indian
manufacturing. Each is its own product, never a bundle containing everything, and each reads
and writes the same tenant-isolated database as the XELOR ERP through the same API,
permission and RLS rules. See [the architecture note](docs/00-governance/04-project-x-architecture.md).

These names follow the owner's instruction of 11 September 2026. The integrated workspace is a combined view, not a fourth brand. Historical PDFs and older branches use previous names.

**XELOR phase 2** names the current ERP edition. It keeps technical launch profile **1**, including `-Phase 1`, its build directory and ports 4001/4000. Numeric profile **2** remains ONYX. The archived `xelor-phase-2` checkout is historical source, separate from this current edition.

```text
XELOR-MVP/
  XELOR/         ERP definition and launcher
  ONYX/          AI intelligence definition and launcher
  AIKYANTRA/     Supplier network definition and launcher
  INTEGRATED/    Combined workspace launcher
  platform/      Shared API, web, domain packages, database and infrastructure
  docs/          Architecture and product decisions
  deliverables/  Product guides and dated verification evidence
  output/        Existing PDFs and analysis, with their original filenames
  research/      Original supplier research and source evidence
  archive/       Local historical source snapshots and former runtime files
```

## Start a product on this Windows machine

```powershell
.\XELOR\start.ps1
.\ONYX\start.ps1
.\AIKYANTRA\start.ps1
.\INTEGRATED\start.ps1
```

Each launcher uses its own ports and the same local `aikyantra_demo` database. Starting a product preserves data. For build, stop, prerequisites and runtime details, read [LOCAL-HOSTING.md](LOCAL-HOSTING.md). Current private configuration lives in `platform/.env`; do not copy old root configuration over it.

Shared development commands run from `platform/`:

```powershell
cd platform
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

For a fresh machine, follow [platform setup](platform/README.md). Applied database migrations, phase IDs, permissions, storage keys and legacy integration configuration names remain compatible. Product folders select a profile; application changes belong in `platform/`.

## Read next

- [Interactive ERP and add-on ecosystem diagram](deliverables/xelor-ecosystem.html)
- [Product naming and workspace decision](docs/00-governance/03-product-names-and-workspace.md)
- [Workspace reorganization and verification](deliverables/Workspace-Reorganization-2026-09-11.md)
- [Product color system](deliverables/Product-Color-System-2026-09-11.md)
- [Product capabilities and journeys](deliverables/Four-Phase-Product.md)
- [Architecture decision](docs/00-governance/02-four-product-consolidation.md)
- [Connected-system contract](platform/docs/07-product/connectivity-contract.md)
- [Supplier and tender behavior](platform/docs/04-integrated-product/sourcing-and-tenders.md)
- [Output and historical PDF index](output/README.md)

The former `xelor-phase-2` checkout and previous integrated baseline are preserved as ZIP snapshots in `archive/history/`. Related worktrees outside this directory remain historical references. This directory is the active workspace for the new naming.
