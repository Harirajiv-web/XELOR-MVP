/**
 * DUPLICATE-RECEIPT AND SPLIT-CLAIM DETECTION — AI #4
 * `expenditure.duplicate_receipt` (EXPENDITURE §13.2, V-DUP-01).
 *
 * Registered **stretch**, Tier-1 (advisory), baseline `attachment_sha256_exact`, degraded
 * mode `deterministic_substitute`.
 *
 * Read the tiers before the code, because the difference between them is the difference
 * between a control and an accusation:
 *
 *   **Tier 1 — exact.** The same image file, byte for byte, on two claims. A SHA-256 match
 *   is a fact, it costs nothing, and it ships on day one whether or not any model does.
 *
 *   **Tier 2 — near.** The same bill photographed twice, cropped, or re-shot at a
 *   different angle. Same merchant, same date, same amount, different bytes. Deterministic
 *   fuzzy matching on those three fields catches most of it without a model at all.
 *
 *   **Tier 3 — pattern.** Several claims just under a policy threshold, same merchant,
 *   same day. This is the one that looks like fraud and very often is not: a team dinner
 *   split across four people produces exactly this shape.
 *
 * So **nothing here ever rejects anything.** Every finding is a flag on the approver's
 * screen with both documents named and the reason spelled out, and a human decides. The
 * blueprint is explicit and this file honours it literally: *flagged to the approver, never
 * auto-rejected.* Accusing an employee of duplicate claiming on a similarity score is a
 * decision no confidence number justifies.
 */

export type DuplicateKind = "exact_image" | "near_duplicate" | "same_invoice_no" | "split_pattern";
export type DuplicateSeverity = "certain" | "probable" | "possible";

export interface ReceiptFingerprint {
  attachmentId: string;
  docRef: string;
  claimantRef: string;
  sha256: string;
  merchant: string;
  invoiceNo?: string | null;
  invoiceDate: string;
  amount: number;
  headCode?: string | null;
}

export interface DuplicateFinding {
  kind: DuplicateKind;
  severity: DuplicateSeverity;
  /** BOTH documents, always. A flag naming only the new one is not reviewable. */
  documents: string[];
  attachments: string[];
  /** Same person, or two people? A cross-claimant match is a different conversation. */
  crossClaimant: boolean;
  score: number;
  reason: string;
  /** Deliberately fixed. There is no auto-reject path in this module. */
  action: "flag_for_approver";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number): string => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

/** Normalise a merchant name enough to survive OCR and shop-front spelling. */
export function normaliseMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|the|hotel|restaurant|and|&)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Token overlap, 0..1 — cheap, explainable, and good enough that a model has to beat it. */
export function merchantSimilarity(a: string, b: string): number {
  const ta = new Set(normaliseMerchant(a).split(" ").filter(Boolean));
  const tb = new Set(normaliseMerchant(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return Math.round((shared / Math.max(ta.size, tb.size)) * 100) / 100;
}

const daysBetween = (a: string, b: string): number =>
  Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000));

/**
 * The registered deterministic baseline: an exact file match.
 *
 * It is worth noticing how strong this is. Someone claiming the same receipt twice usually
 * uploads the same file twice, because they photographed it once. This catches that for
 * the cost of a hash, and it is the bar the fuzzy detector must beat on recall without
 * losing precision.
 */
export function exactDuplicates(
  candidate: ReceiptFingerprint,
  existing: readonly ReceiptFingerprint[],
): DuplicateFinding[] {
  return existing
    .filter((e) => e.attachmentId !== candidate.attachmentId && e.sha256 === candidate.sha256)
    .map((e) => ({
      kind: "exact_image" as const,
      severity: "certain" as const,
      documents: [candidate.docRef, e.docRef],
      attachments: [candidate.attachmentId, e.attachmentId],
      crossClaimant: e.claimantRef !== candidate.claimantRef,
      score: 1,
      reason:
        e.claimantRef !== candidate.claimantRef
          ? `The identical image file is already attached to ${e.docRef}, claimed by a different person.`
          : `The identical image file is already attached to ${e.docRef}.`,
      action: "flag_for_approver" as const,
    }));
}

/**
 * The candidate detector: exact, plus invoice-number reuse, plus fuzzy triples.
 *
 * The weighting is deliberate. A repeated **invoice number** from the same supplier is
 * near-certain — invoice numbers are unique by law, so the same one twice is either a
 * duplicate claim or a supplier with a serious problem. A merchant/date/amount match is
 * only *probable*, because two identical taxi fares on the same route on the same day are
 * an ordinary Tuesday.
 */
export function detectReceiptDuplicates(
  candidate: ReceiptFingerprint,
  existing: readonly ReceiptFingerprint[],
  opts: { dateToleranceDays?: number; amountTolerancePct?: number; merchantFloor?: number } = {},
): DuplicateFinding[] {
  const dateTol = opts.dateToleranceDays ?? 1;
  const amtTol = opts.amountTolerancePct ?? 1;
  const merchantFloor = opts.merchantFloor ?? 0.6;

  const findings: DuplicateFinding[] = [...exactDuplicates(candidate, existing)];
  const alreadyFlagged = new Set(findings.flatMap((f) => f.attachments));

  for (const e of existing) {
    if (e.attachmentId === candidate.attachmentId) continue;
    if (alreadyFlagged.has(e.attachmentId)) continue;

    // Invoice-number reuse from the same supplier.
    if (
      candidate.invoiceNo &&
      e.invoiceNo &&
      candidate.invoiceNo.trim().toUpperCase() === e.invoiceNo.trim().toUpperCase() &&
      merchantSimilarity(candidate.merchant, e.merchant) >= merchantFloor
    ) {
      findings.push({
        kind: "same_invoice_no",
        severity: "certain",
        documents: [candidate.docRef, e.docRef],
        attachments: [candidate.attachmentId, e.attachmentId],
        crossClaimant: e.claimantRef !== candidate.claimantRef,
        score: 0.98,
        reason: `Invoice ${candidate.invoiceNo} from ${e.merchant} is already claimed on ${e.docRef}. An invoice number is unique by law.`,
        action: "flag_for_approver",
      });
      continue;
    }

    // The fuzzy triple.
    const mSim = merchantSimilarity(candidate.merchant, e.merchant);
    if (mSim < merchantFloor) continue;
    const dayGap = daysBetween(candidate.invoiceDate, e.invoiceDate);
    if (dayGap > dateTol) continue;
    const amountGapPct =
      e.amount === 0 ? 100 : Math.abs(candidate.amount - e.amount) / Math.max(e.amount, 1) * 100;
    if (amountGapPct > amtTol) continue;

    const score = round2(Math.min(0.95, 0.55 + mSim * 0.3 + (dayGap === 0 ? 0.1 : 0)));
    findings.push({
      kind: "near_duplicate",
      severity: score >= 0.85 ? "probable" : "possible",
      documents: [candidate.docRef, e.docRef],
      attachments: [candidate.attachmentId, e.attachmentId],
      crossClaimant: e.claimantRef !== candidate.claimantRef,
      score,
      reason:
        `Same merchant (${Math.round(mSim * 100)}% name match), ${dayGap === 0 ? "same date" : `${dayGap} day apart`}, ` +
        `₹${fmt(candidate.amount)} against ₹${fmt(e.amount)} on ${e.docRef}. Different image file, so this is a judgement call.`,
      action: "flag_for_approver",
    });
  }

  return findings.sort((a, b) => b.score - a.score);
}

/**
 * Split-claim detection: several receipts just under a threshold, same merchant, same day.
 *
 * This is the finding most likely to be WRONG about a person, so its wording is careful and
 * its severity is capped at `possible`. Four ₹480 meal receipts from one restaurant on one
 * evening, against a ₹500 receipt threshold, is the classic avoidance pattern — and it is
 * also exactly what a team dinner split four ways looks like. The flag says both.
 */
export function detectSplitPattern(
  receipts: readonly ReceiptFingerprint[],
  opts: { threshold: number; minCount?: number; withinPctOfThreshold?: number },
): DuplicateFinding[] {
  const minCount = opts.minCount ?? 3;
  const band = opts.withinPctOfThreshold ?? 20;
  const floor = opts.threshold * (1 - band / 100);

  const groups = new Map<string, ReceiptFingerprint[]>();
  for (const r of receipts) {
    if (r.amount > opts.threshold || r.amount < floor) continue;
    const key = `${normaliseMerchant(r.merchant)}|${r.invoiceDate}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const out: DuplicateFinding[] = [];
  for (const [key, group] of groups) {
    if (group.length < minCount) continue;
    const total = round2(group.reduce((a, r) => a + r.amount, 0));
    const claimants = new Set(group.map((r) => r.claimantRef));
    out.push({
      kind: "split_pattern",
      severity: "possible",
      documents: [...new Set(group.map((r) => r.docRef))],
      attachments: group.map((r) => r.attachmentId),
      crossClaimant: claimants.size > 1,
      score: round2(Math.min(0.8, 0.4 + group.length * 0.1)),
      reason:
        `${group.length} receipts from ${group[0]!.merchant} on ${group[0]!.invoiceDate}, each between ₹${fmt(floor)} and ` +
        `₹${fmt(opts.threshold)} and together ₹${fmt(total)}, against a ₹${fmt(opts.threshold)} receipt threshold. ` +
        `This is the shape of splitting to stay under a limit — and also the shape of ${claimants.size} people ` +
        `splitting one bill. Worth asking; not worth assuming.`,
      action: "flag_for_approver",
    });
    void key;
  }
  return out;
}

/** Whether any finding is strong enough to hold the document for a second look. Even
 *  `certain` only holds it — the approver still decides. */
export function shouldHoldForReview(findings: readonly DuplicateFinding[]): boolean {
  return findings.some((f) => f.severity === "certain" || f.score >= 0.85);
}
