# XELOR phase 2 ERP

XELOR phase 2 is the ERP-only edition of the current application. Its established runtime profile remains **1**, with the web application at **http://localhost:4001** and API at **http://localhost:4000**. ONYX continues to use technical profile 2; the XELOR edition name does not change that mapping.

## What changed

- A dedicated maroon-and-gold ERP shell with grouped business navigation, mobile navigation and account access.
- An overview with current permitted business signals, dated reporting, operational exceptions and direct record links. Unavailable sources remain visibly unavailable.
- Six personal work-focus choices: business owner, sales, buyer/stores, operations, finance and people. Focus changes ordering and shortcuts, not permissions.
- A searchable directory of permitted core screens, including BOMs, receipts, supplier performance, accounts, company setup and audit.
- Guided navigation across quote-to-delivery, purchase-to-receipt, material planning/production, inspection review, accounting review and people records.
- Company-persisted industry layout presets, display labels, navigation terminology, visible workspace groups and up to eight priority shortcuts.
- Internal supplier performance directly in Purchasing, using purchase orders, posted receipts and completed incoming-inspection evidence. Delivery sample sizes, missing evidence and material-specific quality denominators are shown explicitly.

## Core boundary

The ERP edition includes quotations, sales, purchasing, inventory, item/BOM records, basic material planning, production transactions, inspection records, people, accounts, expenses, company administration and spreadsheet import.

ONYX intelligence, AIKYANTRA network experiences, sourcing portals, standalone maintenance/service applications, demonstration QMS screens, robot-cell screens, advanced factory-flow screens and managed services are excluded from this edition's navigation. The shared source retains the other product profiles. Legacy standalone portal entry routes are also blocked in the ERP build.

## Configuration scope

The five presets are General business, Precision & job work, Machinery & equipment, Repetitive assembly, and Trading & distribution. They configure the workspace around existing ERP capabilities. They are not new accounting rule sets, regulatory packs, custom-field engines or proof of complete support for every industry.

Company layout is stored through `GET /general/workspace-config` and `POST /general/workspace-config`. Reads require `general.company.read`; saves require `admin.settings.write` and an idempotency key. The reserved tenant setting uses the existing RLS, audit and outbox transactions. Arbitrary security/licence fields are rejected. No schema migration is required.

Personal work focus is saved only in the current browser, scoped to the signed-in tenant and account. The settings page distinguishes this personal focus from company-wide layout. All permitted core screens remain available in All records, even when their workspace group is hidden from the sidebar.

## Running locally

From the repository root:

```powershell
.\stop-local.ps1 -Phase 1
.\build-local.ps1 -Phase 1
.\start-local.ps1 -Phase 1
```

The launchers preserve PostgreSQL and existing business records. Other product profiles can continue running. See [local hosting](../LOCAL-HOSTING.md) for prerequisites and process ownership rules.

## Verification

The implementation has focused tests for core route projections, usable workflow destinations, configured terminology/search, preset definitions, backend configuration validation/idempotency boundaries and supplier evidence calculations. API/web type checks, targeted lint, module registration checks and a production build were run.

Local HTTP/API checks cover core page availability and branding, current data sources, saving and reloading the existing layout unchanged, idempotent replay, invalid-setting rejection, proxy access, supplier evidence and exclusion of the supplier-network API. No purchase, sales, stock or accounting transactions were created for these checks.

An interactive browser connection was unavailable during this session. HTTP checks and source-level interaction review do not constitute a complete visual or end-to-end browser test.
