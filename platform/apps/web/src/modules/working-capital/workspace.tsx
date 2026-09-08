import { AgentModulePage, type AgentModulePageProps } from "@spine/ui/agent-module-page";

export type WorkingCapitalView =
  | "overview"
  | "money-in"
  | "money-out"
  | "stock-cash"
  | "margins"
  | "cash-forecast"
  | "scenarios"
  | "finance-pack";

const owner: AgentModulePageProps["agent"] = {
  code: "RASP",
  name: "Finance Agent",
  purpose: "RASP cannot move money. It calculates first, explains the reason, and asks a person before any financial action.",
  accent: "var(--dept-rasp)",
  icon: "BadgeIndianRupee",
};

const commonEvidence = [
  { label: "Accounts", value: "Trial balance and posted vouchers" },
  { label: "Customers", value: "Invoices, receipts and due dates" },
  { label: "Suppliers", value: "Approved bills and payment dates" },
  { label: "Stock", value: "Quantity, age and recorded cost" },
  { label: "Tax", value: "GST returns and ledgers" },
  { label: "Safety", value: "No payment or posting without approval" },
] as const;

const pages: Record<WorkingCapitalView, Omit<AgentModulePageProps, "agent">> = {
  overview: {
    title: "Working Capital Overview",
    eyebrow: "Finance & working capital",
    description: "Know how much cash is available, where it is tied up and what deserves attention today.",
    updated: "today at 9:30 AM",
    metrics: [
      { label: "Cash available", value: "₹42.8 L", note: "Bank and cash balances after recorded commitments.", tone: "good", trend: "+₹3.2 L" },
      { label: "Cash tied up", value: "₹76.4 L", note: "Customer dues and stock currently holding cash.", tone: "watch" },
      { label: "13-week low point", value: "₹11.6 L", note: "Expected in week 8 if nothing changes.", tone: "risk" },
    ],
    actions: [
      { title: "Follow up Northstar invoice", detail: "₹12.4 L is 18 days late. A polite reminder is ready for review.", owner: "Anita · Finance", due: "Today", tone: "risk", status: "High impact" },
      { title: "Review slow-moving alloy stock", detail: "₹8.1 L has not moved in 92 days. RASP and SPAR found two open purchase orders for similar stock.", owner: "Finance + Stores", due: "2 Aug", tone: "watch", status: "Review" },
      { title: "Plan GST payment", detail: "₹6.7 L is expected on 20 Aug and is already included in the cash forecast.", owner: "Finance", due: "20 Aug", tone: "neutral", status: "Planned" },
    ],
    stages: [
      { label: "Money expected", value: "₹38.5 L", note: "Due from customers in the next 30 days.", tone: "good" },
      { label: "Money due", value: "₹27.2 L", note: "Approved supplier and tax payments.", tone: "watch" },
      { label: "Cash in stock", value: "₹29.8 L", note: "Recorded value of stock on hand.", tone: "neutral" },
      { label: "Action value", value: "₹20.5 L", note: "Cash that the current actions may protect or release.", tone: "ai" },
    ],
    insight: {
      title: "One collection changes the outlook",
      summary: "If Northstar pays this week, the lowest forecast cash balance improves from ₹11.6 L to ₹24.0 L.",
      evidence: ["Invoice INV-2627-0148 is recorded and overdue.", "The scenario changes timing only; it does not change the invoice.", "No reminder will be sent until a person approves it."],
      caution: "AI suggestion—not a promise of payment. The forecast uses recorded dates and clearly marks assumptions.",
    },
    evidence: commonEvidence,
  },
  "money-in": {
    title: "Money Coming In",
    eyebrow: "Working capital · customer payments",
    description: "Focus collection effort on the payments that matter most, without losing the customer context.",
    updated: "today at 9:28 AM",
    metrics: [
      { label: "Due in 30 days", value: "₹38.5 L", note: "12 customer invoices are expected.", tone: "good" },
      { label: "Already late", value: "₹18.7 L", note: "4 invoices have passed their due date.", tone: "risk" },
      { label: "Expected this week", value: "₹16.2 L", note: "Based on due dates and recorded payment history.", tone: "watch" },
    ],
    actions: [
      { title: "Northstar Process Systems", detail: "INV-2627-0148 · ₹12.4 L · 18 days late. Usually pays 9 days after due date.", owner: "Anita", due: "Call today", tone: "risk", status: "Priority 1" },
      { title: "Kaveri Pumps", detail: "INV-2627-0156 · ₹4.1 L · 7 days late. Customer disputed one delivery line.", owner: "Rahul", due: "Resolve by 1 Aug", tone: "watch", status: "Needs context" },
      { title: "Ardent Engineering", detail: "INV-2627-0161 · ₹2.2 L · due tomorrow. No past delay pattern.", owner: "Anita", due: "Check tomorrow", tone: "neutral", status: "Watch" },
    ],
    stages: [
      { label: "Not due", value: "₹19.8 L", note: "No action needed yet.", tone: "neutral" },
      { label: "Due soon", value: "₹9.6 L", note: "Due within seven days.", tone: "watch" },
      { label: "1–30 days late", value: "₹16.5 L", note: "Needs planned follow-up.", tone: "risk" },
      { label: "Over 30 days", value: "₹2.2 L", note: "Needs manager review.", tone: "risk" },
    ],
    insight: {
      title: "Best next call: Northstar",
      summary: "It is the largest overdue balance and has no open quality or delivery complaint in the recorded customer history.",
      evidence: ["Invoice and due date come from Accounts.", "Customer and order context come from MICA.", "The draft reminder refers only to recorded facts."],
      caution: "RASP can draft a call note or email. A person must review and send it.",
    },
    evidence: commonEvidence,
  },
  "money-out": {
    title: "Money Going Out",
    eyebrow: "Working capital · supplier payments",
    description: "See what must be paid, what can safely wait and where an early-payment benefit is real.",
    updated: "today at 9:25 AM",
    metrics: [
      { label: "Due in 30 days", value: "₹27.2 L", note: "Approved supplier, payroll and tax commitments.", tone: "watch" },
      { label: "Due this week", value: "₹8.9 L", note: "Five payments need review.", tone: "risk" },
      { label: "Discount available", value: "₹0.62 L", note: "Only if two approved bills are paid early.", tone: "good" },
    ],
    actions: [
      { title: "Protect critical steel supply", detail: "₹5.6 L to Bharat Alloy is due Friday. SPAR marks this supplier as production-critical.", owner: "Finance", due: "2 Aug", tone: "risk", status: "Do not delay" },
      { title: "Check early-payment discount", detail: "Paying MechPro ₹3.1 L by 5 Aug saves ₹0.31 L without crossing the cash floor.", owner: "Finance", due: "5 Aug", tone: "good", status: "Opportunity" },
      { title: "Hold unmatched bill", detail: "₹1.8 L bill has no matching goods receipt. It is excluded from the payment proposal.", owner: "Purchase", due: "Needs match", tone: "watch", status: "Blocked" },
    ],
    stages: [
      { label: "Approved", value: "₹21.3 L", note: "Ready for normal payment review.", tone: "neutral" },
      { label: "Due soon", value: "₹8.9 L", note: "Due within seven days.", tone: "watch" },
      { label: "Blocked", value: "₹1.8 L", note: "Missing match or approval.", tone: "risk" },
      { label: "Potential saving", value: "₹0.62 L", note: "Available early-payment discount.", tone: "good" },
    ],
    insight: {
      title: "Pay by business impact, not age alone",
      summary: "Bharat Alloy should remain first because delaying it may stop a production order worth more than the cash saved.",
      evidence: ["Bill status comes from the approved payable record.", "Supplier criticality comes from SPAR.", "The forecast keeps the minimum cash buffer intact."],
      caution: "RASP only recommends timing. Bank release and payment approval stay with authorised people.",
    },
    evidence: commonEvidence,
  },
  "stock-cash": {
    title: "Stock Holding Cash",
    eyebrow: "Working capital · inventory",
    description: "Find stock that holds too much cash and review it with Stores before buying more.",
    updated: "today at 9:22 AM",
    metrics: [
      { label: "Stock value", value: "₹29.8 L", note: "Recorded cost of stock currently on hand.", tone: "neutral" },
      { label: "Slow-moving", value: "₹8.1 L", note: "No movement for more than 90 days.", tone: "risk" },
      { label: "Open orders at risk", value: "₹5.4 L", note: "Purchase orders for items already above cover.", tone: "watch" },
    ],
    actions: [
      { title: "Nickel alloy plate", detail: "₹4.6 L on hand, 118 days without use, and another ₹2.1 L on order.", owner: "Stores + Purchase", due: "Today", tone: "risk", status: "Stop and review" },
      { title: "PX-400 seal kit", detail: "₹2.3 L on hand. Demand exists, but the next requirement is 11 weeks away.", owner: "Planning", due: "5 Aug", tone: "watch", status: "Reschedule" },
      { title: "Standard fasteners", detail: "₹1.2 L above normal cover across three warehouses.", owner: "Stores", due: "9 Aug", tone: "neutral", status: "Consolidate" },
    ],
    stages: [
      { label: "Moving normally", value: "₹18.9 L", note: "Used within the expected period.", tone: "good" },
      { label: "Watch", value: "₹2.8 L", note: "Movement is slowing.", tone: "watch" },
      { label: "Slow-moving", value: "₹8.1 L", note: "No movement for over 90 days.", tone: "risk" },
      { label: "Possible release", value: "₹5.4 L", note: "Value of orders to review or reschedule.", tone: "ai" },
    ],
    insight: {
      title: "Review open orders before disposing stock",
      summary: "The fastest safe cash release is to pause duplicate incoming material, not to sell stock that a future order may need.",
      evidence: ["On-hand quantity and age come from Inventory.", "Open purchase orders come from SPAR.", "Future need comes from AXLE planning."],
      caution: "No purchase order is cancelled automatically. The buyer and planner see the evidence first.",
    },
    evidence: commonEvidence,
  },
  margins: {
    title: "Margins",
    eyebrow: "Working capital · profitability",
    description: "Understand which work creates value and why a margin changed, without reading a technical cost report.",
    updated: "today at 9:18 AM",
    metrics: [
      { label: "Average margin", value: "18.6%", note: "Across dispatched orders in the current month.", tone: "good", trend: "+1.4 pts" },
      { label: "Margin at risk", value: "₹4.2 L", note: "Value exposed by cost or rework changes.", tone: "risk" },
      { label: "Orders below target", value: "3", note: "Out of 17 dispatched or active orders.", tone: "watch" },
    ],
    actions: [
      { title: "PX-400 · Northstar", detail: "Margin fell from 21% to 13% after overtime and rework. Material cost stayed within plan.", owner: "Production + Finance", due: "Review today", tone: "risk", status: "8 pts down" },
      { title: "Valve skid · Kaveri", detail: "Freight is ₹0.48 L above quotation because dispatch was split.", owner: "Sales", due: "2 Aug", tone: "watch", status: "Explain" },
      { title: "Pump base · Ardent", detail: "Material yield improved and margin is 3 points above target.", owner: "Production", due: "Share learning", tone: "good", status: "Positive" },
    ],
    stages: [
      { label: "Material", value: "52%", note: "Share of recorded job cost.", tone: "neutral" },
      { label: "Labour", value: "18%", note: "Regular and overtime effort.", tone: "neutral" },
      { label: "Outside work", value: "12%", note: "Subcontracting and special process.", tone: "watch" },
      { label: "Gross margin", value: "18%", note: "Sales less recorded direct cost.", tone: "good" },
    ],
    insight: {
      title: "PX-400 issue is execution, not purchase price",
      summary: "The margin drop is mainly linked to rework hours and split-shift overtime after the failed inspection.",
      evidence: ["Price and order value come from MICA.", "Material and labour postings come from Accounts.", "The rejected inspection comes from KILN."],
      caution: "This is an explanation of recorded costs, not a replacement for the finance team’s final margin sign-off.",
    },
    evidence: commonEvidence,
  },
  "cash-forecast": {
    title: "13-Week Cash Forecast",
    eyebrow: "Working capital · forecast",
    description: "See the likely cash path week by week and understand every assumption behind it.",
    updated: "today at 9:15 AM",
    metrics: [
      { label: "Opening cash", value: "₹42.8 L", note: "Recorded bank and cash position.", tone: "good" },
      { label: "Lowest point", value: "₹11.6 L", note: "Expected in week 8 under the base case.", tone: "risk" },
      { label: "Closing cash", value: "₹31.4 L", note: "Expected at the end of week 13.", tone: "watch" },
    ],
    actions: [
      { title: "Week 8 cash buffer", detail: "GST, payroll and the alloy supplier fall in the same week. Confirm Northstar timing before then.", owner: "Finance", due: "Before week 6", tone: "risk", status: "Main risk" },
      { title: "Unconfirmed sales order", detail: "₹9.8 L expected receipt is excluded until the customer order is confirmed.", owner: "Sales", due: "6 Aug", tone: "neutral", status: "Not counted" },
      { title: "Purchase reschedule option", detail: "Moving one non-critical receipt by two weeks protects ₹3.7 L of buffer.", owner: "Purchase", due: "Review", tone: "watch", status: "Option" },
    ],
    stages: [
      { label: "Weeks 1–3", value: "₹36.2 L", note: "Healthy buffer after regular commitments.", tone: "good" },
      { label: "Weeks 4–6", value: "₹24.8 L", note: "Customer timing becomes important.", tone: "watch" },
      { label: "Weeks 7–9", value: "₹11.6 L", note: "Lowest point in the base case.", tone: "risk" },
      { label: "Weeks 10–13", value: "₹31.4 L", note: "Recovery after planned receipts.", tone: "good" },
    ],
    insight: {
      title: "Week 8 is the control point",
      summary: "The business remains cash-positive in the base case, but two delayed customer receipts would reduce the buffer below the chosen ₹10 L floor.",
      evidence: ["Opening cash is recorded, not estimated.", "Dates use approved bills and customer due dates.", "Unconfirmed work is excluded from the base case."],
      caution: "Where payment history is too short, the forecast uses the due date and labels it as an assumption.",
    },
    evidence: commonEvidence,
  },
  scenarios: {
    title: "Cash Scenarios",
    eyebrow: "Working capital · what-if planning",
    description: "Compare choices safely. A scenario never changes a real invoice, order, payment or stock record.",
    updated: "today at 9:12 AM",
    metrics: [
      { label: "Base case low", value: "₹11.6 L", note: "Current expected lowest cash balance.", tone: "watch" },
      { label: "Best safe option", value: "₹24.0 L", note: "If Northstar pays this week.", tone: "good" },
      { label: "Stress case low", value: "₹3.8 L", note: "If the two largest receipts slip 30 days.", tone: "risk" },
    ],
    actions: [
      { title: "Base case", detail: "Uses recorded due dates and approved commitments. No timing changes.", owner: "RASP", due: "Current", tone: "neutral", status: "Baseline" },
      { title: "Collection focus", detail: "Northstar pays this week; lowest balance improves by ₹12.4 L.", owner: "Finance", due: "Compare", tone: "good", status: "Recommended" },
      { title: "Receipt delay stress", detail: "Two major customer receipts move by 30 days; the buffer falls below policy.", owner: "Finance", due: "Prepare response", tone: "risk", status: "Stress test" },
    ],
    stages: [
      { label: "Choose assumption", value: "1", note: "Change one clear timing or amount.", tone: "neutral" },
      { label: "Recalculate", value: "13 wk", note: "Deterministic weekly cash maths.", tone: "ai" },
      { label: "Compare", value: "3 cases", note: "Base, option and stress view.", tone: "watch" },
      { label: "Approve action", value: "Human", note: "Only people change real work.", tone: "good" },
    ],
    insight: {
      title: "Collection is safer than payment delay",
      summary: "Following up one overdue customer protects more cash than delaying a production-critical supplier.",
      evidence: ["Both choices use the same base forecast.", "Supplier criticality is included in the comparison.", "No scenario writes back to source records."],
      caution: "A scenario supports a decision; it does not execute one.",
    },
    evidence: commonEvidence,
  },
  "finance-pack": {
    title: "Finance Readiness Pack",
    eyebrow: "Working capital · lender readiness",
    description: "Bring the main financial records into one checked list before sharing them with a bank or lender.",
    updated: "today at 9:08 AM",
    metrics: [
      { label: "Pack ready", value: "82%", note: "18 of 22 required items are current.", tone: "watch" },
      { label: "Records checked", value: "18", note: "Matched to the source and review date.", tone: "good" },
      { label: "Items missing", value: "4", note: "Nothing can be exported until reviewed.", tone: "risk" },
    ],
    actions: [
      { title: "Upload July bank statement", detail: "The current pack contains statements only through June.", owner: "Finance", due: "Today", tone: "risk", status: "Missing" },
      { title: "Review debtor ageing", detail: "Northstar overdue amount needs an owner note before the pack is shared.", owner: "Anita", due: "2 Aug", tone: "watch", status: "Needs note" },
      { title: "Confirm GST filing receipt", detail: "Return values match the ledger; acknowledgement is not attached.", owner: "Tax", due: "3 Aug", tone: "watch", status: "Attach proof" },
    ],
    stages: [
      { label: "Accounts", value: "Ready", note: "Trial balance and statements checked.", tone: "good" },
      { label: "GST", value: "1 missing", note: "Filing receipt needs attachment.", tone: "watch" },
      { label: "Bank", value: "1 missing", note: "Latest statement is not present.", tone: "risk" },
      { label: "Receivables", value: "2 notes", note: "Owner explanation is required.", tone: "watch" },
    ],
    insight: {
      title: "Four clear gaps, no hidden completeness claim",
      summary: "RASP found the missing records and matched the available figures. HEXA will verify the final export after a person reviews every gap.",
      evidence: ["Every pack item keeps its source record and review date.", "Changed files create a new pack version.", "Exports are logged and need human approval."],
      caution: "AI helps assemble and explain the pack. It cannot certify lender acceptance or declare the records compliant.",
    },
    evidence: commonEvidence,
  },
};

export function WorkingCapitalWorkspace({ view }: { view: WorkingCapitalView }): React.JSX.Element {
  return <AgentModulePage {...pages[view]} agent={owner} />;
}
