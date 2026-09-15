import type { DemoScenario } from "./demo-scenarios";

/**
 * Long-form presenter journeys — DELIBERATELY EMPTY.
 *
 * These three journeys narrated a company that does not exist: an invented customer, an
 * invented order reference, an order value in lakhs, a quantity of custom assemblies, a
 * four-signal crisis morning. Narration only — nothing here ever seeded a record or called
 * an API — but on screen a fictional customer and a fictional order value are indistinguishable
 * from the tenant's own, and this tenant has neither.
 *
 * The export, its name and its type are unchanged so importers keep compiling. Anything added
 * back belongs to a seeded demo tenant whose records actually exist, and must stay labelled
 * as a scenario wherever it is shown.
 */
export const fullScaleDemoScenarios: DemoScenario[] = [];
