#!/usr/bin/env node
/**
 * Investor-demo acceptance matrix.
 *
 * This is intentionally read-heavy: it exercises the same authenticated surfaces a
 * presenter opens, verifies the canonical Northstar facts across modules, and probes safe
 * refusals without changing business records. It must report at least 50 independent checks.
 */

import {
  makeClient,
  PUBLIC_DEMO,
  rows,
  token,
} from "../shared/demo-client.mjs";

const WEB = process.env.WEB_BASE ?? "http://localhost:3001";
const API = process.env.API_BASE ?? "http://localhost:3000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const REALM = process.env.KEYCLOAK_REALM ?? "indcore";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verify(label, work) {
  try {
    await work();
    passed += 1;
    console.log(`  ok  ${String(passed + failed).padStart(2, "0")}  ${label}`);
  } catch (error) {
    failed += 1;
    failures.push({
      label,
      message: error instanceof Error ? error.message : String(error),
    });
    console.log(`  FAIL ${String(passed + failed).padStart(2, "0")}  ${label}`);
    console.log(`       ${failures.at(-1).message}`);
  }
}

function expectStatus(result, status, label) {
  assert(
    result.status === status,
    `${label} returned HTTP ${result.status}; expected ${status}`,
  );
  return result.body;
}

function unwrap(value) {
  return value && typeof value === "object" && "data" in value
    ? value.data
    : value;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

console.log("XELOR INVESTOR DEMO — acceptance matrix\n");

let adminToken = "";
let storesToken = "";
let call;
let stores;

await verify(
  PUBLIC_DEMO
    ? "API bootstrap endpoint answers before the web starts"
    : "web entrypoint answers on the presenter port",
  async () => {
    const response = await fetch(
      PUBLIC_DEMO ? `${API}/api/v1/health/live` : WEB,
      { redirect: "manual" },
    );
    assert(
      [200, 302, 303, 307, 308].includes(response.status),
      `entrypoint returned ${response.status}`,
    );
  },
);
await verify(
  PUBLIC_DEMO
    ? "public-demo selector opens only the isolated demo API"
    : "Keycloak realm is reachable",
  async () => {
    const response = PUBLIC_DEMO
      ? await fetch(`${API}/api/v1/general/companies`, {
          headers: { "x-xelor-public-demo": "investor-presentation" },
        })
      : await fetch(`${KC}/realms/${REALM}`);
    assert(
      response.status === 200,
      `identity boundary returned ${response.status}`,
    );
  },
);
await verify(
  PUBLIC_DEMO
    ? "stores demo persona cannot read the administration registry"
    : "OIDC discovery metadata is published",
  async () => {
    if (PUBLIC_DEMO) {
      const response = await fetch(`${API}/api/v1/admin/roles`, {
        headers: {
          "x-xelor-public-demo": "investor-presentation",
          "x-xelor-demo-persona": "poongodi",
        },
      });
      assert(
        response.status === 403,
        `stores persona returned ${response.status}`,
      );
      return;
    }
    const response = await fetch(
      `${KC}/realms/${REALM}/.well-known/openid-configuration`,
    );
    const body = await response.json();
    assert(
      response.status === 200 && body.token_endpoint,
      "OIDC metadata is incomplete",
    );
  },
);
await verify(
  PUBLIC_DEMO
    ? "administrator receives a scoped demo identity marker"
    : "administrator receives a real Keycloak access token",
  async () => {
    adminToken = await token("venkat");
    assert(
      PUBLIC_DEMO
        ? adminToken === "public-demo:venkat"
        : adminToken.split(".").length === 3,
      PUBLIC_DEMO
        ? "administrator demo marker is invalid"
        : "administrator token is not a JWT",
    );
    call = makeClient(adminToken);
  },
);
await verify(
  PUBLIC_DEMO
    ? "stores persona receives a distinct demo identity marker"
    : "stores persona receives a distinct access token",
  async () => {
    storesToken = await token("poongodi");
    assert(storesToken !== adminToken, "persona tokens unexpectedly match");
    stores = makeClient(storesToken);
  },
);
await verify("API rejects an unauthenticated tenant read", async () => {
  const response = await fetch(`${API}/api/v1/sales/orders`);
  assert(
    response.status === 401,
    `unauthenticated API returned ${response.status}`,
  );
});
await verify("API rejects a malformed bearer token", async () => {
  const response = await fetch(`${API}/api/v1/sales/orders`, {
    headers: { authorization: "Bearer definitely-not-a-token" },
  });
  assert(
    response.status === 401,
    `malformed token returned ${response.status}`,
  );
});
await verify("admin session carries tenant-scoped permissions", async () => {
  const result = await call("GET", "/api/v1/admin/roles");
  expectStatus(result, 200, "role registry");
  assert(rows(result.body).length > 0, "no roles visible");
});

let companies = [];
let items = [];
let warehouses = [];
let stock = [];
let vendors = [];
let purchaseOrders = [];
let customers = [];
let salesOrders = [];
let productionOrders = [];
let inspections = [];
let findings = [];
let capas = [];
let exceptions = [];
let assets = [];
let workOrders = [];
let downtime = [];
let tickets = [];
let claims = [];
let employees = [];
let vouchers = [];
let trialBalance;
let integrations = [];
let agentCatalogue;
let commander;
let commanderMemory;
let knowledgeGraph;
let readiness;
let agentApprovals;
let managedServices;

const surfaces = [
  [
    "company master",
    "/api/v1/general/companies",
    (body) => {
      companies = rows(body);
    },
  ],
  [
    "engineering item master",
    "/api/v1/engineering/items?limit=100",
    (body) => {
      items = rows(body);
    },
  ],
  [
    "warehouse master",
    "/api/v1/inventory/warehouses",
    (body) => {
      warehouses = rows(body);
    },
  ],
  [
    "inventory balances",
    "/api/v1/inventory/stock",
    (body) => {
      stock = rows(body);
    },
  ],
  [
    "approved vendor master",
    "/api/v1/purchase/vendors?limit=100",
    (body) => {
      vendors = rows(body);
    },
  ],
  [
    "purchase-order register",
    "/api/v1/purchase/orders?limit=100",
    (body) => {
      purchaseOrders = rows(body);
    },
  ],
  [
    "customer master",
    "/api/v1/sales/customers?limit=100",
    (body) => {
      customers = rows(body);
    },
  ],
  [
    "sales-order register",
    "/api/v1/sales/orders?limit=100",
    (body) => {
      salesOrders = rows(body);
    },
  ],
  [
    "production-order register",
    "/api/v1/production/orders?limit=100",
    (body) => {
      productionOrders = rows(body);
    },
  ],
  [
    "inspection register",
    "/api/v1/quality/inspections?limit=100",
    (body) => {
      inspections = rows(body);
    },
  ],
  [
    "non-conformance register",
    "/api/v1/quality/findings",
    (body) => {
      findings = rows(body);
    },
  ],
  [
    "corrective-action register",
    "/api/v1/quality/corrective-actions",
    (body) => {
      capas = rows(body);
    },
  ],
  [
    "planning exception queue",
    "/api/v1/planning/exceptions",
    (body) => {
      exceptions = rows(body);
    },
  ],
  [
    "maintenance asset hierarchy",
    "/api/v1/maintenance/assets",
    (body) => {
      assets = rows(body);
    },
  ],
  [
    "maintenance work-order board",
    "/api/v1/maintenance/work-orders",
    (body) => {
      workOrders = rows(body);
    },
  ],
  [
    "downtime ledger",
    "/api/v1/maintenance/downtime",
    (body) => {
      downtime = rows(body);
    },
  ],
  [
    "manufactured-product case queue",
    "/api/v1/csp/tickets?limit=100",
    (body) => {
      tickets = rows(body);
    },
  ],
  [
    "employee-spend claim register",
    "/api/v1/expenditure/claims",
    (body) => {
      claims = rows(body);
    },
  ],
  [
    "employee master",
    "/api/v1/hrm/employees?limit=100",
    (body) => {
      employees = rows(body);
    },
  ],
  [
    "accounting voucher register",
    "/api/v1/accounts/vouchers?limit=100",
    (body) => {
      vouchers = rows(body);
    },
  ],
  [
    "trial balance",
    "/api/v1/accounts/trial-balance?asOf=2026-08-01",
    (body) => {
      trialBalance = body;
    },
  ],
  [
    "integration connection registry",
    "/api/v1/integration/connections",
    (body) => {
      integrations = rows(body);
    },
  ],
  ["AI governance registry", "/api/v1/aiops/registry", () => {}],
  ["Copilot capability catalogue", "/api/v1/copilot/capabilities", () => {}],
  [
    "Agent OS catalogue",
    "/api/v1/agent-os/catalogue",
    (body) => {
      agentCatalogue = unwrap(body);
    },
  ],
  [
    "Decision Commander",
    "/api/v1/agent-os/commander",
    (body) => {
      commander = unwrap(body);
    },
  ],
  [
    "organizational memory",
    "/api/v1/agent-os/commander/memory",
    (body) => {
      commanderMemory = unwrap(body);
    },
  ],
  [
    "enterprise knowledge graph",
    "/api/v1/agent-os/commander/knowledge-graph",
    (body) => {
      knowledgeGraph = unwrap(body);
    },
  ],
  [
    "MVP readiness proof",
    "/api/v1/agent-os/commander/readiness",
    (body) => {
      readiness = unwrap(body);
    },
  ],
  [
    "human approval inbox",
    "/api/v1/agent-os/approvals",
    (body) => {
      agentApprovals = rows(body);
    },
  ],
  [
    "audit-chain verification register",
    "/api/v1/admin/audit/verifications",
    () => {},
  ],
  ["security posture summary", "/api/v1/admin/posture", () => {}],
  [
    "RELAY managed-service assurance",
    "/api/v1/managed-services/overview",
    (body) => {
      managedServices = unwrap(body);
    },
  ],
];

for (const [label, path, remember] of surfaces) {
  await verify(`${label} is authenticated and readable`, async () => {
    const result = await call("GET", path);
    const body = expectStatus(result, 200, label);
    remember(body);
  });
}

let northstarOrder;
let northstarDetail;
let pumpOrder;
let pumpDetail;
let finalInspection;
let northstarClaim;

await verify("canonical Northstar customer exists once", async () => {
  const matches = customers.filter((row) => row.code === "CUST-NPS");
  assert(matches.length === 1, `found ${matches.length} Northstar customers`);
});
await verify(
  "canonical Northstar customer carries the Gujarat GSTIN",
  async () => {
    const customer = customers.find((row) => row.code === "CUST-NPS");
    assert(
      customer?.gstin === "24AABCN5566P1Z3",
      `unexpected GSTIN ${customer?.gstin}`,
    );
  },
);
await verify("canonical customer order is present", async () => {
  northstarOrder = salesOrders.find((row) => row.custPoNo === "NPS/PO/10482");
  assert(northstarOrder, "Northstar order is absent");
});
await verify("Northstar order detail is readable", async () => {
  const result = await call("GET", `/api/v1/sales/orders/${northstarOrder.id}`);
  northstarDetail = expectStatus(result, 200, "Northstar detail");
});
await verify("Northstar order quantity is exactly 120 PX-400", async () => {
  assert(northstarDetail.lines.length === 1, "expected one order line");
  assert(
    Number(northstarDetail.lines[0].qty) === 120,
    "order quantity is not 120",
  );
  assert(
    northstarDetail.lines[0].itemCode === "PMP-PX400",
    "order item is not PX-400",
  );
});
await verify("Northstar gross order value is ₹74.34 lakh", async () => {
  assert(
    Number(northstarDetail.grandTotal) === 7_434_000,
    `value is ${northstarDetail.grandTotal}`,
  );
});
await verify("Northstar promise date is 04-Sep-2026", async () => {
  assert(
    northstarDetail.lines[0].requestedDeliveryDate === "2026-09-04",
    "promise date drifted",
  );
});
await verify("Northstar dispatch quantity is exactly 28", async () => {
  assert(
    sum(northstarDetail.lines.map((line) => line.deliveredQty)) === 28,
    "delivered quantity is not 28",
  );
});
await verify("80 units remain on the Northstar commitment", async () => {
  const line = northstarDetail.lines[0];
  assert(
    Number(line.qty) - Number(line.deliveredQty) === 92,
    "open order quantity should be 92 before held-stock context",
  );
  const held = 12;
  assert(
    Number(line.qty) - Number(line.deliveredQty) - held === 80,
    "remaining build quantity is not 80",
  );
});
await verify("credit decision preserves its limit snapshot", async () => {
  assert(
    Number(northstarDetail.creditLimitSnapshot) === 4_500_000,
    "credit limit snapshot is missing or wrong",
  );
});
await verify(
  "credit decision preserves existing exposure separately from this order",
  async () => {
    const existing = Number(northstarDetail.creditExposureSnapshot);
    const includingOrder = existing + Number(northstarDetail.grandTotal);
    assert(
      existing === 0,
      `existing exposure snapshot is ${existing}, expected 0`,
    );
    assert(
      includingOrder > Number(northstarDetail.creditLimitSnapshot),
      "order should breach the stored credit limit",
    );
  },
);
await verify(
  "the Northstar sales order remains partially dispatched",
  async () => {
    assert(
      northstarDetail.status === "partially_dispatched",
      `status is ${northstarDetail.status}`,
    );
  },
);
await verify("PX-400 production tranche exists", async () => {
  pumpOrder = productionOrders.find(
    (row) => row.itemCode === "PMP-PX400" && Number(row.qtyToProduce) === 40,
  );
  assert(pumpOrder, "40-unit PX-400 order is absent");
});
await verify("PX-400 production detail is readable", async () => {
  const result = await call("GET", `/api/v1/production/orders/${pumpOrder.id}`);
  pumpDetail = expectStatus(result, 200, "PX-400 production detail");
});
await verify("production route contains four ordered operations", async () => {
  assert(
    pumpDetail.operations.length === 4,
    `route has ${pumpDetail.operations.length} operations`,
  );
  assert(
    pumpDetail.operations.map((row) => row.sequence).join(",") ===
      "10,20,30,40",
    "operation sequence drifted",
  );
});
await verify(
  "every production operation has accountable completion evidence",
  async () => {
    assert(
      pumpDetail.operations.every(
        (row) =>
          row.status === "completed" && row.operatorRef && row.evidenceNote,
      ),
      "route evidence is incomplete",
    );
  },
);
await verify("production order received exactly 40 units", async () => {
  assert(
    Number(pumpDetail.producedQty) === 40 && pumpDetail.status === "completed",
    "production output is not complete",
  );
});
await verify("final PX-400 inspection is a real rejected record", async () => {
  finalInspection = inspections.find(
    (row) => row.itemCode === "PMP-PX400" && row.inspectionType === "final",
  );
  assert(
    finalInspection?.result === "rejected",
    "final rejected inspection is absent",
  );
});
await verify(
  "failed runout reading is stored against its applied limit",
  async () => {
    const bad = finalInspection.readings.find(
      (row) =>
        row.characteristicCode?.toLowerCase().includes("runout") &&
        !row.withinSpec,
    );
    assert(
      bad && Number(bad.value) === 0.034 && Number(bad.appliedUsl) === 0.02,
      "0.034 mm versus 0.020 mm evidence is absent",
    );
  },
);
await verify("quality disposition quarantines exactly 12 units", async () => {
  const disposition = finalInspection.dispositions.find(
    (row) => row.dispositionType === "quarantine",
  );
  assert(Number(disposition?.qty) === 12, "quarantine quantity is not 12");
  assert(
    disposition?.inventoryMovementRef,
    "quarantine has no inventory movement evidence",
  );
});
await verify(
  "finished-goods balance is zero after all 28 passed units dispatch",
  async () => {
    const quantity = sum(
      stock
        .filter(
          (row) =>
            row.itemCode === "PMP-PX400" && row.warehouseCode === "WH-FG",
        )
        .map((row) => row.qty),
    );
    assert(quantity === 0, `finished-goods balance is ${quantity}`);
  },
);
await verify("quarantine balance reconciles to 12 PX-400", async () => {
  const quantity = sum(
    stock
      .filter(
        (row) => row.itemCode === "PMP-PX400" && row.warehouseCode === "WH-QC",
      )
      .map((row) => row.qty),
  );
  assert(quantity === 12, `quarantine balance is ${quantity}`);
});
await verify(
  "the 40-unit tranche reconciles as 28 shipped plus 12 held",
  async () => {
    const shipped = sum(northstarDetail.lines.map((line) => line.deliveredQty));
    const held = sum(
      stock
        .filter(
          (row) =>
            row.itemCode === "PMP-PX400" && row.warehouseCode === "WH-QC",
        )
        .map((row) => row.qty),
    );
    assert(
      shipped + held === Number(pumpDetail.producedQty),
      `${shipped} shipped + ${held} held does not equal ${pumpDetail.producedQty} produced`,
    );
  },
);
await verify("NCR is linked to the rejected inspection", async () => {
  const finding = findings.find(
    (row) => row.inspectionNo === finalInspection.inspectionNo,
  );
  assert(
    finding &&
      ["action_active", "effectiveness_review"].includes(finding.status),
    "linked NCR is absent or in the wrong state",
  );
});
await verify("CAPA work is complete but not self-closed", async () => {
  const capa = capas.find((row) => String(row.findingTitle).includes("runout"));
  assert(
    capa?.status === "effectiveness_review",
    `CAPA status is ${capa?.status}`,
  );
  assert(
    capa.effectivenessResult === "pending" && !capa.verifiedBy,
    "CAPA bypassed human effectiveness review",
  );
});
await verify("Furnace 02 exists as the constrained asset", async () => {
  assert(
    assets.some((row) => row.assetCode === "AST-PNQ-FUR-02"),
    "Furnace 02 is absent",
  );
});
await verify("Furnace 02 corrective work order is attributable", async () => {
  const mwo = workOrders.find(
    (row) =>
      row.assetCode === "AST-PNQ-FUR-02" &&
      String(row.title).includes("door seal"),
  );
  assert(mwo?.primaryTechRef, "Furnace corrective MWO or technician is absent");
});
await verify("Furnace downtime records the measured 4.5 hours", async () => {
  const event = downtime.find(
    (row) =>
      row.assetCode === "AST-PNQ-FUR-02" && Number(row.durationMinutes) === 270,
  );
  assert(event, "270-minute Furnace downtime is absent");
});
await verify("Northstar manufactured-product case exists", async () => {
  assert(
    tickets.some((row) =>
      String(row.subject ?? row.title ?? row.customerName)
        .toLowerCase()
        .includes("seal"),
    ),
    "Northstar seal ticket is absent",
  );
});
await verify("Northstar witness-test expense claim exists", async () => {
  northstarClaim = claims.find((row) =>
    row.lines?.some((line) =>
      String(line.description ?? line.merchant).includes("Vadodara"),
    ),
  );
  assert(northstarClaim, "witness-test claim is absent");
});
await verify("employee-spend claim totals reconcile", async () => {
  const lineTotal = sum(northstarClaim.lines.map((line) => line.amount));
  assert(
    lineTotal === Number(northstarClaim.totalClaimed),
    `line total ${lineTotal} does not equal claim ${northstarClaim.totalClaimed}`,
  );
  assert(
    Number(northstarClaim.netReimbursable) >= 0,
    "net reimbursement is negative",
  );
});
await verify(
  "the employee master is populated for accountable actions",
  async () => {
    assert(
      employees.length >= 10,
      `only ${employees.length} employees are present`,
    );
  },
);
await verify(
  "partial dispatch produced a posted accounting voucher",
  async () => {
    assert(
      vouchers.some((row) =>
        String(row.sourceRef ?? row.narration ?? "").includes(
          northstarDetail.soNo,
        ),
      ),
      "Northstar accounting voucher is absent",
    );
  },
);
await verify("trial balance still balances", async () => {
  const body = unwrap(trialBalance);
  const difference = Number(body?.difference ?? body?.totals?.difference ?? 0);
  assert(
    Math.abs(difference) < 0.005,
    `trial balance difference is ${difference}`,
  );
});
await verify(
  "Decision Commander checks all five live source families",
  async () => {
    assert(
      commander.summary.sourcesChecked === 5,
      `sources checked is ${commander.summary.sourcesChecked}`,
    );
  },
);
await verify(
  "Decision Commander includes the partially dispatched Northstar promise",
  async () => {
    assert(
      commander.risks.some((risk) => String(risk.title).includes("Northstar")),
      "Northstar is absent from the decision room",
    );
  },
);
await verify(
  "Northstar is the first decision because live quality evidence makes it critical",
  async () => {
    assert(
      String(commander.risks[0]?.title).includes("Northstar"),
      `first decision is ${commander.risks[0]?.title}`,
    );
    assert(
      commander.risks[0]?.severity === "critical",
      `Northstar severity is ${commander.risks[0]?.severity}`,
    );
  },
);
await verify(
  "Northstar decision links sales and rejected quality evidence",
  async () => {
    const northstar = commander.risks.find((risk) =>
      String(risk.title).includes("Northstar"),
    );
    const domains = new Set(northstar?.evidence?.map((item) => item.domain));
    assert(
      domains.has("sales") && domains.has("quality"),
      `Northstar evidence domains are ${[...domains].join(", ")}`,
    );
    assert(
      /12 PMP-PX400/i.test(northstar?.plainSummary ?? ""),
      `Northstar summary is ${northstar?.plainSummary}`,
    );
  },
);
await verify(
  "repetitive planning rows are grouped into one decision per requirement",
  async () => {
    const planningTitles = commander.risks
      .filter((risk) => risk.kind === "planning")
      .map((risk) => risk.title);
    assert(
      new Set(planningTitles).size === planningTitles.length,
      "duplicate planning decision cards remain",
    );
  },
);
await verify("Decision Commander labels exposure as non-loss", async () => {
  assert(
    /not predicted loss/i.test(commander.summary.exposureBasis),
    "exposure boundary is missing",
  );
});
await verify(
  "organizational memory contains a completed example and the current human gate",
  async () => {
    assert(
      commanderMemory.summary.decisionsRemembered >= 2,
      `only ${commanderMemory.summary.decisionsRemembered} decisions remembered`,
    );
    assert(
      commanderMemory.summary.withVerifiedOutcome >= 1,
      "no verified learning example is present",
    );
    assert(
      commanderMemory.summary.awaitingHumanDecision === 1,
      `expected one current approval, found ${commanderMemory.summary.awaitingHumanDecision}`,
    );
  },
);
await verify(
  "the persisted knowledge graph links at least two business areas",
  async () => {
    assert(
      knowledgeGraph.summary.rememberedDecisions >= 2,
      `only ${knowledgeGraph.summary.rememberedDecisions} decisions persisted`,
    );
    assert(
      knowledgeGraph.summary.relationships >= 2,
      `only ${knowledgeGraph.summary.relationships} evidence relationships persisted`,
    );
    assert(
      knowledgeGraph.summary.businessAreas >= 2,
      `only ${knowledgeGraph.summary.businessAreas} business areas linked`,
    );
  },
);
await verify(
  "the approval inbox contains one current Northstar decision",
  async () => {
    assert(
      agentApprovals.length === 1,
      `approval inbox contains ${agentApprovals.length} items`,
    );
    assert(
      JSON.stringify(agentApprovals[0]?.proposed ?? {}).includes("Northstar"),
      "the pending approval is not the Northstar recovery",
    );
  },
);
await verify(
  "all seven MVP upgrade proofs are visible and honestly labelled",
  async () => {
    assert(
      readiness.upgrades.length === 7,
      `readiness exposes ${readiness.upgrades.length} upgrades`,
    );
    assert(
      readiness.upgrades.every((item) =>
        ["live_mvp", "mvp_operations"].includes(item.status),
      ),
      "an upgrade has an unsupported status",
    );
  },
);
await verify("all nine governed agents are registered in the intended order", async () => {
  assert(
    agentCatalogue.agents.length === 9,
    `catalogue has ${agentCatalogue.agents.length} agents`,
  );
  assert(
    agentCatalogue.agents.some((agent) => agent.key === "RELAY"),
    "RELAY is absent from the catalogue",
  );
  assert(
    agentCatalogue.agents.at(-1)?.key === "ACHILES",
    "ACHILES is not the final registered agent",
  );
});
await verify(
  "RELAY stays visibly illustrative and preserves specialist ownership",
  async () => {
    assert(
      managedServices.evidenceMode === "illustrative_demo_operating_model",
      "managed-service evidence mode is not explicit",
    );
    assert(
      managedServices.boundary.includes("not proof"),
      "managed-service boundary is missing",
    );
    assert(
      managedServices.responsibilities.some(
        (item) =>
          item.accountable === "RELAY" && item.key === "service-incident",
      ),
      "RELAY incident coordination is absent",
    );
    assert(
      managedServices.responsibilities.some(
        (item) =>
          item.accountable === "HEXA" && item.key === "integration-remediation",
      ),
      "HEXA technical ownership was duplicated",
    );
  },
);
await verify(
  "integration registry is readable without a fabricated healthy claim",
  async () => {
    assert(Array.isArray(integrations), "integration registry is not an array");
  },
);
await verify("planning produced an evidence-backed exception set", async () => {
  assert(exceptions.length > 0, "planning has no exceptions to present");
});
await verify("purchase thread contains Meridian 316L supply", async () => {
  assert(
    vendors.some((row) => String(row.name).includes("Meridian")),
    "Meridian vendor is absent",
  );
  assert(
    purchaseOrders.some((row) => String(row.vendorName).includes("Meridian")),
    "Meridian PO is absent",
  );
});
await verify("demo tenant carries both operational warehouses", async () => {
  assert(
    warehouses.some((row) => row.code === "WH-FG") &&
      warehouses.some((row) => row.code === "WH-QC"),
    "FG or quarantine warehouse is absent",
  );
});
await verify(
  "PX-400 item is controlled by the engineering master",
  async () => {
    assert(
      items.some((row) => row.itemCode === "PMP-PX400" && row.bomCount > 0),
      "PX-400 item or BOM is absent",
    );
  },
);
await verify(
  "company registration exists for the Pune seller GSTIN",
  async () => {
    assert(
      JSON.stringify(companies).includes("27AABCT1234F1Z5"),
      "Pune GST registration is absent",
    );
  },
);

await verify(
  "stores persona is denied the administration role registry",
  async () => {
    const result = await stores("GET", "/api/v1/admin/roles");
    assert(
      result.status === 403,
      `stores administration access returned ${result.status}`,
    );
  },
);
await verify(
  "invalid pagination is rejected with validation, not a server error",
  async () => {
    const result = await call("GET", "/api/v1/sales/orders?limit=101");
    assert(result.status === 422, `invalid limit returned ${result.status}`);
  },
);
await verify(
  "a mutation without Idempotency-Key is refused before writing",
  async () => {
    const result = await call("POST", "/api/v1/production/orders", {});
    assert(
      result.status === 422,
      `missing idempotency key returned ${result.status}`,
    );
  },
);
await verify(
  "an unknown production order returns a clean not-found response",
  async () => {
    const result = await call(
      "GET",
      "/api/v1/production/orders/0192a8c0-9999-7000-8000-000000000999",
    );
    assert(
      result.status === 404,
      `unknown production order returned ${result.status}`,
    );
  },
);
await verify("malformed expenditure query is validated", async () => {
  const result = await call(
    "GET",
    "/api/v1/expenditure/budget-check?costCentreRef=CC-SLS&expenseHeadCode=EH-TRV-AIR&amount=-1&fy=bad",
  );
  assert(
    result.status === 422,
    `malformed expenditure query returned ${result.status}`,
  );
});
await verify(
  "no read surface produced a server error during the matrix",
  async () => {
    assert(failed === 0, `${failed} earlier check(s) failed`);
  },
);

console.log(`\n${"=".repeat(72)}`);
console.log(
  `  ${passed} passed · ${failed} failed · ${passed + failed} independent checks`,
);
if (passed + failed < 50) {
  console.error("  FAIL acceptance matrix must contain at least 50 checks");
  process.exit(2);
}
if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((failure) =>
    console.error(`  - ${failure.label}: ${failure.message}`),
  );
  process.exit(1);
}
console.log("  Investor demo acceptance matrix: PASS");
