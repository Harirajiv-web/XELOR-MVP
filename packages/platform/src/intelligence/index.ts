/**
 * PHASE 2's INTELLIGENCE LAYER, in four files you can read in one sitting.
 *
 *   sources.ts    where the facts come from — our modules by name, and the shelf of systems
 *                 that are honestly NOT connected.
 *   normalise.ts  our Phase 1 rows, turned into the five shapes Phase 2 reasons about.
 *   engine.ts     the swappable seam. Today: rules and arithmetic. Never a model pretending.
 *   pipeline.ts   the thirteen phases, derived from what a step actually did.
 *
 * Phase 1 is the ERP and the system of record. Phase 2 reads it, works out what is true,
 * recommends, asks when it must, acts through the owning module's own port, verifies the
 * result and explains itself. Nothing in this folder writes to Phase 1.
 */
export * from "./sources.js";
export * from "./normalise.js";
export * from "./engine.js";
export * from "./pipeline.js";
