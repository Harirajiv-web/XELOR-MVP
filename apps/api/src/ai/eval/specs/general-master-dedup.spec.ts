import type { GoldenSet, GateRule } from "@ind-core/platform";
import {
  exactIdMatch,
  hasDuplicate,
  type MasterRecord,
} from "../../../modules/general/dedup.core.js";
import { registerEvalSpec } from "../registry.js";

interface DedupCase {
  candidate: MasterRecord;
  existing: MasterRecord[];
}

const G1 = "27ABCDE1234F1Z5";
const CIN1 = "U12345MH2020PTC000111";

/**
 * Golden set for general.master_dedup (AI #2). Labelled `expected` = "is the candidate a
 * duplicate of something in `existing`?" The mix is deliberate: exact-id duplicates (the
 * baseline can catch), NAME-VARIANT duplicates (only the fuzzy detector catches), and
 * clearly-distinct records (both must reject) — so the detector must beat the exact-id
 * baseline on recall WITHOUT losing precision.
 */
const goldenSet: GoldenSet<DedupCase, boolean> = {
  featureKey: "general.master_dedup",
  datasetVersion: "v1",
  cases: [
    // --- duplicates the baseline CAN catch (exact id) ---
    { id: "gstin-exact", input: { candidate: { legalName: "ABC Corp", gstin: G1 }, existing: [{ id: "e1", legalName: "ABC Corporation", gstin: G1 }] }, expected: true },
    { id: "cin-exact", input: { candidate: { legalName: "XYZ Ltd", cin: CIN1 }, existing: [{ id: "e2", legalName: "XYZ Limited", cin: CIN1 }] }, expected: true },
    // --- duplicates ONLY the fuzzy detector catches (name variants, no id) ---
    { id: "suffix-pvt-vs-private", input: { candidate: { legalName: "Zenith Metals Pvt Ltd" }, existing: [{ id: "e3", legalName: "Zenith Metals Private Limited" }] }, expected: true },
    { id: "spacing-electrofab", input: { candidate: { legalName: "Kaveri ElectroFab Industries" }, existing: [{ id: "e4", legalName: "Kaveri Electrofab Industries Ltd" }] }, expected: true },
    { id: "punctuation-trishul", input: { candidate: { legalName: "Trishul Precision Components" }, existing: [{ id: "e5", legalName: "Trishul Precision Components Pvt. Ltd." }] }, expected: true },
    { id: "suffix-anand", input: { candidate: { legalName: "Anand Auto Parts" }, existing: [{ id: "e6", legalName: "Anand Auto Parts Private Limited" }] }, expected: true },
    { id: "spelling-bharat", input: { candidate: { legalName: "Bharat Forge Works" }, existing: [{ id: "e7", legalName: "Bharath Forge Works" }] }, expected: true },
    // --- clearly-distinct records BOTH must reject (precision) ---
    { id: "distinct-1", input: { candidate: { legalName: "Zenith Metals" }, existing: [{ id: "e8", legalName: "Falcon Dynamics" }] }, expected: false },
    { id: "distinct-traders", input: { candidate: { legalName: "Sharma Traders" }, existing: [{ id: "e9", legalName: "Verma Traders" }] }, expected: false },
    { id: "distinct-engineering", input: { candidate: { legalName: "Ganesh Engineering" }, existing: [{ id: "e10", legalName: "Krishna Engineering" }] }, expected: false },
    { id: "distinct-city", input: { candidate: { legalName: "Coimbatore Castings" }, existing: [{ id: "e11", legalName: "Pune Fabricators" }] }, expected: false },
    { id: "distinct-empty", input: { candidate: { legalName: "Alpha Pumps" }, existing: [] }, expected: false },
  ],
};

const rule: GateRule = { metric: "F1", tolerance: 0, requireMustPass: true };

registerEvalSpec<DedupCase>({
  featureKey: "general.master_dedup",
  loadGoldenSet: () => goldenSet,
  // baseline: exact GSTIN/CIN match only (the registry's pg_trgm_gstin_exact reference).
  baseline: (c) => c.existing.some((e) => exactIdMatch(c.candidate, e)),
  // candidate: the full detector (exact id OR strong/possible name similarity).
  candidate: (c) => hasDuplicate(c.candidate, c.existing),
  // must-pass: an exact-id duplicate must NEVER be missed by the shipped detector.
  mustPass: (c, _expected, predicted) => {
    const hasExact = c.existing.some((e) => exactIdMatch(c.candidate, e));
    return hasExact && !predicted ? ["exact_id_must_flag"] : [];
  },
  rule,
});
