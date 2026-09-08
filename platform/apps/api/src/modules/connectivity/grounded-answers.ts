import type { Evidence } from "./contracts.js";

/** Answers are derived exclusively from the selected connector's persisted snapshot. */
export function answerFromEvidence(question: string, snapshot: { id: string; observedAt: Date; evidence: Evidence }, now = new Date()) {
  const query = question.toLowerCase(); const day = now.toISOString().slice(0, 10);
  const freshness = now.getTime() - snapshot.observedAt.getTime() > 86_400_000 ? "stale" : "current";
  const citations: Array<{ snapshotId: string; entity: string; recordRef: string; observedAt: string }> = [];
  const cite = (entity: string, recordRef: string) => citations.push({ snapshotId: snapshot.id, entity, recordRef, observedAt: snapshot.observedAt.toISOString() });
  let answer: string;
  if (/\b(stock|inventory|available|availability|materials?)\b/.test(query)) {
    const matched = snapshot.evidence.inventory.filter((r) => query.includes(r.itemCode.toLowerCase()));
    const selected = (matched.length ? matched : snapshot.evidence.inventory).slice(0, 10);
    answer = selected.length ? selected.map((row) => {
      cite("inventory", row.itemCode);
      return `${row.itemCode}: ${row.availableQty === null ? "available quantity unknown" : `${row.availableQty} ${row.uom ?? "source units"} available`}.`;
    }).join(" ") : "This snapshot has no inventory records. Import reconciled available quantities before assessing stock.";
    if (!matched.length && snapshot.evidence.inventory.length > 10) answer += " Showing the first 10 items; include an item code to narrow the question.";
  } else if (/\b(suppliers?|vendors?)\b/.test(query)) {
    const selected = snapshot.evidence.suppliers.slice(0, 10);
    answer = selected.length ? selected.map((row) => {
      cite("suppliers", row.externalId);
      return `${row.name}: ${row.leadDays === null ? "lead time unknown" : `${row.leadDays} calendar days lead time`}.`;
    }).join(" ") : "This snapshot has no supplier records. Import suppliers to answer this question.";
    answer += " Supplier reliability is not established by a directory entry; use receipt and quality outcomes to evaluate performance.";
  } else if (/\b(orders?|deliver|delivery|overdue|late|risk|due)\b/.test(query)) {
    const lateOnly = /\b(overdue|late|risk)\b/.test(query);
    const selected = snapshot.evidence.orders.filter((r) => r.quantity > 0 && (!lateOnly || r.dueDate === null || r.dueDate < day)).slice(0, 10);
    answer = selected.length ? selected.map((row) => {
      cite("orders", row.externalId);
      return `${row.externalId}: ${row.quantity} of ${row.itemCode}; ${row.dueDate === null ? "promised date unknown" : `due ${row.dueDate}${row.dueDate < day ? " (past due)" : ""}`}.`;
    }).join(" ") : snapshot.evidence.orders.length ? "No positive-quantity orders match this date check. This does not verify manufacturing feasibility." : "This snapshot has no order records. Import open orders and promised dates to assess them.";
    answer += " This date check does not establish BOM availability or production capacity.";
  } else answer = "I can answer about this connection's inventory, supplier list, and order due dates. Ask for available stock by item code, overdue orders, or supplier lead times. Cost, capacity and recovery decisions need explicit assumptions in the decision workspace.";
  if (freshness === "stale") answer = `This snapshot is over 24 hours old; refresh before acting. ${answer}`;
  return { answer, citations, freshness, mode: "grounded_rules", observedAt: snapshot.observedAt.toISOString(),
    suggestedQuestions: ["Which orders are overdue?", "What inventory is available?", "Which suppliers and lead times are known?"] };
}
