# Architecture and product decisions

Start with the [current product names and workspace decision](00-governance/03-product-names-and-workspace.md): XELOR is the ERP, ONYX is the AI intelligence layer, and AIKYANTRA is the supplier network.

The [consolidation ADR](00-governance/02-four-product-consolidation.md) defines one shared implementation and compatible product profiles. The [binding platform decisions](00-governance/01-binding-platform-decisions-v2.md) continue to govern the stack, tenant isolation, domain-owned transactions, permissions, audit and idempotency.

The September 11 naming decision overrides historical product names. The consolidation ADR overrides historical fork topology. Earlier module blueprints remain design references; their presence does not establish that every described feature is implemented.

Current product journeys are in [the product guide](../deliverables/Four-Phase-Product.md). Development starts from [the workspace README](../README.md) and the shared `platform/` directory.
