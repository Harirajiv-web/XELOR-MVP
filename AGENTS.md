# Working in this repository

The user's current product mapping is authoritative:

| Name | Responsibility | Profile |
|---|---|---|
| XELOR | Manufacturing ERP and system of record | 1 |
| ONYX | AI intelligence layer | 2 |
| AIKYANTRA | Supplier network | 3 |
| Integrated workspace | Combined view of the three products | 4 |
| Plant Operations | Machines, maintenance and energy on one asset register | 5 |
| Quality, Safety & Compliance | One corrective-action engine for defects and incidents | 6 |
| Warehouse & Dispatch | One handling unit from gate to truck | 7 |
| Planning & Engineering | One BOM and capacity model; engineering change control | 8 |
| Revenue & Service | Quoting and costing, then warranty, spares and field service | 9 |
| Delivery & Managed Services | Implementation, integration, commissioning and support | 10 |

Profiles 5-10 are the six connected packages of Project X. They add screens over existing
APIs: no new permissions, no new endpoints, no migrations. Keep it that way — `perm-check`
fails both when a route demands an unregistered permission and when a registered permission
guards nothing.

Make application changes in `platform/`. The `XELOR/`, `ONYX/`, `AIKYANTRA/` and `INTEGRATED/` folders are product entry points. Read `README.md`, `LOCAL-HOSTING.md` and the naming ADR before changing launch or branding behavior.

Keep numeric phase IDs, ports, database names, applied migrations, permission codes, agent identities, storage keys and integration/environment contracts stable unless an actual migration is requested. In particular, legacy `ONYX_*` configuration still identifies the ERP projection adapter even though the ERP product is now XELOR. Use explicit product labels in new UI and documentation.

Preserve local data and private `.env` files. Never reset/seed databases as part of launch or routine verification. Do not reuse process ownership records from another checkout. Native background services must launch hidden and stop only processes owned by the launcher.

The stack, RLS, domain-owned transactions, audit, idempotency and permission rules in `docs/00-governance/01-binding-platform-decisions-v2.md` remain applicable. The consolidation ADR supersedes old fork topology; the naming ADR supersedes old branding. Historical report snapshots do not override the current implementation or user instructions.

Use targeted checks for the change. Full database/AI/demo CI requires its documented services and isolated fixtures. Do not describe historical verification results as a fresh run. Preserve historical PDFs and research evidence when organizing current documents.
