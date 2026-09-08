# Five-phase workspace analysis

> Historical review, completed before the four-product consolidation on 7 September 2026.
> The findings, phase numbers, source paths and commands below describe that earlier
> snapshot. See the current [product map](Four-Phase-Product.md),
> [verification report](Verification-2026-09-07.md) and
> [consolidation decision](../docs/00-governance/02-four-product-consolidation.md).
> Historical source paths are preserved as text; the original checkouts are archived
> locally and excluded from the published repository.

Reviewed on 7 September 2026. Scope: all five active phase directories, shared workspace documentation, Git history, configuration, schemas, representative business and agent code, and selected executable checks. This is a source and architecture review, not a full production certification or an assertion that every source file was audited.

The workspace contains five separate Git checkouts and two development paths. XELOR phase 2 contains the fulfilment and onboarding expansion. ONYX phases 1 and 3, SOURCE phase 4, and DESK phase 5 form the ERP-to-sourcing progression. Phase 5 contains phase 4's implementation, but does not contain phase 2's fulfilment expansion.

## 1. Current inventory

| Phase | Directory | Branch / HEAD | Actual role | Configured API / web ports | Local database | SQL migration files |
|---|---|---|---|---|---|---|
| 1 | `ONYX-phase-1` | `onyx-phase-1` / `bd57cd2` | Manufacturing ERP, including inherited Agent OS and factory-operation demonstrators | 3000 / 3001 | `indcore` | 92, through 0093 |
| 2 | `XELOR-phase-2` | `main` / `216238c` | ERP-derived intelligence, fulfilment missions, spreadsheet onboarding and factory intelligence | 3100 / 3101 | `indcore_p2` | 96, through 0097 |
| 3 | `ONYX-phase-3` | `onyx-phase-3` / `28c4a16` | ERP plus customer quotations and procurement RFQs | 3200 / 3201 | `indcore_p3` | 93, through 0094 |
| 4 | `SOURCE-phase-4` | `source-phase-4` / `186957d` | Phase 3 plus supplier network and public quote submission | 3300 / 3301 | `indcore_p4` | 94, through 0095 |
| 5 | `DESK-phase-5` | `desk-phase-5` / `2732825` | Phase 4 plus a focused buyer portal at `/desk` | 3400 / 3401 | `indcore_p5` | 94, through 0095 |

Ports and databases above are configuration evidence, not a claim that all five servers were running. SQL counts count actual files, not the highest migration number; numbering has gaps. All five tracked working trees were clean at the end of the review.

Shared material is outside those checkouts: `docs/` holds governance, module specifications and plans; `deliverables/` holds reports and presentations; `archive/` holds prior checkouts, research and prototypes. `.pnpm-store/`, dependencies and generated build output are not additional phases.

## 2. How the implementations relate

Content progression:

```text
Shared ERP + Agent OS foundation
  ├── XELOR phase 2: fulfilment, onboarding, factory intelligence
  └── ONYX phase 1: current ERP baseline
        └── ONYX phase 3: quotations + RFQ sourcing
              └── SOURCE phase 4: supplier network
                    └── DESK phase 5: focused buyer portal
```

This diagram describes code content, not literal Git ancestry. Phases 3, 4 and 5 each have a direct commit on top of phase 1's `bd57cd2`; the later commits include the earlier commercial changes. Phase 2 diverges from the shared `fe870c6` ancestor.

Tracked-file comparisons confirm:

- Phase 3 → 4: 15 added files, 8 modified, none removed. The quotation and RFQ implementations remain identical.
- Phase 4 → 5: 8 added files, 2 modified, none removed. Additions are `DeskService` and seven frontend files; modifications register the service and two read endpoints.
- Phase 2 has a separate migration sequence: `0094_fulfilment_mission.sql` and `0095_fulfilment_numbering.sql`, while phases 3–5 use `0094_quotation_and_sourcing.sql` and `0095_supplier_network.sql`. Consolidation requires deliberate schema reconciliation.

## 3. What each phase actually implements

**Phase 1 — ONYX ERP.** The source contains working masters, BOM/engineering, inventory, purchasing, production, quality, sales/dispatch, accounts, HR/payroll, maintenance, customer service, expenditure, planning, administration and integration modules. Production uses the inspection gate and Inventory's stock path; dispatch integrates invoicing and receivables. It also already includes Agent OS, copilot, AI operations, RELAY managed-service views and ACHILES platform health. Its 22 frontend modules are registered and checked. See backend module composition (`../ONYX-phase-1/apps/api/src/app.module.ts`), production (`../ONYX-phase-1/apps/api/src/modules/production/production.service.ts`), and sales (`../ONYX-phase-1/apps/api/src/modules/sales/sales.service.ts`).

**Phase 2 — XELOR intelligence and fulfilment.** Adds an order-level fulfilment runtime, shortage and supplier planning, replanning, supplier-term imports, and real draft purchase/work-order creation through domain-owned interfaces. Spreadsheet onboarding calls application endpoints with credentials and idempotency keys. The nine-agent runtime persists graphs, evidence, approvals and action records. A separate ONYX HTTP adapter supports bounded factory-intelligence snapshots. See fulfilment wiring (`../XELOR-phase-2/apps/api/src/fulfilment/fulfilment.module.ts`), mission service (`../XELOR-phase-2/apps/api/src/fulfilment/mission.service.ts`), and import HTTP client (`../XELOR-phase-2/apps/api/src/modules/dataimport/domain-client.ts`).

**Phase 3 — ONYX commercial expansion.** Customer quotations support revisions, customer decisions and conversion to sales orders. Procurement supports RFQ issuance, recorded supplier quotes, technical gates, separation of duties and award-to-PO conversion. Business logic lives within Sales and Purchase; the frontend adds quotation and sourcing modules. There are 24 registered modules. See quotation service (`../ONYX-phase-3/apps/api/src/modules/sales/quotation.service.ts`), RFQ service (`../ONYX-phase-3/apps/api/src/modules/purchase/rfq.service.ts`), and migration 0094 (`../ONYX-phase-3/packages/db/migrations/0094_quotation_and_sourcing.sql`).

**Phase 4 — SOURCE supplier network.** Adds network suppliers, RFQ broadcast records, rendered WhatsApp/email previews, invitation URLs, a public supplier page at `/supplier/[token]`, quote submissions, and deterministic price/delivery ranking. Supplier submissions are separate from the buyer's formal sourcing quotes and require a buyer acceptance action. There are 25 registered modules. See network service (`../SOURCE-phase-4/apps/api/src/modules/marketplace/network.service.ts`), public controller (`../SOURCE-phase-4/apps/api/src/modules/marketplace/supplier-portal.controller.ts`), and migration 0095 (`../SOURCE-phase-4/packages/db/migrations/0095_supplier_network.sql`).

**Phase 5 — DESK buyer portal.** Adds `/desk`, `/desk/requests/[id]`, `/desk/suppliers`, and `/desk/materials`, outside the ERP sidebar layout. It displays request lanes/table, quote comparisons, supplier response metrics and material price history. Its backend merges recorded and network quotes from existing tables. It can bring a network submission onto an RFQ, but request creation, technical gating and award remain in the underlying ERP flow. It adds no database migration and remains part of the same Next/Nest deployment. See portal layout (`../DESK-phase-5/apps/web/src/app/desk/layout.tsx`), detail page (`../DESK-phase-5/apps/web/src/app/desk/requests/[id]/page.tsx`), and DeskService (`../DESK-phase-5/apps/api/src/modules/marketplace/desk.service.ts`).

## 4. Shared architecture and limits

The common implementation is a pnpm TypeScript monorepo: NestJS 11 API, Next.js 15/React 19 frontend, shared platform library, PostgreSQL/Drizzle database package and an edge application. Infrastructure includes Keycloak, Valkey/BullMQ and Gotenberg. `withTenant` establishes transaction-local tenant and customer-account context; business writes use audit/outbox mechanisms, and important stock/accounting paths are transactional. See tenant database wrapper (`../DESK-phase-5/packages/db/src/client.ts`).

These controls are real implementation assets. This review did not rerun database isolation proofs, deployment checks or browser acceptance, so their presence is not a new live-system certification.

The Agent OS reasoner is explicitly deterministic. The separate business AI provider selection supports an offline stub or Ollama; optional model-assisted features should not be confused with general model-driven fulfilment planning. Generic agent dispatch records an approved work item, whereas the fulfilment runtime has actual domain-document creation. Factory-command execution is simulator-only, and several statutory, biometric and connector paths remain demonstrators. See agent reasoner (`../XELOR-phase-2/apps/api/src/agent-os/agent-reasoner.service.ts`), AI provider binding (`../XELOR-phase-2/apps/api/src/ai/ai.module.ts`), and edge runtime (`../ONYX-phase-1/apps/edge/src/runtime.ts`).

## 5. Findings that affect further work

1. **Workspace documentation and launching are behind the code.** The [root README](../README.md) and [launcher](../run-phase.sh) cover only phases 1–2. Root documentation also assigns the agent runtime exclusively to phase 2, despite it existing in phase 1. Historical documents use earlier product naming. The launcher accepts only `1`, `2` and `stop`; its default also rebuilds demo data. The five-folder source inventory should guide current work.

2. **XELOR is not yet a fully separated intelligence service over ONYX.** Its fulfilment service reads its local schema and resolves purchase/production writers to local services. Its importer defaults to its own API port. Those actions normally change phase 2's database, not phase 1's separate database. An ONYX HTTP adapter exists for factory intelligence, but does not establish general cross-product synchronization. Evidence: phase 2 fulfilment module (`../XELOR-phase-2/apps/api/src/fulfilment/fulfilment.module.ts`), lines 21–35; import client (`../XELOR-phase-2/apps/api/src/modules/dataimport/domain-client.ts`), lines 102–154.

3. **Quotation conversion and RFQ award have concurrency risks.** Quotation conversion checks state, creates an order, then writes the conversion reference in separate transactions without a conditional state update spanning the operation. Concurrent requests using distinct keys can create duplicate sales orders. RFQ award creates the PO before the unique award row, so a losing concurrent award can leave an extra PO. These are source-derived risks, not database-reproduced failures. Evidence: phase 3 quotation conversion (`../ONYX-phase-3/apps/api/src/modules/sales/quotation.service.ts`), lines 381–429; RFQ award (`../ONYX-phase-3/apps/api/src/modules/purchase/rfq.service.ts`), lines 464–544. The same code is inherited by phases 4–5.

4. **Supplier messaging is preview-only.** Both email and WhatsApp live sending deliberately throw. Configuring credentials alone does not implement delivery, despite the opening SMTP comment suggesting otherwise. Evidence: phase 4 notification service (`../SOURCE-phase-4/apps/api/src/modules/marketplace/notify.service.ts`), lines 115–138.

5. **Commercial eligibility checks are incomplete at backend boundaries.** Ranking marks late quotes unusable, but award checks status, technical gate and separation of duties without validating the promised date against need date, quote expiry or MOQ. Public quote submission checks invitation TTL but not RFQ commercial deadline or closed/awarded state. Evidence: phase 4 network service (`../SOURCE-phase-4/apps/api/src/modules/marketplace/network.service.ts`), lines 376–480 and ranking near 601; phase 3 RFQ service (`../ONYX-phase-3/apps/api/src/modules/purchase/rfq.service.ts`), lines 464–504.

6. **New network suppliers have an incomplete route into an RFQ.** Network broadcasts can invite suppliers beyond the RFQ's original vendor list. Accepting a submission calls `recordQuote`, which requires an original sourcing invitation. A network supplier can therefore be an approved vendor yet receive `VENDOR_NOT_INVITED`; the examined controller provides no post-creation vendor-addition route. MOQ is also omitted when copying a submission. Evidence: phase 4 network service (`../SOURCE-phase-4/apps/api/src/modules/marketplace/network.service.ts`), broadcast near 266 and acceptance near 527; phase 3 RFQ service (`../ONYX-phase-3/apps/api/src/modules/purchase/rfq.service.ts`), invitation check near 297.

7. **Invitation URLs are retained as readable credentials.** The invitation table hashes tokens, but rendered notification body, variables and `link_url` also retain the complete bearer URL. The outbox is available under `purchase.network.read`. The migration's hash-only database-leak claim is therefore too strong. Evidence: phase 4 notification service (`../SOURCE-phase-4/apps/api/src/modules/marketplace/notify.service.ts`), lines 69–71, and invitation migration (`../SOURCE-phase-4/packages/db/migrations/0095_supplier_network.sql`), comment near 71. This is an access/design finding, not evidence of an actual leak.

8. **DESK's metrics need stricter definitions.** `bestUsable` includes unknown delivery dates and pending/null technical gates; backend award requires a completed gate. Closed/cancelled RFQs with quotes are classified as `evaluating` because that condition is checked first. Respondent counting also combines vendor IDs and network supplier IDs without canonicalizing them, so one accepted supplier may count twice. Evidence: DeskService (`../DESK-phase-5/apps/api/src/modules/marketplace/desk.service.ts`), lines 237–262. The request-detail UI repeats the permissive eligibility filter at line 104.

9. **DESK reads are unbounded, and the single-snapshot comment is unsupported.** Overview loads all tenant RFQs and related data; even a single request calls the complete overview. A transaction alone does not guarantee one snapshot across multiple statements under the default PostgreSQL isolation level used here. Evidence: DeskService (`../DESK-phase-5/apps/api/src/modules/marketplace/desk.service.ts`), lines 142–168 and 360–363; transaction wrapper (`../DESK-phase-5/packages/db/src/client.ts`), lines 33–43. This matters as tenant history grows or concurrent writes become common.

10. **Tests do not yet cover the new commercial journeys adequately.** No dedicated quotation/RFQ/network/DESK test files were added with these phases. The investor CI job explicitly seeds only the base world and Northstar, despite `demo:rebuild` including commercial/network seeders. The existing acceptance matrix does not cover the new quotation/RFQ/network flow. Evidence: phase 5 CI (`../DESK-phase-5/.github/workflows/ci.yml`), lines 254–276. Seed scripts are useful examples, but do not establish concurrency, expiry or complete supplier-acceptance behavior.

## 6. Checks executed during this review

| Check | Result |
|---|---|
| Phase 1 platform unit tests | 747 passed; no failures or skips |
| Phase 1 API unit tests | 62 passed; no failures or skips |
| Phase 1 module validation | 22 modules; 163 navigation permission references; passed |
| Phase 2 platform unit tests | 853 passed; no failures or skips |
| Phase 2 targeted API tests | 78 passed; no failures or skips; fulfilment, imports, agent controls and ONYX adapter |
| Phase 3 module validation | 24 modules; 176 navigation permission references; passed |
| Phase 4 module validation | 25 modules; 180 navigation permission references; passed |
| Phase 5 module validation | 25 modules; 180 navigation permission references; passed |
| Phase 5 API and web TypeScript checks | Passed |
| Phase 5 scoped ESLint | Marketplace, quotation/RFQ backend additions and DESK frontend passed with zero warnings |
| Git working-tree inspection | All five tracked checkouts clean after verification |

No services were started, no builds or migrations were run, and no demo resets or external messages were performed. Database-backed integration tests, RLS proofs, browser flows and live provider calls were not rerun. Some API tests resolve existing built shared packages, so passing unit tests are not evidence of a fresh complete build. Existing `.run/*.status` files were treated as historical artifacts, not fresh validation results.

## 7. Recommended order for subsequent implementation

1. Establish the intended product boundary: retain phase 2 as a separate prototype or integrate its fulfilment capabilities into the newer ERP/sourcing line. Reconcile migrations explicitly before combining them.
2. Update the workspace index and phase launcher to cover all five configurations and explain demo-reset behavior.
3. Correct conversion/award concurrency, supplier acceptance, commercial eligibility and DESK metric definitions; add tests for those behaviors and the complete supplier-to-award journey.
4. Implement actual messaging and external adapters where required, then run fresh build, database/RLS and browser acceptance checks against the selected development branch.

For current work, phase 5 is the fullest sourcing/buyer experience; phase 2 is the fulfilment/intelligence branch. Neither contains every capability present across the workspace.
