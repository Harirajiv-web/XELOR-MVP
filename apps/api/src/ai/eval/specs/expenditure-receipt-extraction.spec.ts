import {
  crossCheckReceipt,
  keywordCategoriser,
  type GateRule,
  type GoldenSet,
  type HeadKeywordSpec,
  type ReceiptDraft,
} from "@ind-core/platform";
import { registerMulticlassEvalSpec } from "../registry.js";

/**
 * Golden set for `expenditure.receipt_extraction` (AI #1), scored on **macro-F1** over the
 * expense head each receipt should be categorised to.
 *
 * WHAT THIS GATE MEASURES, AND WHAT IT DOES NOT.
 *
 * The blueprint's ship gate is ≥50 labelled Indian receipts, scored on field accuracy
 * against Azure Document Intelligence, with zero uncaught arithmetic inconsistencies. Two
 * of those three parts cannot honestly run in this prototype: there are no receipt IMAGES
 * in the repository, and no Azure subscription to compare against. Asserting a field
 * accuracy we have not measured would be worse than measuring something smaller.
 *
 * So this gate measures the part that IS real here — **auto-categorisation** — and the
 * arithmetic cross-checks are asserted separately as must-pass conditions on every case.
 * That second half matters more than the headline: "zero uncaught arithmetic
 * inconsistencies" is the property that stops a hallucinated total becoming a payment, and
 * it is checkable without a single image.
 *
 *   baseline  = `firstWordOfMerchant` — the naive comparator: guess from the first word,
 *               which is roughly what a person skim-filing receipts does.
 *   candidate = `keyword_rule_classifier` over the head master's own `category_keywords`.
 *
 * The must-pass assertions are the real gate:
 *   1. Every receipt whose arithmetic does NOT reconcile must be caught — a miss here is a
 *      wrong number reaching a claim, which is the failure this feature must never have.
 *   2. Every receipt whose arithmetic DOES reconcile must come back clean — a detector
 *      that flags everything catches all errors and is switched off within a week.
 */
interface ReceiptCase {
  draft: ReceiptDraft;
  expectedGstRate?: number | null;
  /** Whether the receipt's own figures reconcile. The must-pass conditions key on this. */
  arithmeticSound: boolean;
}

/** The seeded head keywords, in the shape `category_keywords` holds them. */
const HEADS: HeadKeywordSpec[] = [
  { code: "EH-TRV-AIR", name: "Air and rail", keywords: ["indigo", "air india", "vistara", "spicejet", "akasa", "irctc", "railway", "boarding pass", "pnr", "e-ticket"] },
  { code: "EH-TRV-HTL", name: "Lodging", keywords: ["hotel", "residency", "inn", "lodge", "suites", "guest house", "room rent", "tariff", "check-in"] },
  { code: "EH-TRV-MEA", name: "Meals", keywords: ["restaurant", "cafe", "dhaba", "hotel meals", "food", "bhojan", "canteen", "tiffin", "barbeque"] },
  { code: "EH-TRV-CONV", name: "Conveyance", keywords: ["ola", "uber", "travels", "taxi", "cab", "auto", "rickshaw", "transfer", "toll", "parking"] },
  { code: "EH-PRF-FEE", name: "Professional fees", keywords: ["chartered", "consult", "advocate", "audit", "professional", "advisory", "company secretary"] },
  { code: "EH-PWR-FUL", name: "Power and fuel", keywords: ["diesel", "hsd", "furnace oil", "lpg", "indian oil", "bharat petroleum", "hp petrol"] },
  { code: "EH-OFF-MSC", name: "Office and misc", keywords: ["stationery", "printer", "cartridge", "courier", "subscription", "xerox"] },
  { code: "EH-FAC-HKP", name: "Housekeeping", keywords: ["housekeeping", "facility", "cleaning", "pest control", "security", "manpower"] },
];

const receipt = (o: Partial<ReceiptDraft>): ReceiptDraft => ({
  merchant: "",
  invoiceDate: "2026-07-06",
  supplierGstin: null,
  recipientGstin: null,
  taxableValue: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  total: 0,
  currency: "INR",
  lines: [],
  ...o,
});

const goldenSet: GoldenSet<ReceiptCase, string> = {
  featureKey: "expenditure.receipt_extraction",
  datasetVersion: "v1",
  cases: [
    /* ------------------------- reconciling receipts ------------------------ */
    {
      id: "hotel-rajkot",
      input: {
        draft: receipt({
          merchant: "Hotel Saurashtra Residency",
          invoiceNo: "HSR/26-27/0412",
          supplierGstin: "24AAHFH2811Q1Z3",
          recipientGstin: "27AABCT1234F1Z5",
          placeOfSupplyStateCode: "24",
          taxableValue: 6322,
          cgst: 379,
          sgst: 379,
          total: 7080,
          lines: [{ description: "Deluxe room, 2 nights", amount: 6322 }],
        }),
        expectedGstRate: 12,
        arithmeticSound: true,
      },
      expected: "EH-TRV-HTL",
    },
    {
      id: "indigo-flight",
      input: {
        draft: receipt({
          merchant: "InterGlobe Aviation (IndiGo)",
          taxableValue: 8400,
          cgst: 0,
          sgst: 0,
          igst: 420,
          total: 8820,
          lines: [{ description: "PNR X7K2QM, PNQ-MAA", amount: 8400 }],
        }),
        expectedGstRate: 5,
        arithmeticSound: true,
      },
      expected: "EH-TRV-AIR",
    },
    {
      id: "ola-cab",
      input: {
        draft: receipt({ merchant: "Ola Cabs", taxableValue: 420, igst: 21, total: 441, lines: [{ description: "Airport transfer", amount: 420 }] }),
        expectedGstRate: 5,
        arithmeticSound: true,
      },
      expected: "EH-TRV-CONV",
    },
    {
      id: "barbeque-dinner",
      input: {
        draft: receipt({ merchant: "Barbeque Nation", taxableValue: 1340, cgst: 33.5, sgst: 33.5, total: 1407, lines: [{ description: "Dinner, 2 covers", amount: 1340 }] }),
        expectedGstRate: 5,
        arithmeticSound: true,
      },
      expected: "EH-TRV-MEA",
    },
    {
      id: "ca-firm",
      input: {
        draft: receipt({
          merchant: "Deshpande & Associates, Chartered Accountants",
          supplierGstin: "27AAAFD1234A1Z2",
          recipientGstin: "27AABCT1234F1Z5",
          taxableValue: 45000,
          cgst: 4050,
          sgst: 4050,
          total: 53100,
          lines: [{ description: "Quarterly internal audit", amount: 45000 }],
        }),
        expectedGstRate: 18,
        arithmeticSound: true,
      },
      expected: "EH-PRF-FEE",
    },
    {
      id: "indian-oil-diesel",
      input: {
        draft: receipt({ merchant: "Indian Oil Corporation", taxableValue: 12000, cgst: 1080, sgst: 1080, total: 14160, lines: [{ description: "HSD 120 L", amount: 12000 }] }),
        expectedGstRate: 18,
        arithmeticSound: true,
      },
      expected: "EH-PWR-FUL",
    },
    {
      id: "stationery",
      input: {
        draft: receipt({ merchant: "Venkatesh Stationery Mart", taxableValue: 2400, cgst: 216, sgst: 216, total: 2832, lines: [{ description: "Printer cartridge", amount: 2400 }] }),
        expectedGstRate: 18,
        arithmeticSound: true,
      },
      expected: "EH-OFF-MSC",
    },
    {
      id: "arka-housekeeping",
      input: {
        draft: receipt({
          merchant: "Arka Facility Services",
          supplierGstin: "27AAAFA9999A1Z1",
          recipientGstin: "27AABCT1234F1Z5",
          taxableValue: 40000,
          cgst: 3600,
          sgst: 3600,
          total: 47200,
          lines: [{ description: "Housekeeping AMC, July 2026", amount: 40000 }],
        }),
        expectedGstRate: 18,
        arithmeticSound: true,
      },
      expected: "EH-FAC-HKP",
    },
    {
      id: "irctc-train",
      input: {
        draft: receipt({ merchant: "IRCTC", taxableValue: 1450, igst: 72.5, total: 1522.5, lines: [{ description: "2A PNQ-CSMT", amount: 1450 }] }),
        expectedGstRate: 5,
        arithmeticSound: true,
      },
      expected: "EH-TRV-AIR",
    },

    /* ----------------------- NON-reconciling receipts ---------------------- */
    // These are the cases the gate actually exists for. The category is still expected to
    // be right, but the must-pass condition is that the arithmetic failure is CAUGHT.

    // The demo's contrast seed: a thermal-print taxi receipt whose lines sum to ₹730
    // against a printed total of ₹850.
    {
      id: "taxi-line-sum-mismatch",
      input: {
        draft: receipt({
          merchant: "Sai Tours & Travels",
          taxableValue: 850,
          total: 850,
          lines: [
            { description: "Airport transfer", amount: 480 },
            { description: "Waiting charges", amount: 250 },
          ],
        }),
        arithmeticSound: false,
      },
      expected: "EH-TRV-CONV",
    },
    // The §15 V-EXT-05 case: taxable + tax reconcile with each other but not with the
    // printed total, so the inclusive/exclusive reading is genuinely ambiguous.
    {
      id: "hotel-total-unreconciled",
      input: {
        draft: receipt({
          merchant: "Hotel Suvarna Inn",
          taxableValue: 6322,
          cgst: 379,
          sgst: 379,
          total: 7200,
          lines: [{ description: "Room, 2 nights", amount: 6322 }],
        }),
        expectedGstRate: 12,
        arithmeticSound: false,
      },
      expected: "EH-TRV-HTL",
    },
    // Both tax splits on one supply, which cannot be true of a single invoice.
    {
      id: "both-splits",
      input: {
        draft: receipt({
          merchant: "Sagar Dhaba",
          taxableValue: 1000,
          cgst: 25,
          sgst: 25,
          igst: 50,
          total: 1100,
          lines: [{ description: "Meals", amount: 1000 }],
        }),
        arithmeticSound: false,
      },
      expected: "EH-TRV-MEA",
    },
    // A GSTIN whose state code contradicts the stated place of supply.
    {
      id: "gstin-state-mismatch",
      input: {
        draft: receipt({
          merchant: "Ashoka Residency",
          supplierGstin: "24AAHFH2811Q1Z3",
          placeOfSupplyStateCode: "27",
          taxableValue: 5000,
          cgst: 300,
          sgst: 300,
          total: 5600,
          lines: [{ description: "Room", amount: 5000 }],
        }),
        expectedGstRate: 12,
        arithmeticSound: false,
      },
      expected: "EH-TRV-HTL",
    },
  ],
};

/** The naive comparator: guess from the merchant's first word. */
function firstWordOfMerchant(c: ReceiptCase): string {
  const first = c.draft.merchant.toLowerCase().split(/\s+/)[0] ?? "";
  const hit = HEADS.find((h) => h.keywords.some((k) => k === first));
  return hit?.code ?? "EH-OFF-MSC";
}

const rule: GateRule = { metric: "macro-F1 (head categorisation)", tolerance: 0.05, requireMustPass: true };

registerMulticlassEvalSpec<ReceiptCase>({
  kind: "multiclass",
  featureKey: "expenditure.receipt_extraction",
  loadGoldenSet: () => goldenSet,
  baseline: firstWordOfMerchant,
  candidate: (c) => keywordCategoriser({ merchant: c.draft.merchant, lines: c.draft.lines }, HEADS).headCode ?? "EH-OFF-MSC",
  /**
   * The conditions that matter more than the headline.
   *
   * A single uncaught arithmetic inconsistency fails the gate outright, whatever the
   * categorisation score — because a wrong number reaching a claim is the one failure this
   * feature is not allowed to have. And a false alarm fails it too: a detector that flags
   * every receipt catches every error and is switched off by Friday.
   */
  mustPass: (c) => {
    const failures: string[] = [];
    const checked = crossCheckReceipt(c.draft, { expectedGstRate: c.expectedGstRate ?? null });
    if (!c.arithmeticSound && checked.clean) failures.push("arithmetic_inconsistency_not_caught");
    if (c.arithmeticSound && !checked.clean) {
      failures.push(`false_alarm_on_sound_receipt:${checked.needsReview.join(",")}`);
    }
    return failures;
  },
  rule,
});
