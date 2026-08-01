#!/usr/bin/env node
/**
 * THE NORTHSTAR PX-400 ORDER — ONE STORY, SEVEN DEPARTMENTS.
 *
 * The base seeder (`01-seed-base-world.mjs`) builds the §7 world: masters, opening stock, a handful
 * of CP-50 orders, the platform console. This file builds the thing an investor is actually
 * shown — a single order followed all the way through, so that every department screen is
 * looking at the same event from its own angle:
 *
 *   MICA   Northstar Process Systems orders 120 PX-400 pumps, ₹74.34 lakh, due 4 September.
 *          The order breaches their credit limit and is HELD until somebody overrides it
 *          in writing.
 *   SPAR   750 kg of 316L bar and 120 casing blanks are bought against it, two signatures
 *          each; the bar is received into quarantine.
 *   KILN   Quality clears the bar; the shop turns it into impellers and shafts, then into
 *          40 finished pumps; final inspection HOLDS 12 of them.
 *   AXLE   MRP nets the whole thing and says what is short and when.
 *   KILN   Furnace 02 — the only annealing route for 316L — fails mid-build and is fixed.
 *   MICA   Northstar raises a ticket about a weeping seal on the pre-shipment sample.
 *   RASP   The people who built it are rostered, paid, and one of them claims the trip to
 *          the supplier's works.
 *   HEXA   Every one of those writes is in a hash-chained trail that verifies at the end.
 *   ONYX   The copilot answers a question about it, with the rows it read.
 *
 * WHY THROUGH THE API, AGAIN. Same reason as the base seeder, and it matters more here:
 * this data has to be COHERENT under questioning. If an investor asks "why are 12 held?",
 * the answer has to be a real inspection with real readings against real characteristics —
 * not a status column somebody set. Twelve pumps missing from the finished-goods balance,
 * a quarantine transfer explaining where they went, and a ledger entry behind that transfer,
 * is a different kind of evidence from a number in a fixture file.
 *
 * PREREQUISITES
 *   1. migration 0058 — the PX-400 masters (items, BOMs, policies, routings, inspection
 *      characteristics, Furnace 02, the FY budget). This script refuses to start without it.
 *   2. `01-seed-base-world.mjs` — the base world it builds on.
 *
 *   node scripts/demo/02-seed-northstar-story.mjs [--verbose]
 *
 * Idempotent by construction: every mutation carries a deterministic Idempotency-Key, so a
 * second run replays rather than duplicates. For a genuinely clean rebuild between
 * presentations use `pnpm demo:rebuild` — see `packages/db/src/demo-reset.ts` for why a
 * row-by-row undo is not possible in a system whose ledgers refuse DELETE.
 */

import {
  TODAY,
  TRISHUL_GSTIN_PUNE,
  SKIPPED,
  token,
  makeClient,
  step,
  expect,
  rows,
  fromToday,
  weekBucket,
  finish,
} from "../shared/demo-client.mjs";

/* ---------------------------------------------------------------- the story */

const NS = {
  customerCode: "CUST-NPS",
  customerName: "Northstar Process Systems Pvt Ltd",
  gstin: "24AABCN5566P1Z3", // Gujarat — inter-state from Pune, so the order carries IGST
  stateCode: "24",
  custPoNo: "NPS/PO/10482",
  qty: 120,
  rate: 52_500,
  dueDate: "2026-09-04",
  /** Below the order value on purpose: the credit gate has to have something to refuse. */
  creditLimit: 4_500_000,
  creditDays: 45,
};

/** The traced heat of 316L. Where it can and cannot go is documented at the GRN step. */
const HEAT = "RM-316L-2407";

/**
 * The inspection characteristics, by the fixed ids migration 0058 gives them.
 *
 * `GET /quality/inspections/:id` returns the sample size and the sampling rationale but NOT
 * the characteristic list — the template is resolved inside the service and never surfaces.
 * There is also no endpoint that lists characteristics, because they are masters and the
 * module exposes a decide surface rather than a create one. Hard-coding the ids is the
 * honest option: they are deterministic, they live twenty lines apart from the readings
 * that use them, and migration 0058 refuses to apply if any of the eight is missing.
 */
const CH = {
  bore: "0192a8c0-0058-7000-8000-0000000000f1",
  runout: "0192a8c0-0058-7000-8000-0000000000f2",
  head: "0192a8c0-0058-7000-8000-0000000000f3",
  leak: "0192a8c0-0058-7000-8000-0000000000f4",
  cr: "0192a8c0-0058-7000-8000-0000000000f5",
  mo: "0192a8c0-0058-7000-8000-0000000000f6",
  hrb: "0192a8c0-0058-7000-8000-0000000000f7",
  mtc: "0192a8c0-0058-7000-8000-0000000000f8",
};

const created = {};

/* ------------------------------------------------------------------- main */

async function main() {
  console.log("THE NORTHSTAR PX-400 ORDER — one story, followed through seven departments.\n");

  const call = makeClient(await token("venkat"));
  const stores = makeClient(await token("poongodi"));
  console.log("  tokens: venkat@trishul (admin), poongodi@trishul (stores in-charge)\n");

  const world = await readWorld(call);

  await mica(call, world);
  await spar(call, stores, world);
  await axle(call, world);
  await kilnProduction(call, world);
  await kilnMaintenance(call, world);
  await micaService(call, world);
  await raspPeople(call, world);
  await micaDispatch(call, world);
  await onyx(call);
  await hexa(call);

  finish([
    `customer     : ${NS.customerName}`,
    ...(created.soNo ? [`sales order  : ${created.soNo}  (${NS.qty} × PX-400, cust ref ${NS.custPoNo})`] : []),
    ...(created.poBar ? [`purchase     : ${created.poBar}  316L bar${created.poCast ? `   ${created.poCast}  casings` : ""}`] : []),
    ...(created.grnNo ? [`receipt      : ${created.grnNo}  (heat ${HEAT})`] : []),
    ...(created.moPump ? [`production   : ${created.moPump}  ${created.moImp ? `${created.moImp} ${created.moSft}` : ""}`] : []),
    ...(created.finalInsp ? [`inspection   : ${created.finalInsp}  ${created.heldQty ?? 0} held`] : []),
    ...(created.mwoNo ? [`maintenance  : ${created.mwoNo}  Furnace 02`] : []),
    ...(created.ticketNo ? [`service      : ${created.ticketNo}`] : []),
    ...(created.dispatchNo ? [`dispatch     : ${created.dispatchNo}`] : []),
  ]);
}

/* ------------------------------------------------------- reference lookups */

/**
 * Read everything the story hangs off, and REFUSE rather than limp if a master is missing.
 *
 * A seeder that carries on past a missing item produces the worst possible outcome: a demo
 * that looks built and is quietly hollow in one department. The failure has to arrive here,
 * with the name of the thing that is absent, not forty steps later as a validation error on
 * a field nobody was looking at.
 */
async function readWorld(call) {
  // 100 is the hard cap on every list endpoint in the tree; asking for more is a 422, not a
  // silent truncation. There are 27 items, so one page is the whole master.
  const items = rows(expect(await call("GET", "/api/v1/engineering/items?limit=100"), 200, "items"));
  const byCode = new Map(items.map((i) => [i.itemCode, i]));
  const need = ["PMP-PX400", "CMP-PX4-IMP", "CMP-PX4-SFT", "CST-PX4-CAS", "RAW-316L-B40", "CMP-PX4-SEAL", "RAW-BLT-M8"];
  const missing = need.filter((c) => !byCode.has(c));
  if (missing.length) {
    throw new Error(
      `the PX-400 item master is missing ${missing.join(", ")} — run migration 0058_northstar_masters.sql first`,
    );
  }

  const wh = new Map(
    rows(expect(await call("GET", "/api/v1/inventory/warehouses"), 200, "warehouses")).map((w) => [w.code, w]),
  );
  const employees = new Map(
    rows(expect(await call("GET", "/api/v1/hrm/employees?limit=100"), 200, "employees")).map((e) => [e.empCode, e]),
  );

  console.log(`  --   ${items.length} items, ${wh.size} warehouses, ${employees.size} employees on hand`);
  return { byCode, wh, employees };
}

/* ------------------------------------------------------------------- MICA */

async function mica(call, { byCode, wh }) {
  console.log("\nMICA — the order, and the credit gate that holds it");

  const customer = await step(`customer ${NS.customerName}`, async () => {
    const res = await call(
      "POST",
      "/api/v1/sales/customers",
      {
        code: NS.customerCode,
        name: NS.customerName,
        gstin: NS.gstin,
        contactEmail: "purchase@northstarprocess.example",
        contactPhone: "+91 265 4471 200",
        billingAddress: "Plot 42, GIDC Estate, Makarpura, Vadodara 390010, Gujarat",
        creditLimit: NS.creditLimit,
        creditDays: NS.creditDays,
      },
      "ns-customer",
    );
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "create customer");
    return { value: b, note: `${NS.gstin} · credit ₹${(NS.creditLimit / 100_000).toFixed(1)} lakh / ${NS.creditDays} days` };
  });

  // Re-read rather than trusting the create: on a replay the create is skipped and there is
  // no body to take an id from.
  const customers = rows(expect(await call("GET", "/api/v1/sales/customers?limit=100"), 200, "customers"));
  const nps = customers.find((c) => c.code === NS.customerCode) ?? customer;
  if (!nps?.id) throw new Error("the Northstar customer is not readable — nothing downstream can be built");
  created.customerId = nps.id;

  const order = await step(
    `order ${NS.custPoNo} — ${NS.qty} × PX-400 @ ₹${NS.rate.toLocaleString("en-IN")}, due ${NS.dueDate}`,
    async () => {
      const res = await call(
        "POST",
        "/api/v1/sales/orders",
        {
          customerId: nps.id,
          custPoNo: NS.custPoNo,
          orderDate: TODAY,
          supplierGstin: TRISHUL_GSTIN_PUNE,
          shipToGstin: NS.gstin,
          shipToStateCode: NS.stateCode,
          shipToAddress: "Northstar Process Systems, Plot 42, GIDC Makarpura, Vadodara 390010",
          fgWarehouseId: wh.get("WH-FG").id,
          lines: [
            {
              itemId: byCode.get("PMP-PX400").id,
              qty: NS.qty,
              rate: NS.rate,
              hsn: "84137010",
              gstRatePct: 18,
              uom: "nos",
              requestedDeliveryDate: NS.dueDate,
            },
          ],
        },
        "ns-so",
      );
      const b = expect(res, [200, 201], "create the Northstar order");
      return { value: b, note: `${b.soNo} — ₹${Number(b.grandTotal ?? 0).toLocaleString("en-IN")} incl. IGST` };
    },
  );
  if (!order) return;
  created.soNo = order.soNo;
  created.soId = order.id;

  /**
   * The credit gate, in two acts — and the first one has to FAIL.
   *
   * ₹74.34 lakh against a ₹45 lakh limit is a refusal, and seeding around it would throw
   * away the most quietly persuasive moment in the demo: the system stops a commercially
   * significant order on its own, names the number, and will not proceed until a person
   * puts a reason in writing. An ERP that says yes to everything is a spreadsheet with a
   * login page.
   */
  await step(`confirm ${order.soNo} — expected to be HELD on credit`, async () => {
    const b = expect(
      await call("POST", `/api/v1/sales/orders/${order.id}/confirm`, {}, "ns-so-confirm-try"),
      [200, 201],
      "first confirm",
    );
    /**
     * READ THE BODY, NOT THE STATUS CODE.
     *
     * A credit hold is a business OUTCOME, not an error: the gate sets `creditStatus: hold`,
     * parks the order in `credit_hold`, snapshots the limit and the exposure onto it, and
     * answers 201. The first version of this check looked for a 409 and duly reported "the
     * credit limit did not bite" while the gate was working perfectly — an assertion that a
     * correct system fails. The two numbers below are the ones the demo actually shows.
     */
    if (b.creditStatus !== "hold" && b.status !== "credit_hold") {
      throw new Error(`expected a credit hold, got creditStatus=${b.creditStatus} status=${b.status}`);
    }
    /**
     * The limit is quoted from what this seeder SET, not from the response.
     *
     * `credit_limit_snapshot` and `credit_exposure_snapshot` are written onto the order row —
     * that is the whole point of snapshotting them, so the decision stays readable after the
     * numbers move — but neither is exposed on `SalesOrderView`, so reading them back gives
     * undefined. Printing them anyway produced "₹0.00 lakh limit" beside a hold that had
     * just fired on that limit: the right outcome with nonsense evidence beside it, which is
     * worse than no evidence. They are visible on the order screen, and in the audit row.
     */
    const lakh = (v) => `₹${(Number(v ?? 0) / 100_000).toFixed(2)} lakh`;
    return { note: `HELD — ${lakh(b.grandTotal)} order against a ${lakh(NS.creditLimit)} limit` };
  });

  await step(`release ${order.soNo} with a written override`, async () => {
    const res = await call(
      "POST",
      `/api/v1/sales/orders/${order.id}/confirm`,
      {
        overrideReason:
          "Northstar has paid 11 of 11 invoices within terms since FY24-25. " +
          "MD approved a temporary limit of ₹80 lakh for this order on 20-Jul-2026 (ref: board note 2627/14).",
      },
      "ns-so-confirm-override",
    );
    const b = expect(res, [200, 201], `confirm ${order.soNo}`);
    return { note: `${b.status ?? "confirmed"} — the reason is on the order, not in somebody's inbox` };
  });
}

/* ------------------------------------------------------------------- SPAR */

async function spar(call, stores, { byCode, wh }) {
  console.log("\nSPAR — buying the 316L, two signatures at a time");

  const vendorSpecs = [
    {
      code: "V-MER-01",
      name: "Meridian Metals & Alloys Pvt Ltd",
      gstin: "27AACCM7788R1ZK",
      address: "Plot 78, Bhosari MIDC, Pune 411026",
      paymentTerms: "45 days",
      note: "the awarded quote",
    },
    {
      code: "V-ATL-01",
      name: "Atlas Alloys India Pvt Ltd",
      gstin: "24AAECA3344N1Z7",
      address: "Survey 210, Por-Ramangamdi, Vadodara 391243",
      paymentTerms: "30 days",
      note: "the alternate quote, ₹9/kg dearer",
    },
  ];
  for (const v of vendorSpecs) {
    await step(`vendor ${v.name} — ${v.note}`, async () => {
      const { note, ...body } = v;
      const res = await call("POST", "/api/v1/purchase/vendors", body, `ns-vendor-${v.code}`);
      if (res.status === 409) return SKIPPED;
      expect(res, [200, 201], `create vendor ${v.code}`);
      return { note: v.gstin };
    });
  }

  const vend = new Map(
    rows(expect(await call("GET", "/api/v1/purchase/vendors?limit=100"), 200, "vendors")).map((v) => [v.code, v]),
  );
  const meridian = vend.get("V-MER-01");
  const sundaram = vend.get("V-SUN-01");
  if (!meridian) throw new Error("Meridian Metals is not in the vendor master — the supply half cannot be built");

  const poSpecs = [
    {
      key: "BAR",
      vendor: meridian,
      expected: fromToday(22),
      remarks:
        `Against Northstar ${NS.custPoNo}. Meridian quote MMA-Q-7719 at ₹385/kg; ` +
        `Atlas Alloys quoted ₹394/kg with a shorter lead time. Awarded on price, heat ${HEAT} nominated.`,
      lines: [{ code: "RAW-316L-B40", qty: 750, rate: 385 }],
      label: "750 kg SS 316L bright bar",
    },
    {
      key: "CAST",
      vendor: sundaram ?? meridian,
      expected: fromToday(25),
      remarks: `Against Northstar ${NS.custPoNo}. PX-400 volute blanks, 316L investment cast.`,
      lines: [{ code: "CST-PX4-CAS", qty: 120, rate: 9600 }],
      label: "120 PX-400 casing blanks",
    },
  ];

  for (const p of poSpecs) {
    const po = await step(`PO to ${p.vendor.name} — ${p.label}`, async () => {
      const res = await call(
        "POST",
        "/api/v1/purchase/orders",
        {
          vendorId: p.vendor.id,
          expectedDate: p.expected,
          remarks: p.remarks,
          lines: p.lines.map((l) => ({ itemId: byCode.get(l.code).id, qty: l.qty, rate: l.rate })),
        },
        `ns-po-${p.key}`,
      );
      const b = expect(res, [200, 201], `create PO ${p.key}`);
      return { value: b, note: `${b.poNo} — ₹${Number(b.totalAmount ?? 0).toLocaleString("en-IN")}` };
    });
    if (!po) continue;
    if (p.key === "BAR") { created.poBar = po.poNo; created.poBarId = po.id; }
    if (p.key === "CAST") created.poCast = po.poNo;

    /**
     * A PO that is already past this point is a REPLAY, not a failure.
     *
     * The create above carries an idempotency key, so a second run gets back the purchase
     * order the first run made — by then submitted, approved and in one case received. Its
     * submit and approve calls then answer `PO_NOT_DRAFT` / `PO_NOT_PENDING`, which is the
     * state machine being right. Reporting those as FAIL made a clean re-run look like six
     * broken steps and buried the ones that were genuinely broken.
     */
    const alreadyPast = (res) =>
      res.status === 409 && ["PO_NOT_DRAFT", "PO_NOT_PENDING"].includes(res.body?.error?.code);

    await step(`submit ${po.poNo}`, async () => {
      const res = await call("POST", `/api/v1/purchase/orders/${po.id}/submit`, {}, `ns-po-submit-${p.key}`);
      if (alreadyPast(res)) return SKIPPED;
      return { note: expect(res, [200, 201], `submit ${p.key}`).status ?? "submitted" };
    });
    // Two people, two roles, two signatures. Approving as the wrong one is refused by name.
    await step(`${po.poNo} step 1 — Stores review (poongodi)`, async () => {
      const res = await stores(
        "POST",
        `/api/v1/purchase/orders/${po.id}/approve`,
        { comment: "Grade and heat nominated; rack space reserved in the quarantine bay." },
        `ns-po-approve1-${p.key}`,
      );
      if (alreadyPast(res)) return SKIPPED;
      return { note: expect(res, [200, 201], `stores approval ${p.key}`).status ?? "step 1 signed" };
    });
    await step(`${po.poNo} step 2 — Admin sign-off (venkat)`, async () => {
      const res = await call(
        "POST",
        `/api/v1/purchase/orders/${po.id}/approve`,
        { comment: "Awarded on price against two quotes; within the FY 2026-27 material budget." },
        `ns-po-approve2-${p.key}`,
      );
      if (alreadyPast(res)) return SKIPPED;
      return { note: expect(res, [200, 201], `admin approval ${p.key}`).status ?? "approved" };
    });
  }

  /**
   * The receipt enters quarantine. When a later issue or transfer does not nominate a
   * batch, Inventory resolves it across positive batches oldest-first and persists each
   * explicit split. The heat number remains visible in the PO and inspection rationale;
   * the stock can now move through the same controlled ledger path without being stranded.
   */
  if (created.poBarId) {
    await step(`GRN against ${created.poBar} into Pune Quarantine`, async () => {
      const detail = expect(await call("GET", `/api/v1/purchase/orders/${created.poBarId}`), 200, "read PO");
      const lines = detail.lines ?? [];
      if (!lines.length) throw new Error("the bar PO has no lines to receive");
      const res = await call(
        "POST",
        "/api/v1/purchase/grns",
        {
          poId: created.poBarId,
          warehouseId: wh.get("WH-QC").id,
          grnDate: fromToday(1),
          lines: lines.map((l) => ({ poLineId: l.id, qty: Number(l.qty) })),
        },
        "ns-grn-bar",
      );
      const b = expect(res, [200, 201], "create the GRN");
      created.grnNo = b.grnNo;
      return { note: `${b.grnNo} — 750 kg held pending incoming inspection` };
    });
  }

  // The parts the plant already had before the demo day. Without these the works order for
  // 40 pumps is short on castings and seals, and the KILN half of the story stops dead.
  await step("opening balances for the PX-400 parts already on hand", async () => {
    // The bolts are shared with the CP-50 line, whose works order has already eaten 163 of
    // the 800 the base seeder opened with. 40 PX-400 need 653 more, and 637 is what is left
    // — a sixteen-bolt shortfall that stops the whole tranche. Topping the bin up is what a
    // stores in-charge does; leaving it out makes the demo turn on a fastener.
    const opening = [
      ["CST-PX4-CAS", 45],
      ["CMP-PX4-SEAL", 100],
      ["RAW-BLT-M8", 1200],
    ];
    const res = await call(
      "POST",
      "/api/v1/stock/entries",
      {
        entryType: "adjustment",
        reasonCode: "opening_balance",
        remarks: "PX-400 parts and fasteners on hand at 20-Jul-2026, from the pre-production batch",
        lines: opening.map(([code, qty]) => ({ itemId: byCode.get(code).id, toWarehouseId: wh.get("WH-ACC").id, qty })),
      },
      "ns-opening-px400",
    );
    expect(res, [200, 201], "opening PX-400 parts");
    return { note: "45 casing blanks, 100 cartridge seals, 1,200 bolts" };
  });
}

/* ------------------------------------------- KILN: quality clears the metal */

async function clearTheBar(call, { byCode, wh, employees }) {
  console.log("\nKILN / Quality — the incoming gate on the 316L");

  const insp = await step("open an incoming inspection on the 750 kg lot", async () => {
    const res = await call(
      "POST",
      "/api/v1/quality/inspections",
      {
        itemId: byCode.get("RAW-316L-B40").id,
        lotQty: 750,
        sourceWarehouseId: wh.get("WH-QC").id,
        inspectionType: "incoming",
      },
      "ns-insp-316l",
    );
    const b = expect(res, [200, 201], "open incoming inspection");
    return { value: b, note: `${b.inspectionNo ?? b.id} — sample ${b.sampleSize ?? "?"} of 750` };
  });
  if (!insp) return;
  created.inInsp = insp.inspectionNo;

  await step("record the readings — composition, hardness, mill certificate", async () => {
    const detail = expect(await call("GET", `/api/v1/quality/inspections/${insp.id}`), 200, "read inspection");
    const n = Math.max(1, Number(detail.sampleSize ?? 3));
    // Comfortably inside spec: this heat is good, and the demo needs it to pass so the metal
    // can move. The interesting failure happens later, on the finished pumps.
    const readings = [];
    for (let i = 0; i < n; i += 1) {
      readings.push({ characteristicId: CH.cr, sampleNo: i + 1, value: 17.1 + i * 0.05 });
      readings.push({ characteristicId: CH.mo, sampleNo: i + 1, value: 2.48 + i * 0.02 });
      readings.push({ characteristicId: CH.hrb, sampleNo: i + 1, value: 81 + i });
      readings.push({ characteristicId: CH.mtc, sampleNo: i + 1, conforming: true });
    }
    const res = await call("POST", `/api/v1/quality/inspections/${insp.id}/readings`, { readings }, "ns-insp-316l-readings");
    expect(res, [200, 201], "record readings");
    return { note: `${readings.length} reading(s) across ${n} specimen(s)` };
  });

  await step("complete the inspection", async () => {
    const res = await call("POST", `/api/v1/quality/inspections/${insp.id}/complete`, undefined, "ns-insp-316l-complete");
    const b = expect(res, [200, 201], "complete inspection");
    return { note: `${b.result ?? b.status}${b.qtyAccepted != null ? ` — ${b.qtyAccepted} accepted` : ""}` };
  });

  await step("accept the lot", async () => {
    const res = await call(
      "POST",
      `/api/v1/quality/inspections/${insp.id}/disposition`,
      {
        dispositionType: "accept",
        qty: 750,
        reason: `Heat ${HEAT}: composition and hardness within spec, EN 10204 3.1 certificate matches. Released for machining.`,
      },
      "ns-insp-316l-accept",
    );
    const b = expect(res, [200, 201], "accept disposition");
    return { note: `${b.dispositionNo ?? "accepted"} — heat ${HEAT} released` };
  });

  /**
   * QUALITY JUDGES; INVENTORY MOVES. An `accept` disposition deliberately posts NO stock
   * movement — `moving = dispositionType !== "accept"` in the service, and the comment above
   * it says why: the gate belongs to the module that owns the transaction, and Quality
   * answers through the inspection-gate port rather than reaching into the ledger.
   *
   * So the release out of quarantine is a stores action, posted through Inventory's single
   * write path like every other movement. Skipping this step is what left 750 kg sitting in
   * the quarantine bay while three works orders failed for want of it — the inspection said
   * "accepted" and nothing had told the warehouse.
   */
  await step("stores releases the heat from quarantine into Pune Stores", async () => {
    const res = await call(
      "POST",
      "/api/v1/stock/entries",
      {
        entryType: "transfer",
        reasonCode: "qc_release",
        remarks: `Released against ${created.inInsp ?? "the incoming inspection"} — heat ${HEAT}`,
        lines: [
          {
            itemId: byCode.get("RAW-316L-B40").id,
            fromWarehouseId: wh.get("WH-QC").id,
            toWarehouseId: wh.get("WH-ACC").id,
            qty: 750,
          },
        ],
      },
      "ns-316l-release",
    );
    expect(res, [200, 201], "release transfer");
    return { note: "750 kg quarantine → stores, with a ledger entry behind it" };
  });
}

/* ------------------------------------------------------------------- AXLE */

async function axle(call, { byCode }) {
  console.log("\nAXLE — netting the order against a plant that is already busy");

  await step("recompute low-level codes over the new BOMs", async () => {
    const b = expect(await call("POST", "/api/v1/planning/policies/recompute-levels"), [200, 201], "recompute");
    return { note: b.headline ?? `${b.updated ?? "?"} item(s) levelled` };
  });

  await step(`master schedule: ${NS.qty} PX-400 in the delivery week`, async () => {
    const res = await call(
      "POST",
      "/api/v1/planning/mps",
      { itemId: byCode.get("PMP-PX400").id, bucket: weekBucket(NS.dueDate), qty: NS.qty, from: TODAY, buckets: 10 },
      "ns-mps-px400",
    );
    const b = expect(res, [200, 201], "set MPS");
    return { note: `${weekBucket(NS.dueDate)} — ATP ${b.atp ?? b.row?.atp ?? "recomputed"}` };
  });

  const run = await step("MRP run over the finished world", async () => {
    const res = await call("POST", "/api/v1/planning/mrp/run", { planningDate: TODAY }, "ns-mrp");
    const b = expect(res, [200, 201], "run MRP");
    return {
      value: b,
      note: `${b.runNo} — ${b.plannedOrderCount ?? "?"} planned order(s), ${b.exceptionCount ?? "?"} exception(s)`,
    };
  });
  if (!run) return;
  created.runNo = run.runNo;

  // What MRP found is more interesting than that it ran. The 316L bar is the long pole —
  // 16 working days and a 250 kg minimum — so the exception it raises is the one a planner
  // has to answer, and the demo should land on it rather than on a count.
  await step("what the run is asking somebody to decide", async () => {
    const b = expect(await call("GET", "/api/v1/planning/exceptions/summary"), 200, "exception summary");
    const bands = b.bySeverity ?? b.summary ?? b;
    return { note: typeof bands === "object" ? JSON.stringify(bands).slice(0, 140) : String(bands) };
  });

  const ex = await step("the 316L shortage, accepted by the planner", async () => {
    const list = rows(expect(await call("GET", "/api/v1/planning/exceptions?limit=100"), 200, "exceptions"));
    /**
     * Pick a SHORTAGE on the Northstar chain, not merely the first row with a PX-400 code on
     * it. Ranking by item alone landed on an `excess` exception — "40 PMP-PX400 on a works
     * order with no demand pegged to it" — which is a true observation about a tranche built
     * ahead of its peg, and completely beside the point of a story about material arriving
     * late. What a planner has to answer is what is short.
     */
    const px = new Set(["RAW-316L-B40", "CMP-PX4-IMP", "CMP-PX4-SFT", "CST-PX4-CAS", "CMP-PX4-SEAL", "PMP-PX400"]);
    const shortage = (e) => /short|late|past_due|reschedule|expedite/i.test(String(e.exceptionType ?? ""));
    const target =
      list.find((e) => px.has(e.itemCode) && shortage(e)) ??
      list.find((e) => shortage(e) && (e.severity === "critical" || e.severity === "high")) ??
      list.find((e) => px.has(e.itemCode)) ??
      list[0];
    if (!target) return SKIPPED;
    const res = await call(
      "POST",
      `/api/v1/planning/exceptions/${target.id}/accept`,
      { note: `Accepted for the Northstar build (${NS.custPoNo}). Meridian confirmed the balance heat for 11-Aug.` },
      `ns-exception-accept-${target.id}`,
    );
    expect(res, [200, 201], "accept exception");
    return { note: `${target.exceptionType ?? "exception"} on ${target.itemCode ?? "?"} — ${String(target.message ?? "").slice(0, 80)}` };
  });
  if (ex === null) console.log("       (no exception to act on — the plan is comfortable)");

  await step("firm a planned order and convert it to a requisition", async () => {
    const list = rows(expect(await call("GET", "/api/v1/planning/planned-orders?limit=200"), 200, "planned orders"));
    const buy = list.find((p) => p.itemCode === "CMP-PX4-SEAL" && p.sourceType === "buy")
      ?? list.find((p) => p.sourceType === "buy");
    if (!buy) return SKIPPED;
    const firm = await call(
      "POST",
      `/api/v1/planning/planned-orders/${encodeURIComponent(buy.orderKey)}/firm`,
      { runNo: created.runNo },
      `ns-firm-${buy.orderKey}`,
    );
    if (firm.status !== 200 && firm.status !== 201 && firm.status !== 409) {
      expect(firm, [200, 201], "firm planned order");
    }
    const res = await call(
      "POST",
      `/api/v1/planning/planned-orders/${encodeURIComponent(buy.orderKey)}/convert`,
      { runNo: created.runNo, suggestedVendorRef: "V-DEC-01" },
      `ns-convert-${buy.orderKey}`,
    );
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "convert planned order");
    created.reqNo = b.reqNo ?? b.requisitionNo;
    return { note: `${buy.itemCode} × ${buy.qty} → requisition ${created.reqNo ?? "raised"}` };
  });

  await step("propose a finite schedule (earliest due date first) and publish it", async () => {
    const res = await call("POST", "/api/v1/planning/schedule/propose", { runNo: created.runNo, rule: "EDD" }, "ns-schedule");
    const b = expect(res, [200, 201], "propose schedule");
    const no = b.scheduleNo ?? b.schedule?.scheduleNo;
    if (no) {
      const pub = await call("POST", `/api/v1/planning/schedule/${no}/publish`, {}, `ns-schedule-publish-${no}`);
      if (pub.status !== 409) expect(pub, [200, 201], "publish schedule");
    }
    return {
      note: `${no ?? "proposed"} — ${b.lateOrderCount ?? 0} late, ${b.makespanDays ?? "?"} day makespan on the bottleneck`,
    };
  });
}

/* ------------------------------------------------------- KILN: making them */

async function kilnProduction(call, world) {
  await clearTheBar(call, world);

  const { byCode, wh } = world;
  console.log("\nKILN — turning 316L bar into pumps, two levels deep");

  /**
   * Three works orders, in the order the metal actually moves. The sub-assemblies are built
   * FIRST and from the received heat, so the finished pumps are made of the bar the GRN
   * brought in rather than appearing out of an opening balance. 45 impellers at 3.2 kg and
   * 45 shafts at 2.4 kg draw ~265 kg of the 750 — the rest is for the remaining 80 pumps,
   * which is why the stock screen still shows a balance at the end.
   */
  const subs = [
    { key: "IMP", code: "CMP-PX4-IMP", qty: 45, label: "45 impellers, milled from the heat" },
    { key: "SFT", code: "CMP-PX4-SFT", qty: 45, label: "45 shafts, turned and ground" },
  ];
  for (const s of subs) {
    const mo = await step(`works order — ${s.label}`, async () => {
      const res = await call(
        "POST",
        "/api/v1/production/orders",
        {
          itemId: byCode.get(s.code).id,
          qtyToProduce: s.qty,
          sourceWarehouseId: wh.get("WH-ACC").id,
          fgWarehouseId: wh.get("WH-ACC").id, // a sub-assembly returns to stores, not to FG
        },
        `ns-mo-${s.key}`,
      );
      const b = expect(res, [200, 201], `create MO ${s.key}`);
      return { value: b, note: b.orderNo };
    });
    if (!mo) continue;
    if (s.key === "IMP") created.moImp = mo.orderNo; else created.moSft = mo.orderNo;

    await step(`issue 316L to ${mo.orderNo}`, async () => {
      const res = await call("POST", `/api/v1/production/orders/${mo.id}/issue`, undefined, `ns-mo-${s.key}-issue`);
      return { note: expect(res, [200, 201], "issue").status ?? "issued" };
    });
    await step(`complete ${mo.orderNo} — ${s.qty} good`, async () => {
      const res = await call(
        "POST",
        `/api/v1/production/orders/${mo.id}/complete`,
        { producedQty: s.qty },
        `ns-mo-${s.key}-complete`,
      );
      return { note: expect(res, [200, 201], "complete").status ?? "completed" };
    });
  }

  const mo = await step("works order — first tranche of 40 PX-400 pumps", async () => {
    const res = await call(
      "POST",
      "/api/v1/production/orders",
      {
        itemId: byCode.get("PMP-PX400").id,
        qtyToProduce: 40,
        sourceWarehouseId: wh.get("WH-ACC").id,
        fgWarehouseId: wh.get("WH-FG").id,
      },
      "ns-mo-pump",
    );
    const b = expect(res, [200, 201], "create the pump MO");
    return { value: b, note: `${b.orderNo} — against ${created.soNo ?? "the Northstar order"}` };
  });
  if (!mo) return;
  created.moPump = mo.orderNo;

  const route = [
    {
      sequence: 10,
      operationCode: "KIT-VERIFY",
      operationName: "Component kit and traceability verification",
      workCenterRef: "WC-KIT-01",
      start: `${TODAY}T08:00:00+05:30`,
      end: `${TODAY}T08:35:00+05:30`,
      evidence: `All 40 kits matched to ${mo.orderNo}; 316L heat ${HEAT} and seal cartridges verified.`,
    },
    {
      sequence: 20,
      operationCode: "ROT-ASSY",
      operationName: "Rotating assembly and runout setup",
      workCenterRef: "WC-ASM-02",
      start: `${TODAY}T08:45:00+05:30`,
      end: `${TODAY}T11:20:00+05:30`,
      evidence: "Impeller, shaft and seal cartridge assembled; production first-piece check recorded at the station.",
    },
    {
      sequence: 30,
      operationCode: "PUMP-ASSY",
      operationName: "Casing assembly and torque verification",
      workCenterRef: "WC-ASM-04",
      start: `${TODAY}T11:30:00+05:30`,
      end: `${TODAY}T14:50:00+05:30`,
      evidence: "Casing fasteners torqued to WI-ASM-042; operator route card completed for 40 units.",
    },
    {
      sequence: 40,
      operationCode: "HYDRO-PRETEST",
      operationName: "Production hydro and performance pre-test",
      workCenterRef: "WC-TEST-01",
      start: `${TODAY}T15:00:00+05:30`,
      end: `${TODAY}T17:10:00+05:30`,
      evidence: "Forty units completed the production pre-test and moved to independent final Quality inspection.",
    },
  ];

  for (const operation of route) {
    await step(`route ${operation.sequence} — ${operation.operationName}`, async () => {
      const res = await call(
        "POST",
        `/api/v1/production/orders/${mo.id}/operations`,
        {
          sequence: operation.sequence,
          operationCode: operation.operationCode,
          operationName: operation.operationName,
          workCenterRef: operation.workCenterRef,
          plannedStart: operation.start,
          plannedEnd: operation.end,
        },
        `ns-mo-pump-op-${operation.sequence}`,
      );
      const body = expect(res, [200, 201], `add production operation ${operation.sequence}`);
      return { note: `${body.orderNo} · ${operation.workCenterRef}` };
    });
  }

  await step(`issue components to ${mo.orderNo}`, async () => {
    const res = await call("POST", `/api/v1/production/orders/${mo.id}/issue`, undefined, "ns-mo-pump-issue");
    return { note: expect(res, [200, 201], "issue").status ?? "issued" };
  });

  for (const operation of route) {
    await step(`start route ${operation.sequence} at ${operation.workCenterRef}`, async () => {
      const res = await call(
        "POST",
        `/api/v1/production/orders/${mo.id}/operations/${operation.sequence}/start`,
        { operatorRef: "Shop-floor team · Pune", inputQty: 40, at: operation.start },
        `ns-mo-pump-op-${operation.sequence}-start`,
      );
      const body = expect(res, [200, 201], `start production operation ${operation.sequence}`);
      return { note: body.operations.find((value) => value.sequence === operation.sequence)?.status ?? "started" };
    });
    await step(`complete route ${operation.sequence} with evidence`, async () => {
      const res = await call(
        "POST",
        `/api/v1/production/orders/${mo.id}/operations/${operation.sequence}/complete`,
        { outputQty: 40, rejectedQty: 0, evidenceNote: operation.evidence, at: operation.end },
        `ns-mo-pump-op-${operation.sequence}-complete`,
      );
      const body = expect(res, [200, 201], `complete production operation ${operation.sequence}`);
      return { note: body.operations.find((value) => value.sequence === operation.sequence)?.status ?? "completed" };
    });
  }

  await step(`complete ${mo.orderNo} — 40 into finished goods`, async () => {
    const res = await call(
      "POST",
      `/api/v1/production/orders/${mo.id}/complete`,
      { producedQty: 40 },
      "ns-mo-pump-complete",
    );
    return { note: expect(res, [200, 201], "complete").status ?? "completed" };
  });

  await finalInspection(call, world);
}

/**
 * The final gate, and the twelve pumps it holds.
 *
 * This is the beat the whole demo turns on, so it is built out of real readings rather than
 * a status: twelve of the forty have shaft runout at the seal face beyond 0.020 mm, that
 * characteristic is classed CRITICAL because a 316L process pump that weeps is a customer
 * incident rather than a quality one, and the disposition moves those twelve out of finished
 * goods into quarantine. Afterwards the FG balance is 28, and there is a ledger entry
 * explaining where the other twelve went.
 */
async function finalInspection(call, { byCode, wh }) {
  console.log("\nKILN / Quality — the final gate");

  const insp = await step("open the final inspection on the 40", async () => {
    const res = await call(
      "POST",
      "/api/v1/quality/inspections",
      {
        itemId: byCode.get("PMP-PX400").id,
        lotQty: 40,
        sourceWarehouseId: wh.get("WH-FG").id,
        inspectionType: "final",
      },
      "ns-insp-final",
    );
    const b = expect(res, [200, 201], "open final inspection");
    return { value: b, note: `${b.inspectionNo ?? b.id} — sample ${b.sampleSize ?? "?"} of 40` };
  });
  if (!insp) return;
  created.finalInsp = insp.inspectionNo;

  await step("record the readings — one sample is out on runout", async () => {
    const detail = expect(await call("GET", `/api/v1/quality/inspections/${insp.id}`), 200, "read inspection");
    const n = Math.max(1, Number(detail.sampleSize ?? 8));
    const readings = [];
    for (let i = 0; i < n; i += 1) {
      const bad = i === 1; // the second unit off the bench
      readings.push({ characteristicId: CH.bore, sampleNo: i + 1, value: 32.008 + i * 0.002 });
      readings.push({ characteristicId: CH.runout, sampleNo: i + 1, value: bad ? 0.034 : 0.011 + i * 0.001 });
      readings.push({ characteristicId: CH.head, sampleNo: i + 1, value: 42.4 - i * 0.1 });
      readings.push({ characteristicId: CH.leak, sampleNo: i + 1, conforming: !bad });
    }
    const res = await call("POST", `/api/v1/quality/inspections/${insp.id}/readings`, { readings }, "ns-insp-final-readings");
    expect(res, [200, 201], "record final readings");
    return { note: `${readings.length} reading(s) across ${n} sample(s) — sample 2 fails runout at 0.034 mm` };
  });

  await step("complete the final inspection", async () => {
    const res = await call("POST", `/api/v1/quality/inspections/${insp.id}/complete`, undefined, "ns-insp-final-complete");
    const b = expect(res, [200, 201], "complete final inspection");
    return { note: `${b.result ?? b.status}${b.verdictRationale ? ` — ${String(b.verdictRationale).slice(0, 80)}` : ""}` };
  });

  await step("hold 12 pumps in quarantine pending re-work", async () => {
    const res = await call(
      "POST",
      `/api/v1/quality/inspections/${insp.id}/disposition`,
      {
        dispositionType: "quarantine",
        qty: 12,
        reason:
          "Shaft runout at the seal face measured 0.034 mm against a 0.020 mm limit on the sampled unit. " +
          "Runout is a critical characteristic on this product; the twelve units from the same setup are held " +
          "for re-grinding and re-test before any of them ships.",
        targetWarehouseId: wh.get("WH-QC").id,
      },
      "ns-insp-final-hold",
    );
    const b = expect(res, [200, 201], "quarantine disposition");
    created.heldQty = 12;
    return { note: `${b.dispositionNo ?? "held"} — finished goods now 28, not 40` };
  });

  const finding = await step("open the non-conformance from the rejected inspection", async () => {
    const res = await call(
      "POST",
      "/api/v1/quality/findings",
      {
        sourceType: "inspection",
        sourceRef: insp.inspectionNo,
        inspectionId: insp.id,
        title: "PX-400 shaft runout at the seal face",
        description:
          "Final inspection found 0.034 mm runout against a 0.020 mm limit. " +
          "The affected twelve-unit machining setup is quarantined and linked to the customer complaint thread.",
        severity: "critical",
        ownerRef: "Production Quality",
        dueDate: "2026-08-02",
      },
      "ns-qms-finding-px400",
    );
    const body = expect(res, [200, 201], "create PX-400 non-conformance");
    created.findingNo = body.findingNo;
    return { value: body, note: `${body.findingNo} — source ${insp.inspectionNo}` };
  });

  if (finding?.findingNo) {
    await step("record immediate containment on the finding", async () => {
      const res = await call(
        "POST",
        `/api/v1/quality/findings/${finding.findingNo}/contain`,
        {
          containment:
            "Twelve pumps from the affected setup moved to WH-QC; dispatch remains blocked until re-grinding and hydro re-test pass.",
        },
        "ns-qms-finding-px400-contain",
      );
      const body = expect(res, [200, 201], "contain PX-400 finding");
      return { note: body.status };
    });

    await step("confirm the evidence-backed root cause", async () => {
      const res = await call(
        "POST",
        `/api/v1/quality/findings/${finding.findingNo}/root-cause`,
        {
          rootCause:
            "Seal-face shaft runout was introduced by a worn locating fixture after the setup reset; the fixture check was absent from the first-piece instruction.",
        },
        "ns-qms-finding-px400-root-cause",
      );
      const body = expect(res, [200, 201], "confirm PX-400 root cause");
      return { note: body.status };
    });

    const capa = await step("open corrective action with a measurable effectiveness gate", async () => {
      const res = await call(
        "POST",
        "/api/v1/quality/corrective-actions",
        {
          findingNo: finding.findingNo,
          title: "Restore fixture control and first-piece seal-face verification",
          actionPlan:
            "Replace the worn locator, add a 0.020 mm first-piece runout check to WI-QA-017 rev 6, and train both machining shifts before the next PX-400 setup.",
          ownerRef: "Quality Manager",
          dueDate: "2026-08-05",
          effectivenessCriteria:
            "Three consecutive PX-400 batches pass runout and hydro test with no repeat seal-weeping complaint.",
        },
        "ns-qms-capa-px400",
      );
      const body = expect(res, [200, 201], "create PX-400 CAPA");
      created.capaNo = body.capaNo;
      return { value: body, note: `${body.capaNo} — effectiveness must be decided by a person` };
    });

    if (capa?.capaNo) {
      await step("complete the corrective work but leave effectiveness to a human", async () => {
        const res = await call(
          "POST",
          `/api/v1/quality/corrective-actions/${capa.capaNo}/complete`,
          {
            completionEvidence:
              "Locator replaced under tool-room job TR-2627-118; WI-QA-017 rev 6 released; day and night shift training acknowledgements attached.",
          },
          "ns-qms-capa-px400-complete",
        );
        const body = expect(res, [200, 201], "complete PX-400 CAPA work");
        return { note: `${body.status} — not closed` };
      });
    }
  }
}

/* -------------------------------------------------- KILN: the furnace stops */

async function kilnMaintenance(call, { employees, wh }) {
  console.log("\nKILN / Maintenance — Furnace 02, the only annealing route there is");

  const operator = employees.get("TPC-0008"); // Sanjay Patil, CNC operator
  const fitter = employees.get("TPC-0011"); // Balaji Gaikwad, maintenance fitter
  if (!operator || !fitter) {
    console.log("  --   the employee master is missing the operator or fitter — skipping the furnace story");
    return;
  }

  const req = await step("operator raises a request — vacuum seal weeping, furnace degraded", async () => {
    const res = await call(
      "POST",
      "/api/v1/maintenance/requests",
      {
        assetCode: "AST-PNQ-FUR-02",
        severity: "degraded",
        symptomCode: "SEAL-WEAR",
        detail:
          "Chamber will not hold below 8×10⁻² mbar. Cycle time on the PX-400 shaft anneal has gone from 95 to 140 minutes.",
        lineStopped: false,
        requestedByRef: operator.id,
        occurredAt: `${fromToday(2)}T06:40:00Z`,
      },
      "ns-mreq-furnace",
    );
    const b = expect(res, [200, 201], "raise maintenance request");
    return { value: b, note: `${b.requestNo} — responds by ${String(b.slaRespondBy ?? "").slice(0, 16).replace("T", " ")}` };
  });
  if (!req) return;

  await step(`acknowledge ${req.requestNo}`, async () => {
    const res = await call("POST", `/api/v1/maintenance/requests/${req.requestNo}/acknowledge`, {}, "ns-mreq-ack");
    if (res.status === 409) return SKIPPED;
    return { note: expect(res, [200, 201], "acknowledge").status ?? "acknowledged" };
  });

  const mwo = await step(`triage ${req.requestNo} into a work order`, async () => {
    const res = await call(
      "POST",
      `/api/v1/maintenance/requests/${req.requestNo}/triage`,
      {
        kind: "create_mwo",
        mwoType: "corrective",
        title: "Furnace 02 — replace chamber door seal and re-test vacuum integrity",
        primaryTechRef: fitter.id,
      },
      "ns-mreq-triage",
    );
    const b = expect(res, [200, 201], "triage");
    return { value: b, note: b.mwoNo ?? "work order raised" };
  });
  const mwoNo = mwo?.mwoNo ?? mwo?.mwo?.mwoNo;
  if (!mwoNo) return;
  created.mwoNo = mwoNo;

  // `start` takes the technician who is picking the job up. The name belongs here: a work
  // order that started but not who started it is missing the half that matters at closure.
  await step(`start ${mwoNo}`, async () => {
    const res = await call(
      "POST",
      `/api/v1/maintenance/work-orders/${mwoNo}/start`,
      { employeeRef: fitter.id, at: `${fromToday(2)}T07:20:00Z` },
      "ns-mwo-start",
    );
    if (res.status === 409) return SKIPPED;
    return { note: expect(res, [200, 201], "start").status ?? "in progress" };
  });

  await step("record the stop against the asset — 4.5 hours, mechanical", async () => {
    const res = await call(
      "POST",
      "/api/v1/maintenance/downtime/start",
      {
        assetCode: "AST-PNQ-FUR-02",
        startedAt: `${fromToday(2)}T07:10:00Z`,
        endedAt: `${fromToday(2)}T11:40:00Z`,
        kind: "unplanned",
        productionImpacting: true,
        reasonCode: "mechanical",
      },
      "ns-downtime-furnace",
    );
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "record downtime");
    return { note: `${b.durationMinutes ?? 270} minutes off the PX-400 anneal route` };
  });

  /**
   * The tasks, AND their results. Adding the checklist without ticking it off leaves the
   * work order uncompletable — `MWO_COMPLETION_BLOCKED: 3 condition(s) unmet`, naming each
   * mandatory task back. That refusal is the module working: a job card is not closed
   * because somebody says the machine runs, it is closed because every step was done and
   * the one measurement on it was taken.
   */
  await step("the fitter's tasks, results and hours", async () => {
    const tasks = [
      { instruction: "Isolate, lock off and allow the chamber to cool below 60 °C.", resultType: "ok_not_ok", result: "ok" },
      { instruction: "Replace the chamber door seal (Viton, 1180 mm).", resultType: "ok_not_ok", result: "ok" },
      { instruction: "Pump down and hold; record the ultimate vacuum after 30 minutes.", resultType: "numeric", expectedMin: 0, expectedMax: 0.05, uom: "mbar", result: "0.04" },
    ];

    /** READ FIRST, THEN ADD. The API also enforces one idempotency key per task mutation;
     *  the read keeps an older demo database safe if it already contains the checklist. */
    const existing = (expect(await call("GET", `/api/v1/maintenance/work-orders/${mwoNo}`), 200, "read work order").tasks ?? []);
    const have = new Set(existing.map((t) => t.instruction));
    let added = 0;
    for (const [index, t] of tasks.entries()) {
      if (have.has(t.instruction)) continue;
      const { result, ...spec } = t;
      const res = await call(
        "POST",
        `/api/v1/maintenance/work-orders/${mwoNo}/tasks`,
        spec,
        `ns-mwo-task-${index + 1}`,
      );
      expect(res, [200, 201], `add MWO task ${index + 1}`);
      added += 1;
    }

    // Sign off every mandatory task that is still open, whichever run created it. The
    // work order cannot be completed while one is unticked, and the module says so by name.
    const now = (expect(await call("GET", `/api/v1/maintenance/work-orders/${mwoNo}`), 200, "re-read work order").tasks ?? []);
    const resultFor = (instruction) => tasks.find((t) => t.instruction === instruction)?.result ?? "ok";
    let done = 0;
    for (const t of now) {
      const seq = t.sequence ?? t.seq;
      if (t.isPass != null || seq == null) continue;
      const rec = await call("PATCH", `/api/v1/maintenance/work-orders/${mwoNo}/tasks/${seq}`, {
        value: resultFor(t.instruction),
      });
      expect(rec, [200, 201], `record result for MWO task ${seq}`);
      done += 1;
    }
    // Starting the MWO already opened this technician's labour clock. Adding a second
    // back-entered interval would correctly fail the exclusion constraint as an overlap;
    // completion closes and values the original clock.
    return { note: `${added} task(s) added, ${done} signed off · labour clock running from MWO start` };
  });

  await step(`complete ${mwoNo} with a cause, not just a tick`, async () => {
    const res = await call(
      "POST",
      `/api/v1/maintenance/work-orders/${mwoNo}/complete`,
      {
        failureModeCode: "BRD",
        failureCauseCode: "SEAL-WEAR",
        detectionCode: "OPR-OBS",
        at: `${fromToday(2)}T11:45:00Z`,
      },
      "ns-mwo-complete",
    );
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "complete work order");
    return { note: `${b.status ?? "completed"} — cause recorded as seal wear, found by the operator` };
  });

  /**
   * COMPLETED, AND DELIBERATELY NOT CLOSED.
   *
   * `GET /maintenance/work-orders` with no status filter returns LIVE work only — closed and
   * cancelled jobs are excluded, which is right for a screen a maintenance lead looks at
   * every morning. Closing this one therefore made it vanish from the very screen the demo
   * opens to show it: the job existed, the costs were computed, and KILN's work-order list
   * said nothing at all.
   *
   * Leaving it completed-awaiting-closure is both the fix and the more truthful state. A
   * finished job waits for someone to sign off the cost before it leaves the board, which is
   * what `mwo_closure_approval` exists for.
   */
  await step(`${mwoNo} is completed and waiting for closure sign-off`, async () => {
    const b = expect(await call("GET", `/api/v1/maintenance/work-orders/${mwoNo}`), 200, "read work order");
    const money = (v) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
    if (Number(b.cost?.labour ?? 0) <= 0) throw new Error("completed MWO has no valued labour");
    return {
      note: `${b.status} — labour ${money(b.cost?.labour)}, spares ${money(b.cost?.spares)}, total ${money(b.cost?.total)}`,
    };
  });

  await step("generate the quarterly PM occurrences for Furnace 02", async () => {
    const res = await call("POST", "/api/v1/maintenance/pm-schedules/PMS-FUR-02-Q/generate", {}, "ns-pm-generate");
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "generate PM");
    return {
      note: b.generated
        ? `${b.mwoNo ?? "occurrence"} scheduled for ${b.dueDate ?? "the next due point"}`
        : `schedule evaluated — ${b.reason ?? "no occurrence due yet"}`,
    };
  });

  // The window goes in the BODY on this one, unlike its sibling GET reports which take it
  // as a query string. Sent as a query string it validates as "from: Required".
  await step("snapshot the reliability KPIs", async () => {
    const res = await call(
      "POST",
      "/api/v1/maintenance/reports/kpis/snapshot",
      { scopeType: "asset", scopeCode: "AST-PNQ-FUR-02", from: fromToday(-30), to: fromToday(7), scheduledHours: 416 },
      "ns-kpi-snapshot",
    );
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "kpi snapshot");
    // The snapshot answers with the scope, the window, a digest of the inputs and whether it
    // reproduced — not with the KPI values themselves. The digest is the interesting part:
    // it is what lets somebody re-run the same window later and prove they got the same
    // numbers from the same facts.
    return {
      note: `${b.scope} ${b.period} — inputs ${String(b.inputsDigest ?? "").slice(7, 19)}… · ${b.reproduced ? "reproduced exactly" : "baseline snapshot stored"}`,
    };
  });
}

/* --------------------------------------------------- MICA: the service side */

async function micaService(call, { byCode, employees }) {
  console.log("\nMICA / Service — Northstar rings about the pre-shipment sample");

  if (!created.customerId) return;
  const engineer = employees.get("TPC-0004"); // Kavita Rao, quality engineer

  const ticket = await step("ticket raised by the customer, by email", async () => {
    const res = await call(
      "POST",
      "/api/v1/csp/tickets",
      {
        customerAccountId: created.customerId,
        subject: "PX-400 pre-shipment sample — seal weep at 1.5× hydro",
        description:
          "Our witness test on the pre-shipment sample showed a weep at the cartridge seal face after 9 minutes at " +
          "1.5× working pressure. Serial PX400-2627-0007. Please confirm the disposition before the balance ships.",
        categoryCode: "product_defect",
        priority: "high",
        productSerialNo: "PX400-2627-0007",
        itemRef: byCode.get("PMP-PX400").id,
        channel: "email",
      },
      "ns-ticket",
    );
    const b = expect(res, [200, 201], "raise ticket");
    return { value: b, note: `${b.ticketNo} — ${b.slaState ?? "on track"}, respond by ${String(b.firstResponseDue ?? "").slice(0, 16).replace("T", " ")}` };
  });
  if (!ticket) return;
  const no = ticket.ticketNo;
  created.ticketNo = no;

  await step("the AI's triage is accepted, not applied", async () => {
    const res = await call(
      "POST",
      `/api/v1/csp/tickets/${no}/triage`,
      { action: "accepted", categoryCode: "product_defect", priority: "high" },
      "ns-ticket-triage",
    );
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "triage");
    return { note: `${b.action ?? "accepted"} — the category and priority the model proposed, confirmed by a person` };
  });

  if (engineer) {
    await step("assigned to technical support", async () => {
      const res = await call(
        "POST",
        `/api/v1/csp/tickets/${no}/assign`,
        { ownerEmployeeRef: engineer.id },
        "ns-ticket-assign",
      );
      if (res.status === 409) return SKIPPED;
      return { note: `${engineer.firstName ?? "owner"} ${engineer.lastName ?? ""}`.trim() };
    });
  }

  await step("entitlement check — is this unit under warranty?", async () => {
    const res = await call("POST", `/api/v1/csp/tickets/${no}/entitlement-check`, {}, "ns-ticket-entitlement");
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "entitlement");
    return { note: String(b.result ?? b.entitlementResult ?? "checked") };
  });

  /**
   * The AI drafts, a person sends. Two calls, deliberately: `suggest-reply` writes a draft
   * into the ticket as an internal comment, and `send-draft` is what makes it visible to
   * the customer. Nothing reaches Northstar because a model decided it should.
   */
  const draft = await step("the copilot drafts a holding reply", async () => {
    const res = await call("POST", `/api/v1/csp/tickets/${no}/ai/suggest-reply`, { template: "under_quality_review" }, "ns-ticket-draft");
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "suggest reply");
    return { value: b, note: `draft ${b.commentId ? "written for review" : "prepared"}` };
  });

  if (draft?.commentId) {
    await step("a person reads it, edits it, and sends it", async () => {
      const res = await call(
        "POST",
        `/api/v1/csp/tickets/${no}/ai/send-draft`,
        {
          commentId: draft.commentId,
          body:
            "Thank you — we have reproduced the weep on our own final inspection and traced it to shaft runout at the " +
            "seal face on one machining setup. Twelve units from that setup, including PX400-2627-0007, are held in " +
            "quarantine for re-grinding and re-test. The balance of the order is unaffected and remains on schedule " +
            "for 4 September. We will send the re-test certificates before dispatch.",
        },
        "ns-ticket-send",
      );
      if (res.status === 409) return SKIPPED;
      expect(res, [200, 201], "send draft");
      return { note: "sent — edited by a human, and the edit is recorded against the draft" };
    });
  }

  await step("linked to a complaint so it reaches Quality", async () => {
    const res = await call(
      "POST",
      `/api/v1/csp/tickets/${no}/complaints`,
      {
        failureSymptom: "Seal weep at 1.5× hydro after 9 minutes",
        productSerialNo: "PX400-2627-0007",
        batchRef: HEAT,
        severity: "major",
      },
      "ns-ticket-complaint",
    );
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "raise complaint");
    return { note: `${b.complaintNo ?? "complaint"} — the same finding the final inspection made, from the other side` };
  });

  // The transition is a PATCH, and a ticket already in that state refuses by name
  // (`TICKET_INVALID_TRANSITION: a ticket cannot go from 'in_progress' to 'in_progress'`),
  // which on a re-run is the state machine being right rather than a failure.
  await step("moved to in progress", async () => {
    const res = await call("PATCH", `/api/v1/csp/tickets/${no}/status`, {
      status: "in_progress",
      reason: "Re-grinding and re-test in hand on the twelve held units.",
    });
    if (res.status === 409 || res.body?.error?.code === "TICKET_INVALID_TRANSITION") return SKIPPED;
    expect(res, [200, 201], "transition ticket");
    return { note: "in progress — the SLA clock keeps running" };
  });
}

/* ------------------------------------------------------------------- RASP */

async function raspPeople(call, { employees }) {
  console.log("\nRASP — the people who built it, and what it cost");

  const shopFloor = ["TPC-0008", "TPC-0009", "TPC-0010"].map((c) => employees.get(c)).filter(Boolean);
  if (shopFloor.length) {
    await step(`roster the shop floor for the build fortnight (${shopFloor.length} people, shift A)`, async () => {
      const res = await call(
        "POST",
        "/api/v1/hrm/roster/bulk",
        {
          employeeIds: shopFloor.map((e) => e.id),
          from: TODAY,
          to: fromToday(13),
          shiftCode: "A",
          weeklyOffWeekday: 0,
        },
        "ns-roster",
      );
      if (res.status === 409) return SKIPPED;
      const b = expect(res, [200, 201], "bulk roster");
      return { note: `${b.created ?? b.count ?? "days"} rostered, Sundays off` };
    });

    await step("process attendance for the build fortnight", async () => {
      const res = await call(
        "POST",
        "/api/v1/hrm/attendance/process",
        { from: TODAY, to: fromToday(13), employeeIds: shopFloor.map((e) => e.id) },
        "ns-attendance-process",
      );
      if (res.status === 409) return SKIPPED;
      const b = expect(res, [200, 201], "process attendance");
      return { note: `${b.processed ?? b.count ?? "days"} day(s) computed from punches` };
    });
  }

  /**
   * The quality engineer's trip to Northstar's works for the witness test — charged to
   * `CC-SLS`, which is where 0031 actually put the travel, lodging and meals budget lines.
   *
   * There are two cost-centre vocabularies in this database and they do not overlap: the
   * EMPLOYEE master says CC-QC, CC-PRD, CC-OPS; the BUDGET master says CC-SLS, CC-PNQ-PROD,
   * CC-ADM. A claim keyed to the employee's own cost centre therefore finds no budget at all
   * and comes back "this spend is unbudgeted" — a correct answer to a question the demo did
   * not mean to ask. Charging customer-facing travel to the sales cost centre is both what a
   * plant does and the only way to reach a budget line here. The split is in the gap report.
   */
  const engineer = employees.get("TPC-0004"); // Kavita Rao — she also owns the Northstar ticket
  if (engineer) {
    const claim = await step("expense claim — the witness test at Northstar's works", async () => {
      const res = await call(
        "POST",
        "/api/v1/expenditure/claims",
        {
          employeeRef: engineer.id,
          costCentreRef: "CC-SLS",
          claimDate: fromToday(3),
          lines: [
            {
              expenseHeadCode: "EH-TRV-AIR",
              expenseDate: fromToday(1),
              amount: 8400,
              gstAmount: 420,
              merchant: "IndiGo",
              description: "Pune → Vadodara return, PX-400 pre-shipment witness test",
              reimbursableType: "bill_backed",
            },
            {
              expenseHeadCode: "EH-TRV-HTL",
              expenseDate: fromToday(1),
              amount: 4200,
              gstAmount: 504,
              merchant: "Express Residency, Vadodara",
              description: "One night, 20-Jul",
              reimbursableType: "bill_backed",
            },
            {
              expenseHeadCode: "EH-TRV-MEA",
              expenseDate: fromToday(1),
              amount: 640,
              gstAmount: 32,
              merchant: "Express Residency, Vadodara",
              description: "Meals during the witness test",
              reimbursableType: "bill_backed",
            },
          ],
        },
        "ns-claim",
      );
      if (res.status === 409) return SKIPPED;
      const b = expect(res, [200, 201], "create claim");
      return { value: b, note: `${b.claimNo} — ₹${Number(b.totalClaimed ?? 13240).toLocaleString("en-IN")}` };
    });

    if (claim?.claimNo) {
      /**
       * The submit key is derived from the CLAIM NUMBER, not fixed.
       *
       * `expense_claim` stores the hash of the submit idempotency key and enforces
       * `uq_claim_idem` across the tenant, so one constant key can submit exactly one claim
       * ever. The claim create endpoint takes no idempotency key, so a second run raises a
       * second claim — which then collided with the first one's stored hash and came back
       * 500 INTERNAL rather than 409, because the duplicate-key violation escapes unmapped.
       * That unmapped violation is a real defect and it is in the gap report; keying per
       * claim is the correct thing for this script to do regardless.
       */
      await step(`submit ${claim.claimNo} — budget checked on the way in`, async () => {
        const res = await call(
          "POST",
          `/api/v1/expenditure/claims/${claim.claimNo}/submit`,
          {},
          `ns-claim-submit-${claim.claimNo}`,
        );
        if (res.status === 409) return SKIPPED;
        const b = expect(res, [200, 201], "submit claim");
        const decisions = (b.budgetCheckResult ?? b.budgetCheck ?? [])
          .map((r) => `${r.expenseHeadCode} ${r.decision}`)
          .join(", ");
        return { note: `${b.status ?? "submitted"}${decisions ? ` — budget: ${decisions}` : ""}` };
      });
      await step(`approve ${claim.claimNo}`, async () => {
        const res = await call("POST", `/api/v1/expenditure/claims/${claim.claimNo}/approve`, {}, "ns-claim-approve");
        if (res.status === 409) return SKIPPED;
        return { note: expect(res, [200, 201], "approve claim").status ?? "approved" };
      });
    }
  }

  // One head at a time is the endpoint's explicit, validated shape. The fiscal year uses
  // the compact key stored by the budget master.
  await step("budget consumption on the air-travel head", async () => {
    const b = expect(
      await call(
        "GET",
        "/api/v1/expenditure/budgets/consumption?fiscalYear=2627&costCentreRef=CC-SLS&expenseHeadCode=EH-TRV-AIR",
      ),
      200,
      "budget consumption",
    );
    const spent = b.consumed ?? b.spent ?? b.consumedToDate;
    const budgeted = b.budgeted ?? b.annualAmount;
    return {
      note:
        spent != null
          ? `₹${Number(spent).toLocaleString("en-IN")} consumed of ₹${Number(budgeted ?? 0).toLocaleString("en-IN")} on EH-TRV-AIR`
          : JSON.stringify(b).slice(0, 120),
    };
  });
}

/* --------------------------------------------------------- MICA: shipping */

async function micaDispatch(call) {
  console.log("\nMICA — shipping what passed");

  if (!created.soId) return;
  await step(`dispatch 28 against ${created.soNo} — the twelve held stay behind`, async () => {
    const detail = expect(await call("GET", `/api/v1/sales/orders/${created.soId}`), 200, "read the order");
    const line = (detail.lines ?? [])[0];
    if (!line) throw new Error("the Northstar order has no lines");
    const res = await call(
      "POST",
      `/api/v1/sales/orders/${created.soId}/dispatch`,
      {
        lines: [{ orderLineId: line.id, qty: 28 }],
        transporter: "Gati-KWE",
        vehicleNo: "MH14JK5520",
      },
      "ns-dispatch",
    );
    const b = expect(res, [200, 201], "dispatch");
    created.dispatchNo = b.dispatchNo;
    created.invoiceNo = b.invoiceNo;
    return { note: `${b.dispatchNo ?? "dispatched"}${b.invoiceNo ? ` / invoice ${b.invoiceNo}` : ""}` };
  });

  if (created.invoiceNo) {
    await step(`report ${created.invoiceNo} to the IRP and raise the e-way bill`, async () => {
      const irn = await call("POST", "/api/v1/integration/einvoice/submit", {
        invoiceRef: created.invoiceNo,
        gstin: TRISHUL_GSTIN_PUNE,
        buyerGstin: NS.gstin,
        shipToGstin: NS.gstin,
        docType: "INV",
        docDate: TODAY,
        fy: "2026-27",
        taxableValue: 1_470_000,
        totalValue: 1_734_600,
        aato: 150_000_000,
      });
      const irnOk = irn.status === 200 || irn.status === 201;
      const ewb = await call("POST", "/api/v1/integration/ewaybill/generate", {
        shipmentRef: `SHP-NS-${String(created.dispatchNo ?? "0001").slice(-4)}`,
        invoiceRef: created.invoiceNo,
        consignmentValue: 1_734_600,
        distanceKm: 470,
        vehicleNo: "MH14JK5520",
        transporterGstin: "27AACFT5566H1ZP",
        shipToGstin: NS.gstin,
        billToState: "27",
        shipToState: "24",
      });
      const ewbOk = ewb.status === 200 || ewb.status === 201;
      // A shipment already billed answers 500 rather than 409 — `uq_ewb_tenant_shipment`
      // fires and the duplicate-key violation is not mapped to the error envelope. Same
      // defect as the claim submit above; it only shows on a re-run.
      const ewbNote = ewbOk
        ? `e-way bill on ${ewb.body?.portalUsed ?? "portal"}`
        : ewb.status === 500
          ? "e-way bill already raised for this shipment"
          : `EWB ${ewb.status}`;
      return { note: `${irnOk ? `IRN ${irn.body?.status ?? "generated"}` : `IRN ${irn.status}`} · ${ewbNote}` };
    });
  }

  await step("Northstar pays part of it", async () => {
    const res = await call(
      "POST",
      "/api/v1/accounts/receipts",
      {
        customerId: created.customerId,
        amount: 1_000_000,
        reference: "NEFT SBIN2627004471",
        receiptDate: fromToday(4),
      },
      "ns-receipt",
    );
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "receipt");
    return { note: `${b.voucherNo ?? "receipt"} — ₹10.00 lakh on account` };
  });
}

/* ------------------------------------------------------------------- ONYX */

async function onyx(call) {
  console.log("\nONYX — the questions, and what the answers are made of");

  /**
   * Phrased the way the intent catalogue is phrased, because the router is DETERMINISTIC.
   *
   * `GET /copilot/catalogue` lists each intent with its example wordings, and questions that
   * miss them come back answered-with-nothing: outcome `answered`, zero rows, zero cited
   * sources. That is the router declining to guess rather than a bug — but a demo question
   * that produces an empty answer looks like the second thing, so these are drawn from the
   * catalogue's own examples.
   */
  const questions = [
    "how much PMP-PX400 do we have",
    // "what is in WH-QC" reads as a MASTER lookup for an item called WH-QC and finds
    // nothing — the router is deterministic, so a warehouse code in a question shaped like
    // an item question goes to the item intent. The movement trail is the better question
    // anyway: it is the audit of where those twelve pumps went.
    "what moved for PMP-PX400",
    "open sales orders",
    // The one it must REFUSE. A copilot that answers everything is a copilot that guesses,
    // and the refusal is worth more airtime than the three answers above it.
    "Should we ship the twelve held pumps anyway to make the date?",
  ];
  for (const [i, question] of questions.entries()) {
    await step(`"${question}"`, async () => {
      const res = await call("POST", "/api/v1/copilot/ask", { question }, `ns-ask-${i}`);
      const b = expect(res, [200, 201], "ask");
      // The evidence lives under `citation`, not at the top level. Reading `b.rowCount`
      // printed "0 row(s), 0 cited source(s)" for answers that had cited three tables and
      // returned real rows — the copilot's whole claim, reported as if it were empty.
      const c = b.citation ?? {};
      const outcome = b.understanding?.outcome ?? (b.answered ? "answered" : "refused");
      return {
        note: `${outcome} — ${c.rowCount ?? 0} row(s) from ${(c.sources ?? []).join(", ") || "no source"}`,
      };
    });
  }

  // A correlation id is metered ONCE — a repeat is a duplicate reading, and the store
  // refuses it. On a re-run against a database that already has the row that surfaces as a
  // 500 rather than a 409, so it is tolerated here rather than reported as a broken step.
  await step("record what those calls cost", async () => {
    const res = await call("POST", "/api/v1/aiops/metrics", {
      featureKey: "copilot.retrieval_qa",
      correlationId: `ns-copilot-${TODAY}`,
      modelCode: "stub-deterministic",
      providerCode: "stub",
      region: "ap-south-1",
      inputTokens: 2840,
      outputTokens: 610,
      latencyMs: 340,
    });
    if (res.status === 409 || res.status === 500) return SKIPPED;
    const b = expect(res, [200, 201], "meter");
    return { note: `${b.inputTokens + b.outputTokens} tokens priced at the rate in force on ${b.priceEffectiveFrom}` };
  });

  /**
   * The prompt lifecycle, in the order §4 requires it: a candidate is WRITTEN, then EVALUATED
   * against the golden set, then promoted — and never the other way round.
   *
   * The eval has to name the prompt it judged. `ck_aievalrun_bound` refuses to store a
   * PASSING eval with a null `prompt_content_hash`, which is the database enforcing that a
   * green tick always points at a specific piece of text. Recording the eval without one
   * fails at the constraint, and the first version of this step did exactly that: a 500 with
   * no clue in the response, because the rule lives in Postgres rather than in the DTO.
   */
  const prompt = await step("a candidate triage prompt is written", async () => {
    const res = await call("POST", "/api/v1/aiops/prompts", {
      featureKey: "csp.ticket_triage",
      template:
        "You are triaging an inbound service ticket for an Indian pump manufacturer.\n" +
        "Read the subject and body and return the category and priority ONLY from the lists given.\n" +
        "Categories: {{categories}}\nPriorities: low, medium, high, urgent\n" +
        "Subject: {{subject}}\nBody: {{body}}\n" +
        "If the text is ambiguous, return the lower priority and say why in one sentence.",
      declaredVariables: ["categories", "subject", "body"],
      outputSchema: '{"category":"string","priority":"string","why":"string"}',
      changeSummary: "Ask for the lower priority when ambiguous, after the July over-escalation cluster.",
    });
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "write prompt");
    return { value: b, note: `v${b.version} draft — hash ${String(b.contentHash ?? "").slice(0, 12)}…` };
  });

  const hash =
    prompt?.contentHash ??
    (await (async () => {
      const p = await call("GET", "/api/v1/aiops/prompts/csp.ticket_triage");
      return rows(p.body).map((v) => v.contentHash).find(Boolean) ?? null;
    })());

  const evalRun = await step("golden-set eval on that exact prompt", async () => {
    if (!hash) return SKIPPED;
    const res = await call("POST", "/api/v1/aiops/evals", {
      featureKey: "csp.ticket_triage",
      datasetVersion: "2026-07-a",
      promptContentHash: hash,
      metric: "category_accuracy",
      baselineScore: 0.89,
      candidateScore: 0.93,
      tolerance: 0.02,
      mustPassFailures: [],
      caseCount: 140,
      failureClusters: [
        { label: "warranty vs billing confusion", count: 6 },
        { label: "Marathi free text", count: 5 },
      ],
    });
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "eval");
    return { value: b, note: `${b.verdict ?? "recorded"} — 0.93 against a 0.89 baseline over 140 cases` };
  });

  /**
   * PROMOTION NEEDS A SECOND PERSON, and the gate says so by name:
   *
   *   AIOPS_PROMOTION_REFUSED — Promotion refused. Still needs: an approver who is not the
   *   author. The gate is not a warning.
   *
   * venkat wrote the prompt above, so venkat cannot promote it. Deepak Menon — the HEXA
   * platform administrator, one of the five demo personas — approves it instead. Two people
   * on a prompt change is the same rule as two people on a purchase order, applied to the
   * thing that decides how a model reads a customer's complaint.
   */
  if (prompt?.version && evalRun?.verdict === "pass") {
    await step(`promote csp.ticket_triage v${prompt.version} — by someone other than its author`, async () => {
      const approver = makeClient(await token("hexa.admin"));
      const res = await approver(
        "POST",
        `/api/v1/aiops/prompts/csp.ticket_triage/${prompt.version}/promote`,
        { reason: "Golden-set eval passed at 0.93 with no must-pass failures. Reviewed the two failure clusters." },
        `ns-prompt-promote-${prompt.version}`,
      );
      if (res.status === 409 && res.body?.error?.code !== "AIOPS_PROMOTION_REFUSED") return SKIPPED;
      const b = expect(res, [200, 201], "promote");
      return { note: `${b.stage ?? "production"} — written by one person, promoted by another` };
    });
  }

  await step("the kill switch answers a probe", async () => {
    const res = await call("POST", "/api/v1/aiops/kill-switch/csp.ticket_triage/probe", { refused: false, elapsedMs: 12 });
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "probe");
    return { note: b.headline ?? `probed — ${JSON.stringify(b).slice(0, 80)}` };
  });
}

/* ------------------------------------------------------------------- HEXA */

async function hexa(call) {
  console.log("\nHEXA — the evidence, last, so it covers everything above");

  await step("the governance review for the credit override", async () => {
    const res = await call("POST", "/api/v1/admin/incidents", {
      incidentNo: "HEXA-GOV-024",
      title: "Credit limit overridden on the Northstar PX-400 order",
      severity: "low",
      category: "commercial_control",
      detectedAt: `${TODAY}T09:40:00Z`,
      description:
        `Sales order ${created.soNo ?? "for Northstar Process Systems"} was confirmed above the customer's ` +
        "₹45 lakh credit limit under a written override. Recorded for the quarterly control review: the override " +
        "reason, the person who gave it and the exposure at the time are all on the order.",
      piiAffected: false,
      certInReportable: false,
    });
    // 500 here is `uq_incident_tenant_no` on a re-run — the same unmapped duplicate-key
    // violation as the claim submit and the e-way bill.
    if (res.status === 409 || res.status === 500) return SKIPPED;
    const b = expect(res, [200, 201], "raise governance record");
    return { note: `${b.incidentNo ?? "HEXA-GOV-024"} — a control that fired, logged as one` };
  });

  for (const chain of ["audit_log", "ai_action_log"]) {
    await step(`verify the ${chain} hash chain`, async () => {
      const b = expect(await call("POST", `/api/v1/admin/audit/verify?chain=${chain}`), [200, 201], `verify ${chain}`);
      if (b.intact === false) {
        throw new Error(`${chain} is BROKEN at ${b.firstBreakSeq} (${b.breakKind}): ${b.message}`);
      }
      return { note: b.message };
    });
  }

  await step("anchor the audit chain over the whole story", async () => {
    const b = expect(await call("POST", "/api/v1/admin/audit/anchor"), [200, 201], "anchor");
    return { note: b.anchored ? `anchored up to seq ${b.uptoSeq}` : String(b.reason) };
  });
}

main().catch((e) => {
  console.error("\nseeder aborted:", e.message);
  process.exit(2);
});
