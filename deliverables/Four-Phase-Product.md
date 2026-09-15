# XELOR, ONYX and AIKYANTRA: product responsibilities

Implementation date: 7 September 2026. Product naming updated: 11 September 2026.

The working directory is `C:/ORGANISED/XELOR-MVP`. `XELOR/` owns the ERP profile, `ONYX/` owns the AI intelligence profile, and `AIKYANTRA/` owns the supplier network profile. `INTEGRATED/` combines all three in one workspace. Their shared application source remains in `platform/`.

The strongest product promise is: **understand whether an order can be delivered, find a feasible recovery when it cannot, and carry the approved decision into actual factory and supplier records.**

## 1. XELOR: the manufacturing ERP

A system of record for customer and item masters, engineering/BOMs, quotations and revisions, sales orders, purchase orders and receipts, inventory and reservations, production/planning, quality, maintenance, service, people, accounts and expenditure. Existing modules from the original ERP remain in the canonical source. Factory-operation projections and fulfilment domain writer methods are consolidated rather than lost in separate forks.

Commercial conversion is atomic: converting a quotation creates its sales order in the same database transaction. Failed transactions do not leave detached orders. Purchase-order commitments include additional landed charges from the awarded quote.

## 2. ONYX: the AI intelligence layer

A connection workspace supports native XELOR ERP records, Odoo, Tally, SAP, generic JSON/CSV sources, and Vyapar file imports. Each connection records its test/sync status and last observation. Credentials are encrypted; server-side origin controls limit destinations. A connection does not become "live" merely because its name exists.

External records normalize into orders, inventory and suppliers. The current Odoo adapter targets JSON-2; Tally uses XML; SAP uses configurable OData entity reads. These are bounded adapters, not universal access to every module/version. File imports are the supported Vyapar route; a public transactional API is not assumed. External-system writes require future vendor-specific mapping and approval work.

The decisions workspace includes:

- **Order commitment:** stock availability, lead time, capacity confirmation, date and margin checks. Missing costs or unconfirmed capacity remain explicit unknowns.
- **Recovery comparison:** compare available quantity, arrival date and landed cost. Missing price/lead-time evidence prevents confident ranking.
- **Grounded questions:** answers from synchronized evidence with source and freshness references. The implemented connection Q&A uses deterministic rules and identifies this mode; it is not an unrestricted language model.
- **Outcome measurement:** record baseline, actual or estimated results, sample sizes and periods. Comparable observations can show measured change; estimates never become measured savings.

The inherited governed copilot/agent runtime and fulfilment workflows also remain. The local configuration uses its stub provider. Connecting an external ERP does not automatically give all inherited agents write access to that ERP.

## 3. AIKYANTRA: the supplier network

A supplier network supports company profiles, capabilities, invitations and supplier response links. Buyers can issue RFQs, gather prices and delivery promises, compare landed costs, record technical gates and award an eligible quote. Measured supplier delivery/quality evidence remains distinct from unknown performance.

Multi-line tenders add grouped requirements, deadlines, publication and closure, evaluation and all-line awards. Technical rejection, unmet minimum order quantity, incompatible need dates and segregation-of-duties violations block awards. The parent tender cannot be bypassed through an individual line award. Concurrent award requests produce one set of purchase orders.

Supplier invitations are composed in preview by default. Live delivery adapters require configured credentials and provider settings. A supplier can reply through a scoped link without creating an ERP account; that does not give them tenant-wide access.

## 4. Integrated workspace: ERP, intelligence and supplier network

The integrated profile combines XELOR ERP, ONYX intelligence and the AIKYANTRA supplier network under one professional interface. A typical journey is:

1. Create the customer quotation and convert it to a sales order.
2. Synchronize native manufacturing evidence and assess the commitment.
3. Examine a material shortage and compare recovery alternatives.
4. Raise an RFQ or multi-line tender and collect supplier responses.
5. Review delivery/MOQ/technical gates; a separate authorized person awards it.
6. Use the generated purchase orders in the ERP receipt, quality and stock workflow.
7. Refresh evidence and record the actual outcome against a comparable baseline.

This is a shared workflow across modules. Some transitions are explicit user actions; the product does not silently turn every recommendation into a transaction.

## Interface and devices

A navy, teal and warm-neutral visual system replaces the inconsistent shell. Product-specific navigation, an overview workspace, readable cards/tables, connection and decision workspaces, and tender screens support the main journeys. Existing domain screens inherit shared styling; specialized legacy visualizations remain specialized views.

The same application serves laptop and phone screens with mobile navigation and installation support. Server records are shared across devices; automatic push refresh and offline transaction queues are not implemented. The offline screen explains how to reconnect without caching confidential business records.

## What makes this a stronger idea

The differentiators to validate with customers are commitment feasibility, explicit uncertainty, supplier recovery grounded in real delivery evidence, installation over existing systems and measurable outcomes. The implementation supports these workflows; superiority and a "9/10" business outcome still require customer usage and evidence.

A practical pilot should measure quotation-to-order time, RFQ turnaround, buyer effort, emergency purchases and on-time delivery. Capture comparable periods and sample sizes rather than inserting optimistic savings into a dashboard.
