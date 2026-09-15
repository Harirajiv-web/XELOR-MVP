# Current workspace context

Updated 11 September 2026 from the owner's explicit naming and organization instruction.

- XELOR is the manufacturing ERP: folder `XELOR`, phase 1, web 4001 / API 4000.
- ONYX is the AI intelligence layer: folder `ONYX`, phase 2, web 4101 / API 4100.
- AIKYANTRA is the supplier network: folder `AIKYANTRA`, phase 3, web 4201 / API 4200.
- `INTEGRATED` is a neutral combined workspace: phase 4, web 4301 / API 4300.
- `platform/` is the only maintained application implementation in this workspace.

Project X is the programme name for all of it: the technology spine for Indian
manufacturing. Six connected packages extend the spine, each its own product:

- Plant Operations: folder `PLANT-OPERATIONS`, phase 5, web 4401 / API 4400.
- Quality, Safety & Compliance: folder `QUALITY-SAFETY`, phase 6, web 4501 / API 4500.
- Warehouse & Dispatch: folder `WAREHOUSE-DISPATCH`, phase 7, web 4601 / API 4600.
- Planning & Engineering: folder `PLANNING-ENGINEERING`, phase 8, web 4701 / API 4700.
- Revenue & Service: folder `REVENUE-SERVICE`, phase 9, web 4801 / API 4800.
- Delivery & Managed Services: folder `DELIVERY-SERVICES`, phase 10, web 4901 / API 4900.

A package is a separate product, never a bundle containing everything. Each reads and
writes the same tenant-isolated database through the same API, permission and RLS rules,
so a change made in one is visible in XELOR and the reverse. No package keeps a second
copy of stock, ledger or order data, and none introduced a permission or a migration.
Read `docs/00-governance/04-project-x-architecture.md` before changing that structure.

Read `README.md`, `AGENTS.md`, `LOCAL-HOSTING.md` and `docs/00-governance/03-product-names-and-workspace.md`. Product folders contain definitions and launchers, not separate code copies.

This checkout is on native Windows. Ignore historical macOS/WSL instructions in archived material. The native launchers use `C:/ORGANISED/xelor-local` tooling and private configuration at `platform/.env`. Keep databases and existing data. Starting a profile must never seed or reset it. Do not copy process ownership records from sibling worktrees.

Existing phase IDs, database names, `ONYX_*` / `SOURCE_*` / `XELOR_*` integration keys, protocol source IDs, auth storage keys and agent identities are compatibility identifiers. Their spelling does not define current product branding. Do not mechanically swap them. Existing SQL migrations remain immutable.

Preserve tenant RLS, registered permissions, domain-owned writes, approvals, audit and idempotency. Connected questions currently use grounded rules; local AI provider configuration is separate. Notifications default to preview and PWA offline support is reconnect-only. Do not overstate those capabilities.

Historical PDFs/reports keep their original names and content. New current product material uses XELOR ERP, ONYX AI intelligence and AIKYANTRA supplier network. The September 7 verification report and September 11 analysis are dated evidence, not proof of tests being rerun now.
