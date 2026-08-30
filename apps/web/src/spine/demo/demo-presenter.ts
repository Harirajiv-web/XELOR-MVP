import type { DemoPhase, DemoScenario, DemoStep } from "./demo-scenarios";

export interface DemoFact {
  label: string;
  value: string;
}

export interface DemoPresenterSnapshot {
  area: string;
  headline: string;
  explanation: string;
  facts: readonly DemoFact[];
}

interface ScreenEvidence {
  area: string;
  evidence: string;
  source: string;
}

/**
 * A small, presenter-only evidence vocabulary for every screen used by Demo Mode.
 * These values never enter an API request or a business table. They connect each presenter
 * step to the evidence vocabulary of the current screen while the ERP underneath remains
 * the live, read-only source of truth.
 */
const screenEvidence: Record<string, ScreenEvidence> = {
  "/accounts/vouchers": { area: "Finance entry", evidence: "Draft posting and valuation effect", source: "approved posting rules" },
  "/administration/audit": { area: "Audit evidence", evidence: "Actor, time, action and result linked", source: "the immutable activity log" },
  "/administration/incidents": { area: "Security incident", evidence: "High-severity signal is contained to one identity", source: "identity and integration telemetry" },
  "/administration/roles": { area: "Authority check", evidence: "Effective permissions and approval limits resolved", source: "role and segregation rules" },
  "/agentos/approvals": { area: "Human approval", evidence: "Exact action, owner and evidence await a person", source: "the governed approval queue" },
  "/agentos/commander": { area: "Decision intelligence", evidence: "Customer commitment and rejected quality evidence are joined", source: "live sales and quality records" },
  "/agentos/command": { area: "Mission control", evidence: "Signals grouped into one bounded mission", source: "the agent mission ledger" },
  "/aiops/connectors": { area: "Document intake", evidence: "Source file, uploader and received time preserved", source: "controlled intake connectors" },
  "/aiops/registry": { area: "AI extraction", evidence: "Proposed fields carry field-level confidence", source: "the registered document model" },
  "/aiops/review": { area: "Human review", evidence: "Only uncertain fields are presented for correction", source: "the AI exception queue" },
  "/copilot/ask": { area: "Copilot", evidence: "Draft answer is grounded in the active case", source: "permission-filtered business evidence" },
  "/csp/tickets": { area: "Product after-sales", evidence: "Customer, manufactured product, warranty and response target connected", source: "the product-care case" },
  "/engineering/bom": { area: "Product structure", evidence: "Revision, component quantities and gaps checked", source: "the controlled bill of material" },
  "/engineering/items": { area: "Engineering definition", evidence: "Item revision and assumptions remain controlled", source: "the item master and change history" },
  "/integration/connections": { area: "Integration control", evidence: "Isolation and rollback options compared", source: "connection health and credential scope" },
  "/integration/flows": { area: "Process map", evidence: "Manual hand-offs and duplicate entry are visible", source: "the mapped operating flow" },
  "/inventory/stock": { area: "Stock evidence", evidence: "Usable, reserved, held and incoming stock separated", source: "the inventory ledger" },
  "/inventory/warehouses": { area: "Material location", evidence: "Warehouse, bin and authorized movement traced", source: "location and movement records" },
  "/maintenance/assets": { area: "Asset history", evidence: "Prior faults, maintenance and safety context assembled", source: "the asset and work-order history" },
  "/maintenance/downtime": { area: "Downtime event", evidence: "Stop time, duration and affected machine confirmed", source: "the machine event record" },
  "/managed-services/responsibilities": { area: "Service ownership", evidence: "Product care and ONYX managed-service work have different accountable owners", source: "the RELAY responsibility map" },
  "/planning/demand": { area: "Demand signal", evidence: "Change exceeds the agreed planning tolerance", source: "the demand plan and customer forecast" },
  "/planning/exceptions": { area: "Planning exception", evidence: "Late dates and dependency chain recalculated", source: "the deterministic planning engine" },
  "/planning/mrp": { area: "Material plan", evidence: "Shortages, lead times and capacity gaps calculated", source: "BOM, stock, supply and capacity rules" },
  "/production/orders": { area: "Production impact", evidence: "Affected work, sequence and readiness identified", source: "the production schedule" },
  "/purchase/grn": { area: "Goods receipt", evidence: "Received, accepted, rejected and moved quantities reconciled", source: "the receipt and inspection trail" },
  "/purchase/orders": { area: "Purchase requirement", evidence: "Supplier line, need date and downstream impact linked", source: "the purchase-order ledger" },
  "/purchase/vendors": { area: "Supplier option", evidence: "Approval, lead time, price and quality history compared", source: "the approved vendor master" },
  "/quality/audits": { area: "Audit scope", evidence: "Date, scope, owner and readiness boundary confirmed", source: "the audit programme" },
  "/quality/corrective-actions": { area: "Corrective work", evidence: "Containment and prevention have owners and dates", source: "the CAPA register" },
  "/quality/documents": { area: "Controlled evidence", evidence: "Revision, owner and review date verified", source: "the controlled document register" },
  "/quality/evidence-packs": { area: "Evidence pack", evidence: "Sources, timestamps and completeness assembled", source: "linked quality records" },
  "/quality/findings": { area: "Quality finding", evidence: "Nonconformance, scope and owner traced", source: "inspection and finding evidence" },
  "/quality/inspections": { area: "Inspection result", evidence: "Result, batch and disposition remain linked", source: "the inspection ledger" },
  "/quality/training": { area: "Competence check", evidence: "Required and completed training compared", source: "role and training records" },
  "/sales/customers": { area: "Customer match", evidence: "Identity, address, terms and credit context matched", source: "the customer master" },
  "/sales/orders": { area: "Customer order", evidence: "Quantity, requested date and promise risk connected", source: "the sales-order record" },
  "/working-capital/cash-forecast": { area: "Cash forecast", evidence: "Daily balance and policy buffer recalculated", source: "finance-grade cash rules" },
  "/working-capital/finance-pack": { area: "Management pack", evidence: "Decision, assumptions and source evidence summarized", source: "linked operational and finance records" },
  "/working-capital/margins": { area: "Margin impact", evidence: "Cost, price and downside shown together", source: "deterministic margin rules" },
  "/working-capital/money-in": { area: "Collection priority", evidence: "Due date, amount and payment risk ranked", source: "invoice and payment history" },
  "/working-capital/scenarios": { area: "Decision options", evidence: "Cost, cash, service and risk compared", source: "the scenario calculation workspace" },
  "/working-capital/stock-cash": { area: "Inventory cash", evidence: "Stock value, days held and demand exposure connected", source: "inventory and finance ledgers" },
};

const phaseResult: Record<DemoPhase, string> = {
  Discover: "The current work and its delays are now visible.",
  Capture: "The source has been recorded without becoming final business data.",
  Digitise: "AI has proposed structured fields with confidence shown.",
  Validate: "Uncertain or mismatched fields are waiting for a person.",
  Trigger: "A bounded mission has opened around this exact case.",
  Investigate: "The supporting evidence has been gathered without changing it.",
  Calculate: "Business rules have produced a repeatable result.",
  Coordinate: "Cross-department options and consequences are now together.",
  Govern: "Authority, policy and risk checks are attached to the proposal.",
  "Human decision": "The exact decision is visible to the accountable person.",
  Execute: "Only the approved operational step would be carried out.",
  Verify: "The expected result is checked against the live record.",
  Close: "The outcome and complete evidence trail are ready to report.",
};

export function buildPresenterSnapshot(
  scenario: DemoScenario,
  step: DemoStep,
  stepIndex: number,
  record: NonNullable<DemoScenario["demoRecord"]>,
): DemoPresenterSnapshot {
  const screen = screenEvidence[step.path] ?? {
    area: "ERP evidence",
    evidence: "The relevant business record is open",
    source: "the system of record",
  };
  const storyFact = record.facts[stepIndex % record.facts.length] ?? {
    label: "Case",
    value: record.subject,
  };
  const result = phaseResult[step.phase];

  return {
    area: screen.area,
    headline: screen.evidence,
    explanation: `${step.agents[0] ?? "ONYX"} is using ${screen.source} for ${record.reference}. ${result}`,
    facts: [
      { label: "Demo case", value: record.reference },
      { label: storyFact.label, value: storyFact.value },
      { label: "Evidence on this screen", value: screen.evidence },
      { label: "Step result", value: result },
    ],
  };
}
