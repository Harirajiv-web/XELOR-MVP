# Manufacturing connectivity and decisions

Phase 2 can work entirely from another system's evidence. A connection produces a dated,
tenant-owned snapshot. Order screening, recovery comparisons, and grounded questions read
that selected snapshot. The native ONYX reader is optional; no external-source calculation
silently queries the local ERP instead.

## Supported boundaries

| Source | Implemented transport | Evidence and limits |
|---|---|---|
| Native ONYX | Tenant-scoped SQL reader | Orders, item availability, suppliers. Excludes quarantine and sales reservations. Production allocations and full BOM capacity still require confirmation. |
| Odoo 19 | JSON-2 `search_read` | Product free stock, open sales-line quantities, supplier masters. Requires an API key and the vendor's external API entitlement. Due dates and supplier lead times remain unknown in this adapter. |
| TallyPrime | XML export over HTTP | Stock items, units and closing quantity. Closing stock is retained as `onHandQty`; `availableQty` remains unknown until reservations are reconciled. |
| SAP S/4HANA | Configured OData V2/V4 entity | Supplier, order-line or inventory mapping. `AvailableQuantity` must come from a reconciled view; physical stock is not substituted. Basic service-account authentication or bearer token. |
| Vyapar | CSV / normalized JSON import | Export and map records to the contract below. A direct Vyapar API has not been verified or claimed. |
| Other ERP, accounting tools, spreadsheets | CSV / authenticated JSON import | A customer's integration bridge can POST the normalized contract. Uses the same authentication, permissions and tenant isolation as the application. |

Read-only remote connectivity is implemented. External order write-back, OAuth refresh,
scheduled synchronization, automatic field discovery, complete ERP/version coverage and
production credential validation are not implemented. Odoo collections that reach 1,000
records and SAP responses with pagination are refused to avoid presenting a partial set as
complete evidence. Configure a bounded manufacturing view or import a reconciled export.

## Deployment configuration

Only the server operator can authorize a remote origin. Set:

```dotenv
CONNECTIVITY_ALLOWED_ORIGINS=https://factory.example.com,http://192.168.1.25:9000
CONNECTIVITY_ENCRYPTION_KEY=<base64-encoded 32 random bytes>
```

Generate the encryption key with `openssl rand -base64 32`; store it in the deployment's
secret manager. Credentials are AES-256-GCM encrypted with the tenant and connection ID
as authenticated context. Neither connection reads nor audit events return credentials.
Keep the key backed up: changing it without migrating ciphertext makes existing secrets
unreadable. Import-only and native connections require no encryption key.

Origins must match exactly, including the port. Redirects, URL credentials, metadata
services, link-local addresses and unspecified addresses are refused. Each request resolves
DNS once and pins the selected address. Responses are bounded to 2 MB and eight seconds.
Private factory LAN addresses are permitted only after explicit operator allowlisting.
Tally must be reachable from the server or a customer-managed integration bridge; a phone
browser cannot make a cloud server reach a factory's private network automatically.

## API

Every response is `{ "data": ... }`. Every POST requires an `Idempotency-Key` header;
repeating the same request and key returns the saved result, while a changed payload with
the same key is rejected. All routes retain authentication and tenant isolation.

Read and decision permission: `integration.connector.read`. Connection changes, source
tests, synchronization, imports and measurement writes: `integration.flow.manage`.

| Method | `/api/v1/connectivity` path | Purpose |
|---|---|---|
| GET | `/catalog` | Available transport and source limitations |
| GET / POST | `/connections` | List redacted connections / create a connection |
| POST | `/connections/:id/test` | Validate actual read access and returned format; import-only returns `import_ready` |
| POST | `/connections/:id/sync` | Read source and append a snapshot |
| POST | `/connections/:id/import` | Append normalized CSV/JSON evidence |
| GET | `/connections/:id/snapshot` | Latest evidence with observation time, counts and warnings |
| POST | `/connections/:id/ask` | Bounded grounded questions with source record citations |
| POST | `/decisions/commitment` | Single-item date, cost and margin screening |
| POST | `/decisions/recovery` | Compare fully specified procurement options |
| GET | `/decisions` | Recent recorded decisions and their source snapshot IDs |
| GET / POST | `/outcomes` | Referenced baseline, actual and estimated measurements |

Create an Odoo connection:

```json
{
  "name": "Factory Odoo",
  "kind": "odoo",
  "baseUrl": "https://factory.example.com",
  "credentials": { "apiKey": "<server-side API key>" },
  "settings": { "database": "factory" }
}
```

SAP additionally requires `settings.entityPath`, such as
`/sap/opu/odata/SAP/API_BUSINESS_PARTNER/A_BusinessPartner`, and
`settings.entity: "suppliers"`. The mapping is explicit and checks the fields it needs.
Tally supports `settings.company` using the exact loaded-company name.

Create a native or import connection with only `name`, `kind` and optional `settings`.
Omit `credentials` and `baseUrl` for `native`, `vyapar` and `generic` connections.

### Normalized evidence

```json
{
  "orders": [
    {"externalId":"SO-001/1","itemCode":"RM-001","quantity":100,"dueDate":"2026-09-20","unitPrice":120,"currency":"INR"}
  ],
  "inventory": [
    {"itemCode":"RM-001","availableQty":30,"uom":"kg"}
  ],
  "suppliers": [
    {"externalId":"SUP-001","name":"Example supplier","leadDays":null}
  ]
}
```

These are illustrative values, not live factory records. `null` means unknown. Zero is
accepted only when explicitly supplied. IDs must be unique within each entity. Quantities
use source units; reconcile reservations and unit conversions before import. Negative,
non-finite, duplicate, malformed and future-observed records are rejected. At most 1,000
records per entity and 1 MB import text are accepted.

POST import body: `{format:"json", content:"<serialized evidence>", observedAt:"<ISO timestamp>"}`.
CSV additionally requires `entity: "orders" | "inventory" | "suppliers"` and exact headings
matching the row fields above. Quoted commas and escaped double quotes are supported.
CSV imports contain only the selected entity; other dimensions are unknown. Importing a
file does not mark a remote connection as having passed a connectivity test.

### Decision semantics

Commitment screening records all user assumptions: production duration, confirmed capacity,
material unit cost, total conversion cost, lead time, selling price and target margin.
The stock comparison concerns one item and source unit. Dates use calendar days. It does
not explode a BOM, reserve stock, schedule multiple machines or include unspecified taxes
and freight. Missing stock, duration, cost, capacity or a snapshot older than 24 hours
produces `needs_evidence`; a known date or margin miss produces `at_risk`.

Recovery ranks complete options by fewer late days, then lower landed cost. Incomplete
quantity, missing cost/lead time, currency mismatch, unknown stock and stale snapshots do
not receive a purchase recommendation. A partial quote is identified as one part of a
possible split purchase; the algorithm does not manufacture the missing portion. No
purchase order is placed by either calculation.

Grounded questions use deterministic entity/date rules and return `mode: "grounded_rules"`.
They cite exact source snapshot IDs, entities and record IDs. Unsupported questions are
explained; supplier reliability, manufacturing capacity and future profit are not inferred
from a directory or stock balance. An LLM is not called by this endpoint.

Measurements require a scope, sample size, covered period and evidence reference. They
remain user-recorded measurements, not independently verified savings. Comparisons use
equal-length, non-overlapping baseline and actual periods. Estimates are excluded. No
causal claim is made. Snapshot, decision and measurement history is append-only.

## Validation and vendor references

The focused tests cover unknown/stale evidence, date and margin risks, incomplete recovery,
CSV and SAP normalization, Tally closing-stock separation, authenticated encryption,
metadata blocking, a real local HTTP request, redirects, response limits, grounded
citations and measurement comparison rules. Vendor production credentials were not
provided; live customer-system interoperability remains a deployment validation step.

- [Odoo 19 External JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)
- [TallyPrime XML integration](https://help.tallysolutions.com/xml-integration/)
- [Tally integration prerequisites](https://help.tallysolutions.com/pre-requisites-for-integrations/)
- [SAP Business Partner OData API](https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/85043858ea0f9244e10000000a4450e5.html)
