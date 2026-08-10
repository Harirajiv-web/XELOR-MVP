/**
 * THE DOCUMENT EDIT POLICY — one table that decides whether a mistake can be corrected
 * in place, corrected with a reason on the record, or must be corrected by a new entry.
 *
 * Before this file the system could create 222 things and change almost none of them: a
 * quantity typed wrong on a sales order was permanent. That is not a safe design either —
 * it pushes people to delete and re-key, which loses the trail far more thoroughly than an
 * edit ever would.
 *
 * But "let anything be edited" is the other wrong answer, and the reason is not taste. A
 * posted journal, a GST invoice and a stock movement have all been *reported* — to the
 * ledger, to the GST portal, to the stock on the shelf. §3 keeps those for eight years and
 * §3.3 hash-chains them. Editing one silently makes the eight-year record a record of
 * something that never happened, which is the one failure an audit trail exists to prevent.
 *
 * So editability is a property of the DOCUMENT'S STATE, declared here, in three tiers:
 *
 *   OPEN      the document has not been relied on by anyone yet — a draft order, a master
 *             nobody has transacted against. Change it freely; the audit records what it
 *             was and what it became, and that is enough.
 *
 *   AMEND     someone has relied on it — a vendor holds the approved PO, a customer was
 *             promised the confirmed order. It may still change, but the change is a fact
 *             about the business: it carries a reason, bumps a revision number, and where
 *             money moved it sends the document back for approval.
 *
 *   CLOSED    the document has been reported outside this system, or moved physical stock.
 *             It is never edited. The correction is a new, opposite entry that references
 *             it — which is also what an accountant would do on paper, and the only version
 *             of "fix it" that survives a GST audit.
 *
 * CLOSED still fixes the mistake. It refuses only the pretence that the mistake never
 * happened. Callers get `correctBy` so the UI can offer the right action rather than a
 * dead end.
 *
 * The map is exhaustive and typed: a document type with no entry is CLOSED, because the
 * fail-safe direction for "may this be changed" is no.
 */

/** What a caller may do to a document in its current state. */
export type EditTier = "open" | "amend" | "closed";

/** How a CLOSED document is corrected instead. */
export type CorrectionMethod =
  | "reversing_entry"
  | "credit_note"
  | "stock_adjustment"
  | "new_version"
  | "none";

export interface EditVerdict {
  readonly tier: EditTier;
  /** True for `open` and `amend` — the document may be written to. */
  readonly editable: boolean;
  /** `amend` only: the caller must supply a non-empty reason. */
  readonly reasonRequired: boolean;
  /** `amend` only: the change sends the document back through approval. */
  readonly reapprovalRequired: boolean;
  /** How to correct this instead, when `tier` is `closed`. */
  readonly correctBy: CorrectionMethod;
  /**
   * Why, in words a shop-floor user can act on. This is the string the UI puts on the
   * disabled button, so it names the state and the way forward, never an error code.
   */
  readonly reason: string;
}

interface StateRule {
  readonly tier: EditTier;
  readonly reapprovalRequired?: boolean;
  readonly correctBy?: CorrectionMethod;
  readonly reason: string;
}

interface DocumentRule {
  /** Human name used in messages: "A confirmed sales order …". */
  readonly label: string;
  /** Status → rule. A status absent from here is CLOSED by default. */
  readonly states: Readonly<Record<string, StateRule>>;
  /** Applied when the status is not listed, so a new status fails safe rather than open. */
  readonly fallback?: StateRule;
}

const OPEN = (label: string): StateRule => ({
  tier: "open",
  reason: `This ${label} is still a draft — change anything you need.`,
});

/**
 * Every document a user can create, and what may be done to it in each state.
 *
 * Keys are `module.entity`, matching the permission registry's first two segments, so a
 * rule and the permission that guards it cannot drift into different vocabularies.
 *
 * THE STATUS STRINGS ARE THE DATABASE'S, NOT INVENTED HERE. Each list below was taken from
 * the table's own CHECK constraint. That matters more than it looks: a status this table
 * does not know falls through to CLOSED, so a plausible-but-wrong spelling does not fail
 * loudly — it quietly makes the Edit button dead for every document in that state. The
 * `editPolicyCoversEveryStatus` test pins each list against the constraint.
 */
const RULES: Readonly<Record<string, DocumentRule>> = {
  // ---- Sales ---------------------------------------------------------------
  "sales.customer": {
    label: "customer",
    states: { active: { tier: "open", reason: "Customer details can be corrected at any time." } },
    fallback: { tier: "open", reason: "Customer details can be corrected at any time." },
  },
  "sales.order": {
    label: "sales order",
    states: {
      draft: OPEN("sales order"),
      credit_hold: {
        tier: "open",
        reason:
          "This order is held for credit and has not been promised to the customer — edit it freely.",
      },
      confirmed: {
        tier: "amend",
        reapprovalRequired: true,
        reason:
          "This order is confirmed and the customer has been promised it. Amending it needs a reason, and a change to value re-runs the credit check.",
      },
      partially_dispatched: {
        tier: "amend",
        reapprovalRequired: true,
        reason:
          "Part of this order has shipped. You can still amend what has NOT shipped — the dispatched quantity is fixed.",
      },
      dispatched: {
        tier: "closed",
        correctBy: "credit_note",
        reason:
          "This order has shipped and been invoiced. Raise a credit note against the invoice — editing a filed GST document is not permitted.",
      },
      cancelled: {
        tier: "closed",
        correctBy: "none",
        reason: "This order is cancelled. Copy it to a new order rather than editing it.",
      },
    },
  },

  // ---- Purchase ------------------------------------------------------------
  "purchase.vendor": {
    label: "vendor",
    states: { active: { tier: "open", reason: "Vendor details can be corrected at any time." } },
    fallback: { tier: "open", reason: "Vendor details can be corrected at any time." },
  },
  "purchase.po": {
    label: "purchase order",
    states: {
      draft: OPEN("purchase order"),
      rejected: {
        tier: "open",
        reason: "This PO was rejected and is back with you — fix it and submit it again.",
      },
      pending_approval: {
        tier: "amend",
        reapprovalRequired: true,
        reason:
          "This PO is with an approver. Editing it withdraws it from approval and sends it back through.",
      },
      approved: {
        tier: "amend",
        reapprovalRequired: true,
        reason:
          "This PO is approved and the vendor may already hold it. An amendment needs a reason and goes back for approval.",
      },
      partially_received: {
        tier: "amend",
        reapprovalRequired: true,
        reason:
          "Goods have been received against this PO. You can amend the outstanding quantity only — what has arrived is fixed.",
      },
      received: {
        tier: "closed",
        correctBy: "stock_adjustment",
        reason:
          "This PO is fully received and the stock is on the shelf. Correct it with a stock adjustment or a debit note against the receipt.",
      },
      cancelled: {
        tier: "closed",
        correctBy: "none",
        reason: "This PO is cancelled. Copy it to a new PO rather than editing it.",
      },
    },
  },
  "purchase.grn": {
    label: "goods receipt",
    states: {
      posted: {
        tier: "closed",
        correctBy: "stock_adjustment",
        reason:
          "This receipt already moved stock into the warehouse. Correct the quantity with a stock adjustment — the receipt is the record of what arrived.",
      },
    },
    fallback: {
      tier: "closed",
      correctBy: "stock_adjustment",
      reason: "A goods receipt is corrected by a stock adjustment, never by an edit.",
    },
  },

  // ---- Production ----------------------------------------------------------
  "production.order": {
    label: "production order",
    states: {
      planned: OPEN("production order"),
      in_progress: {
        tier: "amend",
        reason:
          "Work has started. You can still change the target quantity and warehouses — material already issued stays as it was issued.",
      },
      completed: {
        tier: "closed",
        correctBy: "stock_adjustment",
        reason:
          "This order is complete and its output was booked into stock. Correct the quantity with a stock adjustment.",
      },
      cancelled: {
        tier: "closed",
        correctBy: "none",
        reason: "This order is cancelled. Raise a new one rather than editing it.",
      },
    },
  },

  // ---- Engineering ---------------------------------------------------------
  "engineering.item": {
    label: "item",
    states: { active: { tier: "open", reason: "Item details can be corrected at any time." } },
    fallback: { tier: "open", reason: "Item details can be corrected at any time." },
  },
  "engineering.bom": {
    label: "bill of materials",
    states: {
      draft: OPEN("bill of materials"),
      active: {
        tier: "closed",
        correctBy: "new_version",
        reason:
          "This BOM is active and production orders are pinned to it. Publish a new version — changing it in place would silently alter builds already in progress.",
      },
    },
  },

  // ---- Inventory -----------------------------------------------------------
  "inventory.warehouse": {
    label: "warehouse",
    states: { active: { tier: "open", reason: "Warehouse details can be corrected at any time." } },
    fallback: { tier: "open", reason: "Warehouse details can be corrected at any time." },
  },
  "inventory.stock": {
    label: "stock entry",
    states: {
      posted: {
        tier: "closed",
        correctBy: "stock_adjustment",
        reason:
          "Stock entries are the ledger of what physically moved. Post a correcting entry — the original stays as the record of what was booked at the time.",
      },
    },
    fallback: {
      tier: "closed",
      correctBy: "stock_adjustment",
      reason: "Stock movements are corrected by a new entry, never by an edit.",
    },
  },

  // ---- Quality -------------------------------------------------------------
  "quality.inspection": {
    label: "inspection",
    states: {
      pending: OPEN("inspection"),
      in_progress: OPEN("inspection"),
      completed: {
        tier: "amend",
        reason:
          "This inspection is complete and its result may already have accepted or rejected the lot. Correcting a reading needs a reason — the original value stays visible in the history.",
      },
      cancelled: {
        tier: "closed",
        correctBy: "none",
        reason: "This inspection is cancelled. Raise a new one.",
      },
    },
  },

  // ---- Maintenance ---------------------------------------------------------
  "maintenance.asset": {
    label: "asset",
    states: { active: { tier: "open", reason: "Asset details can be corrected at any time." } },
    fallback: { tier: "open", reason: "Asset details can be corrected at any time." },
  },
  "maintenance.request": {
    label: "maintenance request",
    states: {
      submitted: OPEN("maintenance request"),
      acknowledged: {
        tier: "amend",
        reason: "This request has been acknowledged by the maintenance desk. Note why you are changing it.",
      },
      triaged: {
        tier: "amend",
        reason: "This request has been triaged. Note why you are changing it.",
      },
      rejected: {
        tier: "open",
        reason: "This request was rejected and is back with you — fix it and submit it again.",
      },
      mwo_created: {
        tier: "closed",
        correctBy: "none",
        reason:
          "A work order has been raised from this request. Change the work order instead — the request is the record of what was originally reported.",
      },
      merged: {
        tier: "closed",
        correctBy: "none",
        reason: "This request was merged into another. Change that one instead.",
      },
      converted_to_pm: {
        tier: "closed",
        correctBy: "none",
        reason: "This request became a preventive-maintenance schedule. Change the schedule instead.",
      },
      closed: {
        tier: "closed",
        correctBy: "none",
        reason: "This request is closed.",
      },
    },
  },
  "maintenance.workorder": {
    label: "work order",
    states: {
      draft: OPEN("work order"),
      approved: { tier: "amend", reason: "This work order is approved. Note why you are changing it." },
      assigned: { tier: "amend", reason: "This work order is assigned to a technician. Note why you are changing it." },
      in_progress: { tier: "amend", reason: "Work has started on this order. Note why you are changing it." },
      on_hold: { tier: "amend", reason: "This work order is on hold. Note why you are changing it." },
      completed: {
        tier: "closed",
        correctBy: "none",
        reason: "This work order is complete and its labour and spares are costed. Raise a follow-up order.",
      },
      closed: { tier: "closed", correctBy: "none", reason: "This work order is closed." },
      cancelled: { tier: "closed", correctBy: "none", reason: "This work order is cancelled." },
    },
  },

  // ---- Expenditure ---------------------------------------------------------
  "expenditure.claim": {
    label: "expense claim",
    states: {
      draft: OPEN("expense claim"),
      returned: { tier: "open", reason: "This claim came back to you — fix it and submit it again." },
      rejected: { tier: "open", reason: "This claim was rejected — fix it and submit it again." },
      submitted: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This claim is with an approver. Editing it withdraws it and sends it back through approval.",
      },
      in_approval: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This claim is in approval. Editing it withdraws it and sends it back through.",
      },
      approved: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This claim is approved for payment. Ask finance to reverse it and raise a corrected claim.",
      },
      posted: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This claim has been posted to the ledger. It is corrected by a reversing entry, not an edit.",
      },
      paid: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This claim has been paid. It is corrected by a reversing entry, not an edit.",
      },
      cancelled: { tier: "closed", correctBy: "none", reason: "This claim is cancelled." },
    },
  },
  "expenditure.advance": {
    label: "advance",
    states: {
      requested: OPEN("advance"),
      approved: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This advance is approved but not yet paid out. An amendment needs a reason and goes back for approval.",
      },
      disbursed: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This advance has been paid out. Correct it with a refund or a reversing entry.",
      },
      partially_settled: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This advance is being settled against claims. Correct it through the settlement, not an edit.",
      },
      settled: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This advance is settled. Correct it with a reversing entry.",
      },
      cancelled: { tier: "closed", correctBy: "none", reason: "This advance is cancelled." },
    },
  },
  "expenditure.travel": {
    label: "travel request",
    states: {
      draft: OPEN("travel request"),
      rejected: { tier: "open", reason: "This request was rejected — fix it and submit it again." },
      submitted: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This request is with an approver. Editing it sends it back through approval.",
      },
      approved: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This request is approved. An amendment needs a reason and goes back for approval.",
      },
      in_trip: {
        tier: "amend",
        reason: "The trip is under way. Note why you are changing it.",
      },
      claimed: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "A claim has been raised against this trip. Correct the claim instead.",
      },
      cancelled: { tier: "closed", correctBy: "none", reason: "This request is cancelled." },
    },
  },
  "expenditure.indirect": {
    label: "indirect expense",
    states: {
      draft: OPEN("indirect expense"),
      rejected: { tier: "open", reason: "This expense was rejected — fix it and submit it again." },
      submitted: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This expense is with an approver. Editing it sends it back through approval.",
      },
      in_approval: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This expense is in approval. Editing it sends it back through.",
      },
      blocked: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This expense is blocked. Fix what is wrong and note why — it goes back through approval.",
      },
      approved: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This expense is approved. Correct it with a reversing entry.",
      },
      po_raised: {
        tier: "closed",
        correctBy: "none",
        reason: "A purchase order has been raised from this expense. Amend the PO instead.",
      },
      posted: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This expense is posted to the ledger. Correct it with a reversing entry.",
      },
      paid: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason: "This expense has been paid. Correct it with a reversing entry.",
      },
      cancelled: { tier: "closed", correctBy: "none", reason: "This expense is cancelled." },
    },
  },

  // ---- People --------------------------------------------------------------
  "hrm.employee": {
    label: "employee",
    states: { active: { tier: "open", reason: "Employee details can be corrected at any time." } },
    fallback: { tier: "open", reason: "Employee details can be corrected at any time." },
  },
  "hrm.leave": {
    label: "leave application",
    states: {
      applied: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This application is with your manager. Editing it sends it back for a fresh decision.",
      },
      approved: {
        tier: "amend",
        reapprovalRequired: true,
        reason: "This leave is approved. Changing the dates needs a reason and your manager's approval again.",
      },
      rejected: {
        tier: "open",
        reason: "This application was rejected — fix the dates and apply again.",
      },
      cancelled: {
        tier: "closed",
        correctBy: "none",
        reason: "This application is cancelled. Apply again rather than editing it.",
      },
    },
  },

  // ---- Accounts ------------------------------------------------------------
  // Every state is CLOSED. A journal that has hit the ledger is corrected by its opposite,
  // never by an edit — this is the rule the whole CLOSED tier exists for.
  "accounts.journal": {
    label: "journal voucher",
    states: {
      posted: {
        tier: "closed",
        correctBy: "reversing_entry",
        reason:
          "A posted voucher is part of the ledger and the eight-year statutory record. Reverse it and post a corrected one — the pair shows exactly what happened and when it was fixed.",
      },
      reversed: {
        tier: "closed",
        correctBy: "none",
        reason: "This voucher has already been reversed. Post the corrected voucher.",
      },
    },
    fallback: {
      tier: "closed",
      correctBy: "reversing_entry",
      reason: "Ledger entries are corrected by a reversing entry, never by an edit.",
    },
  },

  // ---- Customer service ----------------------------------------------------
  "csp.ticket": {
    label: "ticket",
    states: {
      new: OPEN("ticket"),
      triaged: OPEN("ticket"),
      in_progress: OPEN("ticket"),
      pending_customer: OPEN("ticket"),
      reopened: OPEN("ticket"),
      resolved: {
        tier: "amend",
        reason: "This ticket is resolved and the customer has been told. Note why you are changing it.",
      },
      closed: {
        tier: "closed",
        correctBy: "none",
        reason: "This ticket is closed. Reopen it to make changes.",
      },
    },
  },
  "csp.spare": {
    label: "spare request",
    states: {
      submitted: OPEN("spare request"),
      quoted: {
        tier: "amend",
        reason: "This request has been quoted to the customer. Note why you are changing it.",
      },
      reserved: {
        tier: "amend",
        reason: "Stock is reserved against this request. Note why you are changing it.",
      },
      rejected: { tier: "open", reason: "This request was rejected — fix it and submit it again." },
      fulfilled: {
        tier: "closed",
        correctBy: "stock_adjustment",
        reason: "These spares have been issued. Correct the quantity with a stock adjustment.",
      },
      closed: { tier: "closed", correctBy: "none", reason: "This request is closed." },
    },
  },
};

const UNKNOWN_DOCUMENT: EditVerdict = {
  tier: "closed",
  editable: false,
  reasonRequired: false,
  reapprovalRequired: false,
  correctBy: "none",
  reason:
    "This kind of record has no edit policy, so it cannot be edited. That is deliberate: a document nobody has declared a rule for fails closed.",
};

/**
 * What may be done to `docType` in `status`.
 *
 * Pure and synchronous — it reads a table and nothing else, so a service can ask before
 * opening a transaction and the UI can ask without a round trip.
 */
export function editPolicy(docType: string, status: string): EditVerdict {
  const rule = RULES[docType];
  if (!rule) return UNKNOWN_DOCUMENT;

  const state = rule.states[status] ?? rule.fallback;
  if (!state) {
    return {
      ...UNKNOWN_DOCUMENT,
      reason: `A ${rule.label} in state "${status}" has no edit rule, so it cannot be edited.`,
    };
  }

  return {
    tier: state.tier,
    editable: state.tier !== "closed",
    reasonRequired: state.tier === "amend",
    reapprovalRequired: state.tier === "amend" && state.reapprovalRequired === true,
    correctBy: state.correctBy ?? "none",
    reason: state.reason,
  };
}

/**
 * The same question, as a guard. Throws the canonical envelope when the answer is no, so
 * a service reads as one line and every module refuses in the same words.
 *
 * `AppError` is not imported here — this package's error type lives in ./errors and
 * importing it would make a leaf utility depend on the error layer. The caller converts.
 */
export interface EditRefusal {
  readonly code: "DOCUMENT_NOT_EDITABLE" | "EDIT_REASON_REQUIRED";
  readonly httpStatus: 409 | 422;
  readonly message: string;
  readonly correctBy: CorrectionMethod;
}

/**
 * Returns `null` when the edit may proceed, or the refusal to raise.
 *
 * `reason` is the operator's stated reason for an amendment, not a message from us.
 */
export function checkEdit(
  docType: string,
  status: string,
  reason?: string | null,
): EditRefusal | null {
  const verdict = editPolicy(docType, status);

  if (!verdict.editable) {
    return {
      code: "DOCUMENT_NOT_EDITABLE",
      httpStatus: 409,
      message: verdict.reason,
      correctBy: verdict.correctBy,
    };
  }

  if (verdict.reasonRequired && !reason?.trim()) {
    return {
      code: "EDIT_REASON_REQUIRED",
      httpStatus: 422,
      message: `${verdict.reason} Please say why you are making this change.`,
      correctBy: "none",
    };
  }

  return null;
}

/** Every document type with a declared policy — used by the registry cross-check. */
export function editableDocTypes(): readonly string[] {
  return Object.keys(RULES).sort();
}
