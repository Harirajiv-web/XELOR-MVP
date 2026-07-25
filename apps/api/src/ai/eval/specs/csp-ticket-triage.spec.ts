import {
  keywordRuleClassifier,
  type GateRule,
  type GoldenSet,
  type TicketCategory,
  type TriageInput,
} from "@ind-core/platform";
import { registerMulticlassEvalSpec } from "../registry.js";

/**
 * Golden set for `csp.ticket_triage` (AI #3), scored on **macro-F1**.
 *
 * READ THIS BEFORE READING THE NUMBER.
 *
 * DECISIONS-V2 §4.2 registers `keyword_rule_classifier` as this feature's deterministic
 * baseline — the thing a MODEL has to beat before it may ship. No model is bound in CI, so
 * running the model against its own baseline would be a gate that cannot fail, and a gate
 * that cannot fail is worse than no gate: it produces a green tick nobody has earned.
 *
 * So this gate is the tier BELOW, and it is a real one:
 *
 *   baseline  = `customerHintOrSupport` — the honest naive comparator. Trust whatever the
 *               customer picked in the wizard; where they picked nothing, say "support".
 *               That is precisely what a service desk with no classifier does today.
 *   candidate = `keyword_rule_classifier` — the rules that actually ship.
 *
 * It answers a question worth asking — do the shipped rules beat believing the customer? —
 * and it PUBLISHES the macro-F1 the rules achieve, which is the bar a model must clear.
 * When a model is bound, the two slots move down one: baseline becomes the keyword
 * classifier and candidate becomes the model. That is a two-line change and the dataset
 * does not move.
 *
 * The cases are deliberately weighted towards the ways these are actually written at
 * 06:00 on a phone, and towards the rare categories. `rights_request` appears three times
 * against sixteen other cases; under macro-F1 it counts as much as `product_defect`,
 * because a DPDP request misfiled as "support" is a statutory clock nobody started.
 */
interface TriageCase extends TriageInput {}

const goldenSet: GoldenSet<TriageCase, string> = {
  featureKey: "csp.ticket_triage",
  datasetVersion: "v1",
  cases: [
    /* ---------------------------- product_defect --------------------------- */
    {
      id: "defect-oil-leak",
      input: {
        subject: "Oil leak at pump-shaft seal",
        description: "Seal weeping on the shaft since commissioning, line is down since 06:00. Please attend urgently.",
        hasSerial: true,
      },
      expected: "product_defect",
    },
    {
      id: "defect-rejected-lot",
      input: {
        subject: "Input shaft lot rejected at incoming inspection",
        description: "Whole lot rejected at GRN, runout out of tolerance on 8 of 20 pieces. Need urgent disposition.",
        hasSerial: false,
      },
      expected: "product_defect",
    },
    {
      id: "defect-noise",
      input: {
        subject: "Abnormal noise and vibration after 200 hours",
        description: "Pump has developed a knocking noise. Vibration reading has doubled.",
        hasSerial: true,
      },
      expected: "product_defect",
    },
    // §20.2's own TKT-2627-00015 is categorised **Support**, not a defect, and it is right
    // to be: the customer is asking how to store parts, not reporting that one failed.
    // Opening a quality investigation into a customer's own warehouse would be the wrong
    // answer in a way that costs an engineer a day.
    {
      id: "support-rust-guidance",
      input: {
        subject: "Surface rust on stored flanges",
        description: "Received parts have rust marks on the machined face. What is the storage guidance?",
        hasSerial: false,
      },
      expected: "support",
    },
    /* ---------------------------- spares_request --------------------------- */
    {
      id: "spare-seal-qty",
      input: {
        subject: "Spare needed: mechanical seal",
        description: "Please send 6 nos mechanical seal for CP-50. Qty 6.",
        hasSerial: false,
      },
      expected: "spares_request",
    },
    {
      id: "spare-impeller",
      input: {
        subject: "Need replacement part - impeller",
        description: "We need a spare impeller for our standby pump. Please quote.",
        hasSerial: true,
      },
      expected: "spares_request",
    },
    /* ---------------------------- warranty_query --------------------------- */
    {
      id: "warranty-check-serial",
      input: {
        subject: "Warranty check for shaft serial",
        description: "Is this machine still covered? Please confirm the warranty end date.",
        hasSerial: true,
      },
      expected: "warranty_query",
    },
    {
      id: "warranty-claim",
      input: {
        subject: "Claim under warranty",
        description: "We wish to raise a claim. The guarantee period should still be running.",
        hasSerial: true,
      },
      expected: "warranty_query",
    },
    /* ----------------------------- billing_query --------------------------- */
    {
      id: "billing-duplicate-invoice",
      input: {
        subject: "Request duplicate invoice",
        description: "We have misplaced the invoice for last month. Please send a copy for our records.",
        hasSerial: false,
      },
      expected: "billing_query",
    },
    {
      id: "billing-gst",
      input: {
        subject: "GST number wrong on e-invoice",
        description: "The IRN shows our old GSTIN. Kindly issue a credit note and a corrected bill.",
        hasSerial: false,
      },
      expected: "billing_query",
    },
    /* ----------------------------- service_query --------------------------- */
    {
      id: "service-amc-visit",
      input: {
        subject: "AMC visit scheduling for line-2 fixtures",
        description: "Please schedule the quarterly service visit for our AMC. Any time next week is fine.",
        hasSerial: false,
      },
      expected: "service_query",
    },
    {
      id: "service-preventive",
      input: {
        subject: "Preventive maintenance visit request",
        description: "Would like to book a service engineer for the annual preventive check.",
        hasSerial: false,
      },
      expected: "service_query",
    },
    /* ---------------------------- technical_query -------------------------- */
    {
      id: "tech-drawing-rev",
      input: {
        subject: "Flange coupling dimensional query vs drawing rev C",
        description: "The PCD on the supplied part does not match the drawing. Please confirm which revision applies.",
        hasSerial: false,
      },
      expected: "technical_query",
    },
    {
      id: "tech-torque",
      input: {
        subject: "How to set gland bolt torque",
        description: "What torque should be applied at the gland? Our fitment procedure does not say.",
        hasSerial: false,
      },
      expected: "technical_query",
    },
    /* ---------------------------- rights_request --------------------------- */
    // Rare, statutory, and easy to misfile as "support". Under macro-F1 these three carry
    // the same weight as the four defect cases, which is the entire reason macro-F1 was
    // chosen over accuracy.
    {
      id: "dpdp-erasure",
      input: {
        subject: "Please delete my data",
        description: "I no longer work at this company. Kindly erase my personal data from your portal.",
        hasSerial: false,
      },
      expected: "rights_request",
    },
    {
      id: "dpdp-access",
      input: {
        subject: "Right to access my information",
        description: "Under DPDP I would like a copy of the personal data you hold about me.",
        hasSerial: false,
      },
      expected: "rights_request",
    },
    {
      id: "dpdp-download",
      input: {
        subject: "Download my data",
        description: "How do I download my data from the customer portal before my account is closed?",
        hasSerial: false,
      },
      expected: "rights_request",
    },
    /* -------------------------------- support ------------------------------ */
    {
      id: "support-login",
      input: {
        subject: "Cannot sign in to the portal",
        description: "My colleague has left and I need access to our company account on the portal.",
        hasSerial: false,
      },
      expected: "support",
    },
    {
      id: "support-general",
      input: {
        subject: "Whom should we contact for site visits",
        description: "For information only, no rush. Who is our point of contact for the Pune plant?",
        hasSerial: false,
      },
      expected: "support",
    },

    /* ----------------------------- the hard ones --------------------------- */
    // Cases where two categories both have a claim. A set the classifier scores 1.000 on
    // has not measured it; these are where the disagreements actually are, and each label
    // below is the answer a service manager would defend, with the reason stated.

    // Three warranty words and one defect word. Filing it as a warranty query would lose
    // the NCR; filing it as a defect loses nothing, because the entitlement engine answers
    // the coverage question whatever the category says.
    {
      id: "hard-warranty-vs-defect",
      input: {
        subject: "Cracked casing — claim under warranty",
        description: "The volute casing has developed a crack after 4 months. We wish to claim this under warranty.",
        hasSerial: true,
      },
      expected: "product_defect",
    },
    // Same rule applied where it is less comfortable: the customer has asked for a visit,
    // but a gland leaking at four months is something Quality should see. The AMC visit is
    // how it gets fixed; the defect is what it IS.
    {
      id: "hard-service-vs-defect",
      input: {
        subject: "AMC visit needed — pump leaking",
        description: "Please send an engineer under our AMC. The pump is leaking at the gland.",
        hasSerial: true,
      },
      expected: "product_defect",
    },
    // Mentions spares throughout and is not a spares request: they already ordered.
    {
      id: "hard-billing-vs-spares",
      input: {
        subject: "Invoice for the spare parts order",
        description: "Please send the invoice for the spares we ordered last week. Payment is pending approval.",
        hasSerial: false,
      },
      expected: "billing_query",
    },
    // Urgency and a category are independent axes: this is a routine spares request that
    // happens to be urgent, not a defect.
    {
      id: "hard-spares-urgent",
      input: {
        subject: "Urgent spare seal required — machine stopped",
        description: "Our machine has stopped. Need 2 nos mechanical seal by tomorrow.",
        hasSerial: false,
      },
      expected: "spares_request",
    },
    // A colleague's login is account administration. The colleague is not the data
    // principal making the request, so this is NOT a DPDP rights request — a distinction
    // that matters because one of them starts a statutory clock and the other does not.
    {
      id: "hard-support-vs-rights",
      input: {
        subject: "Remove my colleague from the portal",
        description: "Please remove my colleague's login. He has left the company.",
        hasSerial: false,
      },
      expected: "support",
    },
    // A question about a fitment, phrased around a symptom.
    {
      id: "hard-tech-vs-defect",
      input: {
        subject: "Impeller clearance query after fitment",
        description: "After fitting the new impeller there is a rub. What is the correct running clearance?",
        hasSerial: false,
      },
      expected: "technical_query",
    },
    // A performance failure described entirely in domain terms — "not building pressure",
    // "below the rated curve" — with not one word from any defect vocabulary. The rules
    // reach the right answer here for a WEAK reason: the attached serial is the only
    // evidence in play, so the suggestion arrives with a confidence of 0.48 and the UI
    // collapses the chip. Right answer, honest uncertainty.
    {
      id: "hard-defect-serial-only",
      input: {
        subject: "Pump is not building pressure",
        description: "Since installation the discharge pressure is 30% below the rated curve.",
        hasSerial: true,
      },
      expected: "product_defect",
    },
    // THE KNOWN MISS, kept in the set deliberately.
    //
    // The same complaint from a customer who did not quote a serial — which is how most of
    // them arrive. Now there is no evidence at all, and the rules return `support` at 0.2
    // confidence. That is the honest failure mode of a keyword classifier: no answer,
    // visibly, rather than a confident wrong one.
    //
    // It stays in the golden set because it is precisely the ceiling a MODEL exists to
    // raise, and a gate that quietly dropped the case it fails would be measuring nothing.
    // Adding "not building" to the keyword list would fix the number and fix nothing else.
    {
      id: "hard-defect-no-keyword",
      input: {
        subject: "Pump is not building pressure",
        description: "Since installation the discharge pressure is 30% below the rated curve.",
        hasSerial: false,
      },
      expected: "product_defect",
    },
  ],
};

/**
 * The naive comparator: believe the customer's own wizard selection, and where they made
 * none, call it support. This is what a service desk without a classifier does, so it is
 * the honest thing for the shipped rules to have to beat.
 */
function customerHintOrSupport(c: TriageCase): string {
  return c.categoryHint ?? "support";
}

const rule: GateRule = { metric: "macro-F1", tolerance: 0.05, requireMustPass: true };

registerMulticlassEvalSpec<TriageCase>({
  kind: "multiclass",
  featureKey: "csp.ticket_triage",
  loadGoldenSet: () => goldenSet,
  baseline: customerHintOrSupport,
  candidate: (c) => keywordRuleClassifier(c).suggestedCategory,
  /**
   * The two assertions no macro-F1 may buy its way past.
   *
   *  - A data-protection request must never be classified as anything else. It carries a
   *    statutory clock, and a misfiled one is a clock nobody started.
   *  - A stopped line must be suggested `urgent`. The whole point of the priority is the
   *    person standing next to a machine that is not running.
   */
  mustPass: (c, expected, predicted) => {
    const failures: string[] = [];
    if (expected === ("rights_request" satisfies TicketCategory) && predicted !== expected) {
      failures.push("statutory_rights_request_must_not_be_misfiled");
    }
    const text = `${c.subject} ${c.description}`.toLowerCase();
    if (/line is down|line-down|production stopped/.test(text)) {
      if (keywordRuleClassifier(c).suggestedPriority !== "urgent") {
        failures.push("line_down_must_be_urgent");
      }
    }
    return failures;
  },
  rule,
});
