# XELOR services: platform and discovery assessment

Date: 2026-09-11. Read-only source assessment; no application changes or test runs. Proposed design and acceptance criteria below are recommendations, not implemented capabilities or a production-readiness certification. Source paths are relative to the repository root; line numbers identify inspected definitions.

## Main finding

Keep XELOR as the main business workspace and system of record, with ONYX, AIKYANTRA and optional services enabled within it. An independently marketable service can initially run on the shared platform. Selling it to customers who retain another ERP additionally requires its own onboarding, minimum data model, supported connectors and verifiable write handoff. A separate brand, localhost port or sidebar module does not establish that readiness.

The current backend is explicitly one deployable modular monolith (`platform/apps/api/src/app.module.ts:42`). Frontend modules support their own licence key and multiple modules under a sold bundle (`platform/apps/web/src/spine/registry/manifest.ts:213`). These are useful foundations; they are not yet a complete service subscription lifecycle.

## Verified implementation and implications

| Area | Evidence | Implication |
|---|---|---|
| Product packaging | `platform/apps/web/src/spine/product/profile.ts:18` defines fixed ERP/AI/network module lists; `platform/apps/api/src/common/product-profile.guard.ts:10` gates route prefixes by process phase. | Enabling an add-on for a customer must eventually resolve company capabilities rather than require a new product build. Preserve phase IDs and technical contracts during transition. |
| Licence visibility | `platform/apps/web/src/spine/registry/manifest.ts:284` filters on licence, then permissions. `platform/apps/web/src/spine/access/permissions.tsx:185` treats no licence row as an unrestricted install. | The existing web gate explains what a company can see; it is not the API subscription enforcement boundary. Make deployment mode explicit before commercial use. |
| API authorization | `platform/apps/api/src/app.module.ts:107` registers ProductProfileGuard and PermissionGuard; `platform/apps/api/src/common/permission.guard.ts:42` resolves tenant role permissions. | Add explicit service-capability checks for applicable API operations. Keep tenant authorization and commercial entitlement independent. A licensed module never grants a user permission. |
| Expiry | `platform/apps/api/src/modules/identity/me.service.ts:88` and `modules/administration/platform-ops.service.ts:216` describe soft licence expiry. | Define service expiry/deactivation behavior deliberately; do not turn a billing lapse into an abrupt shutdown of a plant or loss of historical records. |
| Licence bundling | `platform/apps/web/src/modules/network/manifest.ts:32` uses `purchase`; `modules/connectivity/manifest.ts:4` uses `integration`. | Network and connector commercial packages need a capability-to-existing-module mapping; a separate product name is not presently a separate entitlement. |
| Tenant identity | `platform/apps/api/src/common/tenant-groups.ts:4` contains two fixed group mappings and rejects ambiguity. `common/tenant.middleware.ts:11` verifies OIDC identity and establishes tenant context. | Build provisioned organization membership and verified tenant selection for actual customers. Keep the tenant fence and existing IDs intact. |
| Company creation | `platform/apps/api/src/modules/general/general.controller.ts:19` creates company records under an already authenticated tenant. | This endpoint is not service subscription, identity provisioning or tenant onboarding. |
| Domain writes | `platform/apps/api/src/modules/dataimport/domain-client.ts:4` sends import rows through domain HTTP endpoints with caller credentials; `ports/fulfilment-docs.port.ts:19` describes domain-owned transactions and idempotent document creation. | Reuse these ownership principles for services and connectors; never give a service an alternate path to inventory or accounting tables. |
| Customization | `platform/packages/db/src/schema/workflow.ts:15` provides a minimal, versioned approval engine, with instances pinned to definitions. Targeted schema/API inspection found settings and domain templates, not a general industry-pack/custom-field provisioning layer. | Treat broader industry customization as a platform backlog item. Existing templates are a foundation, not evidence of arbitrary workflow or industry support. |

## Proposed shared platform and record ownership

One platform should provide identity/tenant membership, permissions, audit, document references, file storage, notifications, capability entitlements, jobs, and connection monitoring. Start within the existing architecture; extracting services into separate deployments is not required merely to sell them separately.

| Record or operation | Canonical owner when XELOR ERP is used | Service boundary |
|---|---|---|
| Items, product structures and units | Engineering | Services reference or request these through approved ports/APIs. |
| Customer orders and quotations | Sales/quotation domain | Advanced quoting produces an approved configuration/quote version; order conversion remains with Sales. |
| Purchase orders, receipts and internal vendors | Purchasing, with inventory stock posting | AIKYANTRA owns collaboration/offer evidence and asks Purchasing to create the approved document. |
| Stock movements and accounting entries | Inventory and Accounts respectively | Services submit a governed posting request and retain the resulting canonical reference. |
| Maintenance requests/jobs/assets | Maintenance | Spares and approved costs connect to the stock/item/approval ports. |
| Inspection/finding/corrective-action evidence | Quality | Basic receiving/production gates remain available to the ERP; advanced quality subscription adds capabilities without disabling those gates. |
| Plans and scenarios | Planning | Plans reference dated source inputs; release asks Purchasing/Production to create their own commitments. |
| AI recommendations, approvals and execution evidence | ONYX governance/runtime | ONYX explains/proposes and records outcomes; ERP domains retain authority over business changes. |

Dependencies are explicit in `platform/apps/api/src/modules/maintenance/maintenance.module.ts:12`, `quality/quality.module.ts:9`, `planning/planning.module.ts:12` and `production/production.module.ts:8`. In particular, Quality supplies a gate used by Purchase and Production. Removing the entire module is therefore different from disabling advanced quality features.

For an external-ERP customer, select the authoritative source **per record type** during onboarding. Maintain external-to-local IDs, organization/site/unit mappings, source/version timestamps and completeness status. Imported records should remain evidence projections unless the customer explicitly migrates ownership. Existing readers are bounded: Tally stock is not available-to-promise stock (`modules/connectivity/adapters.ts:37`), SAP mappings cover a selected entity (`:51`), and Odoo refuses its truncation limit (`:66`). Do not advertise universal two-way synchronization from these readers.

A write handoff should carry a stable request ID, source version, target company, approval evidence and idempotency key. The external ERP response must supply its real record ID/status. Surface rejected, pending and ambiguous results, reconcile them, and retry only safely. Exporting a draft file is a valid initial handoff if clearly described; a generated recommendation or export is not a confirmed order.

## Activation, customization and discoverability

**Activation:** offer catalogue -> administrator selects service -> dependency/data check -> explicit permission setup -> configuration/import preview -> verified first workflow -> active. Keep trial, active, grace, read-only and deactivated states distinct. Define metering only for concrete units such as seats/assets/connections/AI consumption once scope is stable.

**Deactivation:** stop new paid service actions according to the agreed policy; drain or pause jobs explicitly; revoke connector access where appropriate; preserve ERP records, audit, exports and historical links. Show unresolved jobs/approvals and required replacements before deactivation. Disabling an advanced service must not remove a basic ERP inspection or posting dependency. Reactivation should restore configuration without duplicating records.

**Industry packs:** versioned configurations of terminology, enabled processes, fields/forms, validation rules, approval templates, dashboards and reports. Keep invariant stock/accounting/authorization rules in domain code. Personal views and company settings sit above an industry baseline; do not fork the application for each customer. Preview changes and pin active documents to their configuration version. Prove manufacturing plus one contrasting industry before claiming general support.

**Discovery:** use role-based work and business capabilities as the navigation vocabulary, with XELOR as the default workspace. Keep an administrator/service catalogue separate from daily task navigation; show unavailable services without exposing restricted business data. Each major service needs a clear landing page with its purpose, real status, primary action and setup requirements. Link across workflow stages using canonical records and permission-aware actions.

Concrete current example: supplier performance is opened through a **View evidence** button in a table column (`platform/apps/web/src/modules/network/screens/suppliers.tsx:50`, panel rendered at `:129`). Promote this to a discoverable Supplier Performance capability and link it beside supplier offers and purchase decisions. Distinguish an ERP buyer's own delivery/quality history from additional network-wide AIKYANTRA evidence when establishing entitlement boundaries. Do not create a second performance dataset merely to expose it in XELOR.

The home page chooses each module's first visible navigation entry (`platform/apps/web/src/spine/shell/home-overview.tsx:35`) and displays the first six module destinations (`:84`). Its KPI selection has a separate fixed profile priority (`:15`). Replace this with role/task priorities, pinned actions and outstanding work. Existing workspace grouping helps (`platform/apps/web/src/spine/registry/workspaces.ts:45`), but Mission Control is ordered first because of an older AI-led presentation (`:48`); the new product direction requires ERP task prominence when services are integrated.

## Prioritized scoped backlog and acceptance

| Priority / work | Acceptance before calling it complete |
|---|---|
| **P0: Capability catalogue and commercial boundaries** | One reviewed map identifies core ERP, industry pack and paid service features; dependencies and existing licence/permission keys are recorded. Basic records, navigation and customization are not accidentally sold as indispensable extras. |
| **P0: Entitlement lifecycle and API checks** | Two equivalent users in licensed/unlicensed tenants receive correct UI and direct API behavior; an entitlement never bypasses RBAC/RLS. Grace/read-only/deactivation behavior is explicit. Missing licence handling is explicit by deployment mode; existing production operations are preserved under the agreed policy. |
| **P0: Real tenant/service onboarding** | A new organization can be provisioned without source edits or demo identities; membership, administrator, service selection and initial data setup are auditable and safely resumable. Cross-tenant data remains inaccessible. |
| **P1: Capability discovery and connected workflows** | A first-time buyer reaches supplier performance from search, its starting page and a relevant offer/PO. A maintenance manager reaches requests, work and reliability without knowing technical modules. Home actions are role-relevant; all cross-links respect permission and activation state. |
| **P1: First service vertical** | Maintenance is the first packaging pilot; demonstrate setup -> request -> work order -> spares/labour -> approval/closure -> reliability evidence with a customer fixture. Advance quality and quoting follow with their missing workflow scope completed, not renamed demo screens. |
| **P1: External ERP service contract** | One named connector/version and one service have validated mappings, incomplete-data handling, repeatable imports and a traceable handoff. A retried approved request creates one target record; a rejected or ambiguous request is never shown as successful. |
| **P1: Versioned industry/company configuration** | Publish a supported field/form/approval configuration, show a safe preview, preserve earlier documents, and switch between manufacturing and one contrasting validated pack without a source fork or broken domain invariants. |
| **P2: Service lifecycle operations and expansion** | Activation/deactivation/reactivation with pending jobs preserves records and exposes unresolved work; operating measures show failures, recovery and consumption. Expand advanced warehouse, planning and connected-factory offerings only after validating their specific domain and connector needs. |

These acceptance checks are proposed future verification scope. This assessment did not run them or change application behavior.
