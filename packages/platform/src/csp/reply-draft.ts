/**
 * REPLY DRAFTING — AI #6 `csp.reply_draft` (CSP §13.2, DECISIONS-V2 §4.2).
 *
 * Registered **stretch**, Tier-2 (draft-record), baseline `canned_response_template`,
 * degraded mode `feature_hidden`. All four of those facts are implemented here.
 *
 * This is the feature with the sharpest failure mode in the whole product, and the
 * blueprint names it: the Klarna lesson. Assistive drafting is where the evidence is good;
 * autonomy is where it broke. So the rule is absolute — **a draft is never sent.** It is
 * stored as `author_type = ai_draft`, which `isCustomerVisible` excludes, and it becomes a
 * customer-visible comment only when a human presses send.
 *
 * The grounding gate is stricter than the payslip explainer's, because a support reply is
 * a statement a company makes to its customer. It may not:
 *   - **commit to anything** — a date, a refund, a replacement, a free-of-charge repair.
 *     "We will replace this under warranty" is not a sentence; it is a liability, and the
 *     entitlement engine, not a model, decides coverage.
 *   - **admit or deny a defect.** "This is a manufacturing defect" pre-empts the NCR.
 *   - **quote a figure that is not on the ticket.**
 *   - **name an internal person, system or note.**
 */

export interface ReplyContext {
  ticketNo: string;
  subject: string;
  customerName: string;
  status: string;
  slaPromise: string | null;
  /** Public comments only — an internal note must never reach a drafting prompt. */
  publicThread: readonly { author: "customer" | "agent"; body: string }[];
  entitlementResult: string | null;
  /** Figures that legitimately appear on the ticket and may therefore be repeated. */
  knownNumbers: readonly number[];
}

export interface ReplyDraft {
  body: string;
  source: "canned_template" | "model";
  /** Always false at creation. Sending is a separate, explicit, human act. */
  sent: boolean;
  banner: string;
}

export const DRAFT_BANNER = "AI draft — review before sending";

/** The canned templates. This is the registered baseline: it ships whether or not the
 *  model does, and it is what an agent gets when the tenant has AI switched off. */
const TEMPLATES: Record<string, (c: ReplyContext) => string> = {
  acknowledge: (c) =>
    `Thank you for raising ${c.ticketNo}. We have logged your request about "${c.subject}" and our service team is reviewing it.` +
    (c.slaPromise ? ` ${c.slaPromise}.` : "") +
    ` You can track progress and add details on the portal at any time.`,
  awaiting_info: (c) =>
    `Thank you for your patience on ${c.ticketNo}. To take this forward we need a little more detail from you. ` +
    `Could you confirm the machine serial number and attach a photograph of the affected area? ` +
    `The clock on this request is paused until we hear from you.`,
  resolved: (c) =>
    `We have completed the work on ${c.ticketNo} regarding "${c.subject}". ` +
    `Please confirm on the portal that everything is in order, and do let us know how we did.`,
  under_quality_review: (c) =>
    `Thank you for reporting the issue on ${c.ticketNo}. The details have been passed to our Quality team, ` +
    `who are investigating. We will update this request as their review progresses.`,
};

export function cannedReplyTemplate(kind: keyof typeof TEMPLATES, ctx: ReplyContext): ReplyDraft {
  const template = TEMPLATES[kind];
  if (!template) throw new Error(`unknown canned template '${String(kind)}'`);
  return { body: template(ctx), source: "canned_template", sent: false, banner: DRAFT_BANNER };
}

export function availableTemplates(): string[] {
  return Object.keys(TEMPLATES);
}

/* ------------------------------- the gate ---------------------------------- */

/** Promises the company has not made. Every one of these is a commercial commitment that
 *  a model has no standing to give. */
const BANNED_COMMITMENT =
  /\b(we will (replace|refund|repair|credit|ship|deliver|dispatch|send a replacement)|free of charge|no charge|at no cost|under warranty we will|full refund|we guarantee|guaranteed by|will be resolved by \d|within \d+ (hours|days) we will)\b/i;

/** Verdicts that belong to Quality, not to a reply. */
const BANNED_LIABILITY =
  /\b(manufacturing defect|our (fault|error|mistake)|defective (batch|lot)|we accept (liability|responsibility)|not our (fault|problem)|your (fault|mishandling)|misuse by)\b/i;

/**
 * Internal vocabulary and internal people.
 *
 * Note `\d+` rather than `\d` on the document references: with a single digit the trailing
 * `\b` lands mid-number and "NCR-2627-0044" does not match at all — the reference would
 * sail through the leak check and be caught, if at all, by the far weaker ungrounded-number
 * rule. A guard that only catches single-digit NCR numbers is not a guard.
 */
const BANNED_INTERNAL =
  /\b(ncr[- ]?\d+|capa[- ]?\d+|internal note|internal only|escalat(ed|ion) to the (manager|management)|as per (the )?internal|our supplier said|margin\b|cost price|purchase price)\b/i;

/** A model that answers as though it were the customer, or invents a persona. */
const BANNED_PERSONA = /\b(as an ai|i am an ai|language model|i cannot|i'm sorry, but i)\b/i;

export interface DraftGateResult {
  ok: boolean;
  reason?: string;
}

/**
 * Accept a generated draft only if it commits to nothing, decides nothing, leaks nothing,
 * and quotes no figure that is not already on the ticket.
 *
 * A refused draft is not an outage: the agent still has the canned templates and their own
 * keyboard. Degraded mode for this feature is `feature_hidden`, and hiding a button is a
 * far better outcome than sending a customer a promise nobody authorised.
 */
export function checkReplyDraft(text: string, ctx: ReplyContext): DraftGateResult {
  const t = text.trim();
  if (t.length === 0) return { ok: false, reason: "empty" };
  if (t.length > 1500) return { ok: false, reason: "too_long" };

  if (BANNED_COMMITMENT.test(t)) return { ok: false, reason: "made_a_commitment" };
  if (BANNED_LIABILITY.test(t)) return { ok: false, reason: "decided_liability" };
  if (BANNED_INTERNAL.test(t)) return { ok: false, reason: "leaked_internal_context" };
  if (BANNED_PERSONA.test(t)) return { ok: false, reason: "broke_persona" };

  // Coverage is the entitlement engine's verdict, and a reply may only repeat a verdict
  // that has actually been computed for this ticket.
  if (/\b(covered under (warranty|amc)|is under warranty|warranty is valid)\b/i.test(t)) {
    if (ctx.entitlementResult !== "covered_warranty" && ctx.entitlementResult !== "covered_amc") {
      return { ok: false, reason: "claimed_coverage_without_an_entitlement_check" };
    }
  }

  const allowed = new Set<string>();
  for (const v of ctx.knownNumbers) {
    allowed.add(String(v));
    allowed.add(v.toFixed(2));
    allowed.add(new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v));
  }
  // The ticket number, the SLA promise the customer was already given, and any figure in
  // the subject or in the thread they can already read are all legitimately quotable.
  for (const src of [ctx.ticketNo, ctx.subject, ctx.slaPromise ?? "", ...ctx.publicThread.map((c) => c.body)]) {
    for (const m of src.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      allowed.add(m[0]);
      allowed.add(m[0].replace(/,/g, ""));
    }
  }

  for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0];
    const bare = raw.replace(/,/g, "");
    if (allowed.has(raw) || allowed.has(bare)) continue;
    const asNum = Number(bare);
    if (Number.isFinite(asNum) && (allowed.has(String(asNum)) || allowed.has(asNum.toFixed(2)))) continue;
    return { ok: false, reason: `ungrounded_number:${raw}` };
  }

  return { ok: true };
}

/**
 * Thread summarisation, deterministic. The baseline for the "Summarize thread" button:
 * who said what, how many times, and what the ticket is waiting on — assembled, not
 * generated, so the summary is available with AI switched off and is never wrong.
 */
export function summariseThread(ctx: ReplyContext): string {
  const fromCustomer = ctx.publicThread.filter((c) => c.author === "customer").length;
  const fromAgent = ctx.publicThread.filter((c) => c.author === "agent").length;
  const last = ctx.publicThread.at(-1);
  const parts: string[] = [
    `${ctx.ticketNo} — "${ctx.subject}" (${ctx.status}).`,
    `${fromCustomer} message${fromCustomer === 1 ? "" : "s"} from the customer, ${fromAgent} from the desk.`,
  ];
  if (ctx.entitlementResult) parts.push(`Entitlement check: ${ctx.entitlementResult.replace(/_/g, " ")}.`);
  if (last) {
    parts.push(
      `Last update was from the ${last.author}: "${last.body.slice(0, 140)}${last.body.length > 140 ? "…" : ""}"`,
    );
  }
  return parts.join(" ");
}
