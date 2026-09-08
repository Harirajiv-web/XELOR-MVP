# Workspace context: AIKYANTRA

Updated 7 September 2026. The user requested four products and a unified professional interface.

- `phase-1-erp`: ONYX, web4001/API4000.
- `phase-2-ai`: XELOR, web4101/API4100.
- `phase-3-supplier-network`: SOURCE, web4201/API4200.
- `phase-4-integrated`: AIKYANTRA, web4301/API4300.
- `platform/`: the only maintained implementation. Profile folders are launch packages.
- `archive/five-phase-originals/`: historical source repositories, not active products.

Read `README.md`, `deliverables/Four-Phase-Product.md` and `docs/00-governance/02-four-product-consolidation.md` before making changes. The new ADR supersedes historical two/five-fork packaging. Preserve the stack and the remaining binding controls in `docs/00-governance/01-binding-platform-decisions-v2.md`: tenant RLS, registered permissions, audit, idempotency and domain-owned writes.

The local database is `aikyantra_demo`. Legacy databases are separate. Starting a profile must never reset data. Existing applied SQL migrations are immutable; new changes need new numbers. Keep local .env files private.

The demonstration company is presented as 3S Precision. Historical tenant identifiers retain Trishul names. The secondary Kaveri tenant is used for isolation tests. Synthetic connection/outcome verification fixtures are labelled and must never be claimed as business savings.

Connection adapters and grounded questions have explicit limits documented in `platform/docs/07-product/connectivity-contract.md`. Current connection Q&A is deterministic. Supplier deliveries default to preview. Existing managed-services illustrations are not live operational telemetry. The application is responsive web/PWA, with no offline business writes or native mobile binary.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm module-check` in platform as appropriate. Use profile builds for production output. Verification evidence and current limitations live in `deliverables/Verification-2026-09-07.md`.
