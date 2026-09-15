# XELOR project — session memory and Claude handoff

Prepared 12 September 2026, Asia/Calcutta. Covers the organization, research, design, local hosting and XELOR phase 2 work in this conversation. This is a continuation document, not a claim that every research idea has been implemented.

## Start here

The latest implementation request has been completed: **XELOR phase 2 is the new ERP-only edition**, built on the existing application and hosted at **http://localhost:4001**. It has a dedicated maroon-and-gold workspace, simpler navigation, company-persisted layout settings and internal supplier performance in Purchasing. Existing business data was preserved.

The user's final request was to create this Markdown memory file so Claude can continue from this point. No new feature beyond that request is currently being implemented. Continue with the user's next instruction; do not automatically build all the surrounding ecosystem products.

**The most important naming distinction: “XELOR phase 2” is an edition name. It still uses technical runtime profile 1. Technical profile 2 belongs to ONYX.** Do not change numeric profiles, ports or integration contracts to match the edition name.

Suggested prompt to give Claude with this file:

> Read this handoff and inspect the current repository before editing. Continue from the existing XELOR phase 2 ERP, preserving the current work and database. Follow AGENTS.md and the current product mapping. Keep ONYX, AIKYANTRA and the other optional products outside the ERP edition unless I ask to add them. Treat the research catalogue as a mixture of existing foundations and proposed work, not as completed features. Use my next request to choose what to implement.

This file carries context, not the application source or database. Claude needs access to the same project, or a separately supplied copy, to continue implementation. No private credentials are included here.

## 1. What the user decided

The requests developed in this order:

1. Review the existing project and output research PDFs.
2. Organize the workspace around **XELOR = ERP**, **ONYX = AI intelligence**, and **AIKYANTRA = supplier network**.
3. Run the products locally.
4. Give each product a distinct professional palette using maroon, navy, gold, light blue, cream, white and yellow.
5. Exchange the ONYX and Integrated themes, then increase the amount of gold in XELOR.
6. Make ERP the main product: simple to navigate, adaptable to different industries, with optional products and services around it.
7. Use the PDFs to identify missing features, better ways to expose existing features, and offerings that could be sold separately alongside ERP.
8. Explain the findings in simple chat language rather than making another PDF.
9. Create an HTML ecosystem diagram with XELOR in the centre, then expand it using the actual research PDFs.
10. Implement only the new ERP from that direction, call it **XELOR phase 2**, and host it locally. Do not add the surrounding components to this edition.
11. Create this Markdown session memory for Claude.

The core product principle is to make everyday business work obvious and connected. A feature buried in a module or column should become discoverable through useful navigation, search and workflow entry points. Optional applications must not make the basic ERP unnecessarily complicated.

The aspiration is industry customization. The implementation so far supplies presentation presets around the existing ERP; it does not yet make the ERP a complete solution for every industry.

## 2. Repository, product mapping and rules

Workspace: `C:\ORGANISED\XELOR-MVP`, native Windows PowerShell.

| Product | Entry folder | Technical profile | Local web | Local API |
|---|---|---|---|---|
| XELOR phase 2 ERP | `XELOR/` | 1 | http://localhost:4001 | http://localhost:4000 |
| ONYX AI intelligence | `ONYX/` | 2 | http://localhost:4101 | http://localhost:4100 |
| AIKYANTRA supplier network | `AIKYANTRA/` | 3 | http://localhost:4201 | http://localhost:4200 |
| Integrated workspace | `INTEGRATED/` | 4 | http://localhost:4301 | http://localhost:4300 |

`platform/` is the maintained application source. The four product folders contain definitions and launchers, not independent copies of the application. Shared source is selected through product profiles.

Read these before changing architecture, launch behavior or branding:

- [Repository instructions](AGENTS.md), [existing Claude context](CLAUDE.md), [root README](README.md).
- [Local hosting](LOCAL-HOSTING.md) and [platform instructions](platform/CLAUDE.md).
- [Binding platform decisions](docs/00-governance/01-binding-platform-decisions-v2.md).
- [Four-product consolidation](docs/00-governance/02-four-product-consolidation.md).
- [Product names and workspace decision](docs/00-governance/03-product-names-and-workspace.md).

Preserve tenant RLS, registered permissions, domain-owned writes and ports, transactional audit/outbox behavior, approvals and idempotency. A UI preference must never grant a permission or change a licence.

Keep existing numeric phase IDs, ports, database names, applied migration files, source IDs, agent identities, permission codes, authentication storage keys and environment contracts stable. Legacy `ONYX_*`, `SOURCE_*` and `XELOR_*` identifiers are compatibility contracts, not authoritative display names. In particular, `PHASE_2_ERP_ORIGIN` still connects ONYX to the XELOR ERP API on port 4000. Do not mechanically swap identifiers to match branding.

Git snapshot when this handoff was written:

- Branch: `organize/product-names`.
- HEAD: `2e4490b` — `Publish four-product AIKYANTRA platform and updated design`.
- The working tree contains many local modifications and untracked files. The four Bash launcher renames are staged to preserve executable modes. Other work is largely unstaged.
- Session changes remain uncommitted; no remote branch was changed. Inspect the actual diff before deciding ownership of individual changes.
- Do not discard, reset or clean the working tree. A clean checkout of HEAD alone will not include this work.

Private current configuration is in `platform/.env`. Preserve it without copying its contents into documentation. Preserve the dedicated `aikyantra_demo` database and legacy `indcore*` databases. No database reset or seeding is part of ordinary startup or verification.

## 3. Organization and earlier local hosting work

The workspace was consolidated onto the shared four-product platform baseline. Former phase-named entry folders became `XELOR`, `ONYX`, `AIKYANTRA` and `INTEGRATED`. Current documentation, visible product text, launch messages, icons and product metadata were aligned with the user's naming.

The previous phase-2 source baseline (`13e8ecf`) and integrated source baseline were preserved as ZIP archives in `archive/history/`. Former root runtime/dependency/configuration material was preserved under `archive/legacy-xelor-phase-2-runtime/`. These are historical backups, not the maintained application. Some archived configuration is private; do not share the archive indiscriminately.

Two upstream `UI:UX.md` paths remain excluded by Windows sparse-checkout because Windows cannot materialize those filenames. Their content remains in Git and the integrated-baseline archive. Do not undo that sparse-checkout arrangement casually.

Native `build-local.ps1`, `start-local.ps1` and `stop-local.ps1` scripts were added, with per-product PowerShell wrappers. They use this machine's portable tooling, preserve the database and validate process ownership. Background services start hidden. Stopping a product stops only its validated process tree and leaves PostgreSQL running.

Detailed dated record: [Workspace reorganization and verification](deliverables/Workspace-Reorganization-2026-09-11.md). That document describes the earlier reorganization checkpoint; its statement that services had not been started was superseded by the subsequent hosting work.

## 4. Final visual identities

| Product | Current direction | Representative colors |
|---|---|---|
| XELOR | Maroon, prominent gold, ivory/cream | Navigation `#4B1D30`, action gold `#D8AF55`, selected gold `#E2BC6A`, page `#F8F4EF` |
| ONYX | Navy and ivory, maroon/gold accents | Navigation `#1E3048`, page `#F7F5EF`, main action `#233F62` |
| AIKYANTRA | Warm cream, gold and bronze | Navigation `#F2E6C9`, page `#FBF8EF`, dark bronze text and boundaries |
| Integrated | Cool navy, light blue, cool white | Navigation `#102846`, page `#F3F7FC`, blue accents |

The ONYX and Integrated themes above are the **final exchanged versions**, including light/dark tokens, metadata and icon colors. XELOR subsequently received more gold in actions, navigation, branding, overview surfaces and KPI accents.

Shared product tokens live in `platform/apps/web/src/app/product-palettes.css`; the new ERP workspace styling lives in `platform/apps/web/src/app/xelor-phase2.css`. Root layout imports them. There are distinct product SVGs under `platform/apps/web/public/icons/`, plus updated manifest/offline/login branding. Retain semantic status colors and usable contrast.

See [Product color system](deliverables/Product-Color-System-2026-09-11.md) for the dated palette checks. Token contrast checks passed, but they are not a full rendered-page accessibility certification.

## 5. Research PDFs and what we learned

All five existing output PDFs were preserved with their original names and contents:

| File | Use |
|---|---|
| [01_Manufacturing_Supplier_Research.pdf](output/pdf/01_Manufacturing_Supplier_Research.pdf) | Primary supplier/company research, 12 pages; referred to below as R1 |
| [02_AIKYANTRA_XELOR_Opportunity_and_Roadmap.pdf](output/pdf/02_AIKYANTRA_XELOR_Opportunity_and_Roadmap.pdf) | Opportunity and implementation roadmap, 24 pages; R2 |
| [Combined marketplace/mobile blueprint](output/pdf/XELOR_COMBINED_MARKETPLACE_MOBILE_SOLUTION_BLUEPRINT.pdf) | Earlier solution blueprint |
| [Demo upgrade technical blueprint](output/pdf/XELOR_DEMO_UPGRADE_TECHNICAL_IMPLEMENTATION_BLUEPRINT.pdf) | Earlier implementation plan |
| [Three solutions overview](output/pdf/XELOR_Three_Solutions_Overview.pdf) | Earlier product overview |

The detailed ecosystem expansion reviewed all 36 pages of R1 and R2. Historical report branding and the older checkout assessed in R2 must not override the current names or current code. Vendor brochure claims are research inputs, not verified XELOR results or confirmed partnerships.

Original inputs and research records are under `research/2026-09-10_manufacturing_market/`. The [output index](output/README.md) explains the PDFs. Current source-aware analyses are:

- [Research-to-service map](output/analysis/evidence/services/research-service-map.md).
- [Implementation readiness](output/analysis/evidence/services/implementation-readiness.md).
- [Platform and discovery audit](output/analysis/evidence/services/platform-and-discovery.md).
- [Earlier PDF/project assessment](output/analysis/XELOR_PDF_and_Project_Assessment_2026-09-11.md), which predates the latest ERP changes.

These audits also predate the final company-layout persistence and internal supplier-performance implementation. Where an audit describes those features as missing or hidden solely in the network, use the current source and section 7 of this handoff for the updated state.

Research themes and likely product boundaries:

| Source | Useful ideas | Interpretation for this product |
|---|---|---|
| R1 p2, CommerceCX / ScaleFluidly | RFQ/CPQ, costing, revisions, logistics load planning, NPI/project gates | Keep ordinary quotations in ERP; deeper quoting, logistics optimization and project tooling can be optional applications |
| R1 p3, AnjX | Demand forecasts, stock/cash visibility, finite-capacity scenarios | Keep basic MRP and visibility in ERP; advanced planning is a possible add-on |
| R1 p4, Slooze | Discovery, qualification, RFQs, contracts, budgets, payments, customs and supplier risk | AIKYANTRA is the external supplier network; internal vendor records and purchase evidence remain ERP responsibilities |
| R1 p5, Tomax / D3Minds | MES, warehouse execution, eKanban, kitting, CAPA, calibration, SPC/FMEA, audit/training, ECO, maintenance | A mixture of ERP foundations and separate advanced factory, quality, warehouse, engineering and maintenance offerings |
| R1 p6, Zeliot Condense | Industrial data connectors, streaming, governance, freshness and recovery | Integration/data platform opportunity; do not claim physical machine connectivity has been proven |
| R1 p7, Adventis OptiMES | OEE, maintenance, energy, EHS/PPE/permits, edge gateways | Optional factory/energy/safety applications, with real hardware and operational validation still required |
| R1 p8, Controlsoft | Site surveys, instrumentation, PLC/SCADA, installation, commissioning, training | Delivery and engineering services; often partner-assisted rather than pure software features |
| R1 p9, RheinBrücke / Epicor | BOM/routing/MRP, finance, job costing, multi-site, CPQ, scanning, connected workers | Stronger ERP foundations and navigation first; advanced depth can be packaged separately |
| R1 p10, CoSol Connectivity / Cisco | IT/OT inventory, segmentation, monitoring, remote access, backup and incident response | Proposed managed IT/OT security service, not an existing ERP feature |

R2 adds detail on quoting/costing (p7), procurement (p8), planning (p9), factory operations (p10), quality/ECO/recall (p11), warehouse/dispatch/after-sales (p12), maintenance/energy (p13), safety/OT security (p14), integration (p15), operator experience/governed AI (p16), implementation/migration/training/support (pp17–18), industry segments (p19), measured value (p22) and acceptance criteria (p23).

The major finding was that many foundations already exist, but their depth and discoverability vary. A record, API, dashboard, demonstration screen or partial workflow is not automatically a complete standalone product. New packaging should expose business outcomes, clear entry points and complete journeys without exaggerating readiness.

### Supplier network decision

AIKYANTRA remains the separate supplier-network product connected to ERP. The opportunity is a supplier lifecycle spanning discovery, capability/qualification evidence, RFQs and responses, comparisons, onboarding, performance and collaboration. The source audit distinguishes existing network/sourcing foundations from incomplete or proposed lifecycle stages.

Basic supplier masters, internal purchase orders, receipts and performance based on the customer's own transactions belong in XELOR. Finding and collaborating with outside suppliers is AIKYANTRA's role. Do not require network membership just to use the customer's existing vendor records. Financing, specialist certification and managed services may require partners; no such partnership was established in this session.

## 6. Interactive ecosystem HTML

Main artifact: [deliverables/xelor-ecosystem.html](deliverables/xelor-ecosystem.html).

It is a self-contained HTML diagram with **XELOR in the centre, 18 surrounding offerings, 19 nodes total and 94 research capabilities/service components**. It uses the final product colors. Selecting a node shows its purpose, current implementation stage, workflow, packaging and research topics. The catalogue is searchable and includes original-PDF page links and proposed industry-pack combinations. It remains readable without JavaScript; local relative PDF links expect the repository folder structure.

The surrounding offerings are ONYX, AIKYANTRA, maintenance, quality, service, quoting, planning, warehouse, projects, factory operations, energy, safety, dispatch, setup, integration, commissioning, support and managed IT/OT security.

These are ecosystem opportunities, not 18 completed new products. The catalogue distinguishes existing foundations, extensions, proposed capabilities, partner work and delivery services. Core ERP finance and operator work should not be moved behind unnecessary paid add-ons.

Validation covered node/catalogue consistency, PDF links and page bounds, unchanged source PDFs, SVG geometry and JavaScript selection/filter behavior through a Node harness. A rendered SVG was inspected. This was not a full browser test of the HTML page.

Ignored scratch evidence and helpers are under `.run/ecosystem-review/`. The HTML and research evidence documents are the maintained deliverables; scratch files are not a second application implementation.

## 7. XELOR phase 2 — what was actually implemented

See also [XELOR phase 2 guide](deliverables/XELOR-Phase-2.md) and [XELOR entry README](XELOR/README.md).

### ERP scope and navigation

The technical-profile-1 edition now has its own shell and overview. Its core module set is:

```text
general, engineering, purchase, inventory, planning, quotation,
sales, production, quality, hrm, accounts, expenditure,
administration, dataimport
```

The user sees Overview, Workflows, All records and grouped business navigation. Six configurable business groups cover sales, purchasing, inventory, operations, finance and people. Company navigation remains available when permitted. Global Ctrl/Cmd+K search, module tabs, account access and mobile navigation were added to the dedicated ERP shell.

The overview uses permitted live business sources for metrics and exceptions, with reporting dates, source-unavailable states, shortcuts and links to records. Personal work focus has six choices: business owner, sales, buyer/stores, operations, finance and people. Focus changes presentation and ordering only.

There are six guided workflow chains across sales, purchasing, planning/production, inspection review, accounting and people. These connect to existing screens and label restricted steps; they are not a new automatic workflow execution engine. All records makes 25 explicit core action destinations and other permitted core screens searchable.

The profile excludes ONYX intelligence surfaces, AIKYANTRA network/sourcing portals, standalone maintenance/service applications, advanced QMS demonstration screens, robot-cell screens, advanced factory-flow screens and managed-service applications. Other product profiles remain in the shared source. This iteration did not implement the surrounding ecosystem applications inside XELOR.

**Boundary limitation:** this ERP-only scope narrows frontend modules, navigation, loaders and selected standalone routes. It is not a blanket removal of every add-on API. The existing `platform/apps/api/src/common/product-profile.guard.ts` still permits legacy maintenance, CSP, portal and integration API prefixes for profile 1, subject to their existing permissions and tenant rules. It specifically blocks purchase/network and purchase/tenders. Do not claim complete add-on subscription enforcement from the new navigation alone.

Core manifest projections narrow general to company records, quality to inspections, production to work orders, and planning to existing MRP/planned-order/exception/demand/policy views. Existing permissions, loaders and source manifests are retained. A stale inventory alert about unusable batched stock was suppressed in the ERP projection because the backend already supports FIFO batch allocation.

The naming ADR's older compatibility paragraph says module membership is unchanged; that describes the original naming pass. The subsequent ERP edition does narrow profile 1's frontend module membership. Consult the current profile source and the XELOR phase 2 guide for this edition's scope.

Legacy `/desk`, `/supplier/...`, `/connections`, `/decisions`, `/tenders` and `/department/[code]` entry paths are blocked in the ERP profile. Some streamed Next.js not-found responses carry HTTP 200 with a `NEXT_HTTP_ERROR_FALLBACK;404` payload; the smoke check accounts for that application-level not-found boundary. Do not describe every blocked route as necessarily returning raw HTTP 404.

### Saved company configuration

Five presets are available: General business, Precision & job work, Machinery & equipment, Repetitive assembly, and Trading & distribution. Settings cover a display business label, customer/supplier/item/work-order terminology, visible business groups and up to eight priority shortcuts.

Configuration is persisted on the server, scoped to the company/tenant. Hidden sidebar groups do not remove otherwise permitted screens from All records. A business display label does not rename the legal entity.

API routes below use the actual `/api/v1` prefix:

| Endpoint | Contract |
|---|---|
| `GET /api/v1/general/workspace-config` | Requires `general.company.read`; returns `{ config, updatedAt }` |
| `POST /api/v1/general/workspace-config` | Requires `admin.settings.write` and `Idempotency-Key`; validates and persists the layout |

The payload has `schemaVersion: 1`, `industryPreset`, `businessLabel`, `terminology`, `visibleDepartments` and `quickActionOrder`. It rejects unknown/security/licence fields, invalid IDs, duplicates and unsafe labels. The display label is trimmed and limited to 80 characters; terminology labels are trimmed, nonempty and limited to 32 characters; shortcuts are unique and limited to eight.

Storage uses existing `system_setting`, reserved key **`xelor.workspace.presentation.v1`**, with JSON value type. It uses tenant-scoped queries/RLS, a tenant/key advisory lock, transactional setting/audit/outbox writes and the existing idempotency/fingerprint mechanism. The generic settings writer cannot bypass this reserved key's validation. **No schema migration was required.** Missing settings return defaults without creating a row; malformed stored configuration produces a visible conflict rather than silently masking it.

Personal focus is separate browser storage, keyed by `xelor.erp2.focus.v1:{tenantId}:{subject}`. The workspace provider is keyed by tenant and subject so changing identity cannot retain the previous user's company configuration.

These settings customize presentation and navigation. They do not implement arbitrary custom fields, form builders, industry-specific accounting, regulatory packs or configurable business-rule/approval engines.

### Internal supplier performance

Purchasing now exposes Suppliers & performance directly. Supplier selection is connected to internal purchase orders, posted receipts and completed incoming quality inspections, without requiring AIKYANTRA membership.

`GET /api/v1/purchase/vendors/:id/performance` requires `purchase.vendor.read`. It returns vendor details, an as-of timestamp, orders, delivery, receipts, quality, evidence and method information. Delivery evidence uses completed-order final receipts, identifies overdue open orders, and shows unknown results where dates/evidence are missing. Quality is calculated per material rather than combining incompatible units into one percentage. Evidence/sample sizes and permitted links are visible. The supplier selector uses the currently loaded page of suppliers and explains that limit.

Purchasing owns order/receipt reads. A quality-owned port supplies completed incoming-inspection evidence. Shared performance arithmetic was extracted while preserving the existing supplier-network calculations. Malformed IDs and missing suppliers are handled explicitly. The network API remains unavailable in the ERP profile.

### Main implementation file map

All paths below are relative to `platform/`.

| Area | Files |
|---|---|
| ERP workspace | `apps/web/src/spine/erp/workspace-model.ts`, `workspace-context.tsx`, `erp-shell.tsx`, `overview.tsx`, `workflows.tsx`, `records.tsx`, `configure.tsx`, `icon.tsx` |
| Product scope | `apps/web/src/spine/product/profile.ts`, `erp-core.ts`, `apps/web/src/modules/registry.ts` |
| Shell selection | `apps/web/src/spine/shell/app-shell.tsx` selects the dedicated shell for profile 1 and retains the existing shell for other profiles |
| Routes | `apps/web/src/app/(app)/home/page.tsx`, new `workflows/page.tsx`, `workspace/page.tsx`, `configure/page.tsx` |
| Portal boundaries | `apps/web/src/app/desk/layout.tsx`, `desk/desk-shell.tsx`, `supplier/layout.tsx`, and the connections/decisions/tenders/department routes |
| Styling | `apps/web/src/app/xelor-phase2.css`, `product-palettes.css`, root `layout.tsx` |
| Company settings API | `apps/api/src/modules/administration/workspace-config.ts`, `.service.ts`, `.controller.ts`, `.test.ts`; module registration and `platform-ops.service.ts` |
| Supplier API | `apps/api/src/modules/purchase/vendor-performance.ts`, `.service.ts`, `.test.ts`, `vendor.controller.ts`, `purchase.module.ts` |
| Shared supplier evidence | `apps/api/src/common/supplier-performance.ts`, `ports/vendor-quality.port.ts`, `modules/quality/vendor-quality.service.ts`, quality module registration, marketplace performance service |
| Supplier UI | `apps/web/src/modules/purchase/api.ts`, `manifest.ts`, `screens/vendors.tsx` |
| Product entry/docs | Root launch docs, `XELOR/product.json`, `XELOR/README.md`, `platform/scripts/phase.mjs`, `deliverables/XELOR-Phase-2.md` |

## 8. Verification — completed checks and their limits

These are session results, not a claim that every check was rerun while creating this handoff.

For the new ERP implementation:

- 12 focused frontend tests passed: eight core-projection tests and four workspace-model tests.
- 10 backend workspace-configuration tests passed.
- Nine supplier-performance tests passed: seven new tests plus two existing network-calculation tests.
- API/web type checks, targeted ESLint, module registration checks and production builds passed. Module registration found 29 installed source modules and 63 navigation permissions; the ERP exposes its smaller selected subset.
- A final ERP production rebuild and restart followed the legacy-route guards and styling fixes. Other product profiles remained running.
- HTTP checks covered ten ERP pages and their edition branding, core API sources and proxy access.
- API checks covered configuration read/save/reload, idempotent replay, invalid-field rejection, missing idempotency key, supplier evidence, malformed/missing vendor IDs and network-API exclusion.
- Legacy portal boundaries and continued availability of the other three sites were checked.

The local smoke script is `.run/erp-phase2-smoke.cjs`. **It is not read-only:** it saves the existing configuration values unchanged to exercise persistence/idempotency. This can create the default settings row and updates audit/outbox/timestamps. It did not create purchase, sales, stock or accounting transactions. Do not rerun it merely to check whether a server is alive.

Earlier reorganization/palette work also passed its dated package builds, focused tests, naming checks, launcher checks, document checks and palette contrast checks. The reorganization and color documents contain those exact historical results. Do not add them together and describe them as a single full-suite run on the latest source.

**Browser limitation:** the available interactive browser runtime returned “No browser is available”, and its browser list was empty. No complete visual review or live browser end-to-end suite was run for the new ERP. HTTP success, type checks, source review and token contrast tests do not establish every interaction, responsive state or accessibility behavior.

Fresh checks performed specifically while writing this handoff on **12 September 2026, approximately 01:47 IST** were read-only: `/home` returned HTTP 200 on web ports 4001, 4101, 4201 and 4301; `/api/v1/health` returned HTTP 200 on API ports 4000, 4100, 4200 and 4300. This establishes availability at that time, not permanent uptime or complete workflow correctness.

## 9. Run or rebuild locally

Use the existing native launchers from `C:\ORGANISED\XELOR-MVP`. After changing the ERP source, run **sequentially**:

```powershell
.\stop-local.ps1 -Phase 1
.\build-local.ps1 -Phase 1
.\start-local.ps1 -Phase 1
```

Equivalent product wrapper: `./XELOR/start.ps1 stop`, then `./XELOR/start.ps1 build`, then `./XELOR/start.ps1`. Do not use `-Phase 2` to select the new ERP; that selects ONYX.

`build-local.ps1` builds shared platform/DB/API packages and selected web profiles. It refuses to overwrite a selected running web build; it does not stop processes for you. ERP build output remains `platform/apps/web/.next/phase-1`. Unselected products may stay running, but shared-code changes can require rebuilding/restarting affected products before claiming their runtime includes those changes.

Running `./start-local.ps1` without a phase selects all four products; `./stop-local.ps1` stops this checkout's recorded application processes. Neither is a database reset. For a simple availability check, use GET `/home` and GET `/api/v1/health` rather than writing business data.

Local tooling at the session checkpoint:

- Portable Node 22: `C:\ORGANISED\xelor-local\node22\node.exe`; launcher scripts prefer this over the system Node installation.
- pnpm 9.12; repository engines support Node 22 through 24.
- Next.js build reported 15.5.22; React 19; NestJS API; TypeScript shared packages; PostgreSQL/Drizzle.
- PostgreSQL binaries: `C:\ORGANISED\xelor-local\pgenv\Library\bin`.
- Existing PostgreSQL data: `C:\ORGANISED\xelor-local\pgdata`.
- Local PostgreSQL is 16.15 with pgvector; the documented deployment target is PostgreSQL 17 with pgvector.
- All four profiles use the existing dedicated `aikyantra_demo` database.

The private local demo configuration uses the existing public-demo flags. AI is configured as deterministic stub and supplier notifications as preview. This is a local demonstration environment, not a claim of live external AI, delivered messages or production authentication setup. Preserve configuration compatibility; do not paste `.env` contents into a handoff.

Logs and operational ownership records are in `platform/.run/`, including `windows-phase-N.json`. Ownership must be validated using executable paths, command lines and process creation times; do not kill processes based only on old PIDs or an occupied port. Do not copy ownership files from another checkout. PostgreSQL remains running when application profiles stop.

For future source changes, inspect the package scripts and use targeted type checks/tests first. Broad `ci`, demo rebuild, reset or seed commands are not harmless verification commands; some require isolated services/fixtures and can mutate the database. No such operation is authorized just by this handoff.

## 10. Known gaps and appropriate next work

Do not describe the ERP as finished for every industry. The following remain incomplete, unverified or proposed:

1. **Browser verification:** check desktop/mobile, light/dark, navigation, Ctrl/Cmd+K, permissions, company save/reload, shortcut limits, supplier selection and inherited forms when a browser is available.
2. **Deeper customization:** custom fields/forms, configurable business rules, approval builders and full industry packs have not been built by this iteration.
3. **End-to-end business depth:** guided links reuse existing workflows. Research suggestions such as richer quote costing/margin approval, actual job costing and complete purchase/GRN/invoice three-way matching are not all implemented.
4. **Quality:** inspection foundations exist; full document control, CAPA, calibration, SPC/FMEA, training, audits and recalls are not complete products. Advanced QMS demonstration navigation was excluded from this ERP edition.
5. **Warehouse/engineering/planning:** existing stock, batches/FIFO, BOM versions and basic MRP do not constitute full scanner/bin/kitting/offline execution, ECO/effectivity/PLM or advanced finite-capacity optimization.
6. **Optional applications:** maintenance and service have existing backend foundations but incomplete operator/technician/portal journeys. They were not newly completed or bundled into XELOR phase 2.
7. **External integration:** physical factory equipment, energy/PPE systems, OT security and managed-service delivery need their own implementation and validation. No supplier partnerships or ROI percentages were established here.
8. **AI/offline:** existing ONYX uses bounded connector/snapshot and explanation capabilities; do not claim universal autonomous write-back. The local AI provider is stubbed. Existing PWA offline behavior is reconnect-oriented, not a verified general offline transaction queue.
9. **Settings recovery edge case:** invalid stored workspace JSON returns a conflict; the current configuration UI disables save after a read error. The advertised ability to replace invalid configuration may need a deliberate recovery path. This was a source-review concern, not a failure encountered in the live demo.

A sensible continuation is to first verify the current ERP in a browser, then complete the particular workflow or customization the user requests. Keep discoveries linked to the research evidence and clearly distinguish current behavior from a proposal. Do not start surrounding add-on implementation merely because it is listed in the ecosystem HTML.

## 11. Files to find quickly

- This memory: `CLAUDE-HANDOFF-2026-09-12.md` at repository root.
- Current ERP summary: `deliverables/XELOR-Phase-2.md`.
- Ecosystem diagram: `deliverables/xelor-ecosystem.html`.
- Main research PDF: `output/pdf/01_Manufacturing_Supplier_Research.pdf`.
- Research roadmap PDF: `output/pdf/02_AIKYANTRA_XELOR_Opportunity_and_Roadmap.pdf`.
- Source-aware research audits: `output/analysis/evidence/services/`.
- Launch instructions: `LOCAL-HOSTING.md`.
- Current product/naming decisions: `AGENTS.md` and `docs/00-governance/03-product-names-and-workspace.md`.
- New ERP frontend: `platform/apps/web/src/spine/erp/`.
- New configuration backend: `platform/apps/api/src/modules/administration/workspace-config*`.
- Runtime logs: `platform/.run/`; temporary analysis/check artifacts: root `.run/`.

When resuming, inspect current files and live status before acting: later user work can supersede this dated snapshot. Preserve the existing source, research and business data, and update this memory if significant new work is completed.
