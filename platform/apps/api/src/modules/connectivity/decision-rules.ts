import type { z } from "zod";
import type { commitmentRequest, recoveryRequest, outcomeRequest, Evidence } from "./contracts.js";

type Snapshot = { id: string; observedAt: Date; evidence: Evidence; warnings: string[] };
const dayMs = 86_400_000;
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function day(now: Date, days: number) { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * dayMs).toISOString().slice(0, 10); }
function provenance(snapshot: Snapshot, now: Date) {
  return { snapshotId: snapshot.id, observedAt: snapshot.observedAt.toISOString(), freshness: now.getTime() - snapshot.observedAt.getTime() > dayMs ? "stale" as const : "current" as const };
}
function availability(evidence: Evidence, itemCode: string) {
  return evidence.inventory.find((i) => i.itemCode === itemCode)?.availableQty ?? null;
}

/** Screening of one item, with all business assumptions captured alongside source evidence. */
export function assessCommitment(input: z.infer<typeof commitmentRequest>, snapshot: Snapshot, now = new Date()) {
  const evidence = provenance(snapshot, now); const warnings = [...snapshot.warnings];
  const availableQty = availability(snapshot.evidence, input.itemCode);
  const shortageQty = availableQty === null ? null : Math.max(0, input.quantity - availableQty);
  if (evidence.freshness === "stale") warnings.push("Snapshot is over 24 hours old; refresh before committing.");
  if (availableQty === null) warnings.push("Available stock is unknown for this item.");
  if (input.capacityConfirmed !== true) warnings.push("Production capacity has not been confirmed.");
  if (input.productionDays === undefined) warnings.push("Production and subcontracting duration is unknown.");
  if (shortageQty !== 0 && input.procurementLeadDays === undefined) warnings.push("Procurement lead time is unknown.");
  if (input.materialUnitCost === undefined || input.conversionCost === undefined) warnings.push("Material or conversion cost is missing; margin cannot be established.");
  const leadDays = shortageQty === 0 ? 0 : input.procurementLeadDays;
  const earliestDeliveryDate = leadDays === undefined || input.productionDays === undefined || shortageQty === null
    ? null : day(now, leadDays + input.productionDays);
  const projectedCost = input.materialUnitCost === undefined || input.conversionCost === undefined
    ? null : money(input.materialUnitCost * input.quantity + input.conversionCost);
  const revenue = input.sellingPrice * input.quantity;
  const projectedMarginPct = projectedCost === null ? null : money((revenue - projectedCost) / revenue * 100);
  const late = earliestDeliveryDate !== null && earliestDeliveryDate > input.dueDate;
  const marginRisk = projectedMarginPct !== null && projectedMarginPct < input.targetMarginPct;
  if (late) warnings.push("Earliest estimated delivery falls after the requested date.");
  if (marginRisk) warnings.push("Estimated margin is below the target.");
  const unknown = evidence.freshness === "stale" || availableQty === null || input.capacityConfirmed !== true || earliestDeliveryDate === null || projectedCost === null;
  const status = late || marginRisk ? "at_risk" as const : unknown ? "needs_evidence" as const : "feasible" as const;
  return { status, summary: status === "feasible" ? "The supplied assumptions support this commitment. Confirm the full BOM and reserve capacity before accepting."
    : status === "at_risk" ? "The estimated date or margin misses the target. Review recovery options before accepting." : "More evidence is needed before promising a date and margin.",
    orderRef: input.orderRef, itemCode: input.itemCode, currency: input.currency, availableQty, shortageQty,
    earliestDeliveryDate, projectedCost, projectedMarginPct, warnings, evidence,
    assumptions: { productionDays: input.productionDays ?? null, capacityConfirmed: input.capacityConfirmed ?? false,
      materialUnitCost: input.materialUnitCost ?? null, conversionCost: input.conversionCost ?? null,
      procurementLeadDays: input.procurementLeadDays ?? null, targetMarginPct: input.targetMarginPct,
      scope: "Single-item screening; quantities use the source unit. Prices are per unit, conversion cost is total, and dates use calendar days. Full BOM, multi-resource scheduling, tax and freight require separate confirmation." } };
}

export function compareRecovery(input: z.infer<typeof recoveryRequest>, snapshot: Snapshot, now = new Date()) {
  const evidence = provenance(snapshot, now); const warnings = [...snapshot.warnings];
  const stock = availability(snapshot.evidence, input.itemCode);
  const shortageQty = stock === null ? null : Math.max(0, input.quantity - stock);
  if (shortageQty === null) warnings.push("Stock is unknown; required purchase quantity must be confirmed.");
  if (evidence.freshness === "stale") warnings.push("Snapshot is stale; options cannot be recommended until refreshed.");
  if (shortageQty === 0) warnings.push("Current stock covers the requested quantity; no purchase recommendation is needed.");
  const options = input.options.map((option) => {
    const optionWarnings: string[] = [];
    const currencyMatches = option.currency === input.currency;
    const totalCost = !currencyMatches || option.unitCost === null || option.freightCost === null ? null : money(option.quantity * option.unitCost + option.freightCost);
    const arrivalDate = option.leadDays === null ? null : day(now, option.leadDays);
    const daysLate = arrivalDate === null ? null : Math.max(0, Math.round((new Date(arrivalDate).getTime() - new Date(input.needDate).getTime()) / dayMs));
    const coversShortage = shortageQty === null ? null : option.quantity >= shortageQty;
    if (!currencyMatches) optionWarnings.push("Different currency; provide a documented conversion before comparison.");
    if (totalCost === null) optionWarnings.push("Landed cost is unknown.");
    if (arrivalDate === null) optionWarnings.push("Delivery lead time is unknown.");
    if (coversShortage === false) optionWarnings.push("Quantity does not cover the shortage; this can only be part of a split purchase.");
    return { name: option.name, quantity: option.quantity, totalCost, arrivalDate, daysLate, coversShortage,
      eligible: coversShortage === true && shortageQty !== 0 && totalCost !== null && arrivalDate !== null && evidence.freshness === "current", warnings: optionWarnings };
  });
  const ranked = options.filter((o) => o.eligible).sort((a, b) => a.daysLate! - b.daysLate! || a.totalCost! - b.totalCost!);
  return { itemCode: input.itemCode, shortageQty, options, recommendedOption: ranked[0]?.name ?? null, warnings, evidence,
    rule: "Complete options are ranked by fewer days late, then lower total cost. Quotes and lead times are user-supplied assumptions; no order is placed." };
}

type Measurement = z.infer<typeof outcomeRequest> & { id: string };
export function compareOutcomes(entries: Measurement[]) {
  const comparisons: Array<{ metric: string; scope: string; baseline: number; actual: number; change: number; improvementPct: number | null }> = [];
  const groups = new Set(entries.map((e) => `${e.metric}|${e.scope}`));
  for (const group of groups) {
    const groupEntries = entries.filter((e) => `${e.metric}|${e.scope}` === group);
    const actual = groupEntries.find((e) => e.kind === "actual");
    const baseline = actual && groupEntries.find((e) => e.kind === "baseline" && e.periodEnd < actual.periodStart
      && (new Date(e.periodEnd).getTime() - new Date(e.periodStart).getTime()) === (new Date(actual.periodEnd).getTime() - new Date(actual.periodStart).getTime()));
    if (!actual || !baseline) continue;
    const change = money(actual.value - baseline.value);
    comparisons.push({ metric: actual.metric, scope: actual.scope, baseline: baseline.value, actual: actual.value, change,
      improvementPct: baseline.value === 0 ? null : money((actual.metric === "on_time_delivery_pct" ? change : -change) / baseline.value * 100) });
  }
  return comparisons;
}
