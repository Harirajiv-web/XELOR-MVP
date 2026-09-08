# ADR: four product profiles over one canonical platform

Date: 2026-09-07. Status: implemented under the user's explicit restructuring request.

## Decision

Replace five divergent runnable source copies with one canonical `platform/` and four launchable product profiles: ERP, connected manufacturing intelligence, supplier network and integrated AIKYANTRA. This supersedes historical documentation stating that phases must use divergent schemas and separately maintained code. The remaining binding controls—NestJS/Next.js/PostgreSQL stack, tenant RLS, registered permissions, domain-owned mutations, audit and idempotency—remain applicable.

The local profiles use distinct API/web ports and one new database, `aikyantra_demo`, for consistent integrated records. Original databases remain untouched. Separate deployments may use independent databases but must run the same canonical migration lineage. Each web build has its own Next output directory. Profile navigation and an API guard constrain product capability; these are packaging controls in addition to, not replacements for, RBAC and tenant isolation.

## Provenance

The baseline is XELOR-phase-2 at 216238c, with commercial/network/managed-service changes carried from DESK-phase-5 at 2732825 relative to ONYX-phase-1 bd57cd2. The latest ERP factory-operation changes were merged using the common fe870c6 ancestor. The original source repositories are preserved under `archive/five-phase-originals/`, including their Git history and local environments. They contain historical configuration; do not publish that archive as source.

Conflicting historical migration numbers were assigned new canonical numbers before first application in the dedicated database. There is no claim of an in-place upgrade of any old database. Once applied, migration files are immutable; subsequent changes use new migration numbers.

## Boundaries

- External connectors ingest evidence through explicitly configured destinations and encrypted credentials. They do not promise unrestricted vendor compatibility or arbitrary remote writes.
- Connected-source questions and decision checks are deterministic and explain their evidence. Existing language-model routing remains separately configurable.
- Supplier awards and quotation conversions use the owning domain services inside one database transaction. Stock remains owned by the inventory boundary.
- Supplier invitations default to preview; provider configuration is required for live delivery.
- Responsive web/PWA is the supported cross-device delivery format. Offline business writes and native mobile binaries are outside the implemented release.
- Profile launch never resets data. Demo reseeding is an explicit command.

## Consequences

A single implementation removes phase drift, simplifies integration and permits consistent shared records. It also requires all profiles to remain on compatible schemas. Vendor-by-vendor acceptance tests, authenticated deployment, backup/restore exercises and customer pilots are release work beyond local demonstration; local checks are recorded in the verification report.
