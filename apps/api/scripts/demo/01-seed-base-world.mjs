#!/usr/bin/env node
/**
 * THE §7 DEMO UNIVERSE, BUILT THROUGH THE API.
 *
 * Every document here is created by a real HTTP request against a running server, with a
 * real Keycloak token, through the same guards, transactions and RLS a user goes through.
 * Nothing is INSERTed behind the application's back.
 *
 * That choice costs a little speed and buys three things worth more than the speed:
 *
 *   - The demo dataset is EVIDENCE. If the seeder runs green, the order-to-dispatch path
 *     works — a fixture file loaded straight into Postgres proves only that Postgres
 *     accepts rows.
 *   - Every document gets its number from the real series (SO-2627-00001, not a uuid
 *     fragment), because it went through the code that allocates them.
 *   - Stock, ledger and audit rows arrive by their own write paths, so the numbers on one
 *     screen reconcile with the numbers on another. A seeded stock balance that no ledger
 *     entry explains is exactly the incoherence that ends a demo early.
 *
 * Idempotent by construction: every mutating call carries a deterministic Idempotency-Key,
 * so re-running adds nothing. `--reset` clears the demo documents first (never the masters,
 * never another tenant) for a clean rebuild.
 *
 *   node scripts/demo/01-seed-base-world.mjs [--reset] [--verbose]
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
  daysAgo,
  fyOf,
  finish,
} from "../shared/demo-client.mjs";

const created = { vendors: [], orders: [], pos: [], grns: [], mos: [], dispatches: [] };

/* ------------------------------------------------------------------- the world */

async function seedTrishul(call, stores) {
  console.log("\nTRISHUL PRECISION COMPONENTS — Pune-Chakan, FY 2026-27, demo today 20-Jul-2026");

  // ---- reference data the thread hangs off ----------------------------------
  const items = rows(expect(await call("GET", "/api/v1/engineering/items?limit=100"), 200, "items"));
  const byCode = new Map(items.map((i) => [i.itemCode, i]));
  const warehouses = rows(
    expect(await call("GET", "/api/v1/inventory/warehouses"), 200, "warehouses"),
  );
  const wh = new Map(warehouses.map((w) => [w.code, w]));
  const customers = rows(
    expect(await call("GET", "/api/v1/sales/customers?limit=50"), 200, "customers"),
  );
  const cust = new Map(customers.map((c) => [c.code ?? c.name, c]));

  const need = ["PMP-CP50", "CMP-CAS50", "CMP-IMP6", "CMP-SFT20", "CMP-SEAL20", "RAW-BLT-M8"];
  const missing = need.filter((c) => !byCode.has(c));
  if (missing.length) throw new Error(`item master is missing ${missing.join(", ")}`);
  console.log(`  --   ${items.length} items, ${warehouses.length} warehouses, ${customers.length} customers on hand`);

  // ---- 0. opening stock ------------------------------------------------------
  //
  // A plant on the morning of 20 July is not empty. These are the balances the factory
  // opens the demo day with, posted as an `adjustment` through Inventory's SINGLE write
  // path — the same endpoint a stock take uses. Nothing writes stock_balance directly,
  // including this seeder, so every quantity on a screen has a ledger entry explaining it.
  //
  // Quantities are chosen so the plan is TIGHT rather than comfortable: enough castings to
  // start, not enough to finish the order book. A demo where nothing is short has nothing
  // for MRP to say.
  console.log("\n  Opening stock (through POST /stock/entries — the one write path)");
  await step("opening balances into Pune Stores", async () => {
    const opening = [
      ["CMP-CAS50", 22],
      ["CMP-IMP6", 30],
      ["CMP-SFT20", 90],
      ["CMP-SEAL20", 120],
      ["CST-CAS50", 35],
      ["CST-IMP6", 40],
      ["PMP-CP50", 8],
    ];
    const res = await call(
      "POST",
      "/api/v1/stock/entries",
      {
        entryType: "adjustment",
        reasonCode: "opening_balance",
        remarks: "Opening balances, 20-Jul-2026",
        lines: opening.map(([code, qty]) => ({
          itemId: byCode.get(code).id,
          toWarehouseId: wh.get("WH-ACC").id,
          qty,
        })),
      },
      "demo-opening-stock",
    );
    const body = expect(res, [200, 201], "opening stock");
    return { note: `${opening.length} item(s), entry ${body.entryId ?? body.id ?? "posted"}` };
  });

  // Finished goods the plant already had before the demo day, so the first dispatch does
  // not depend on the production order completing first.
  await step("opening finished goods into Pune FG", async () => {
    const res = await call(
      "POST",
      "/api/v1/stock/entries",
      {
        entryType: "adjustment",
        reasonCode: "opening_balance",
        remarks: "Opening finished goods, 20-Jul-2026",
        lines: [{ itemId: byCode.get("PMP-CP50").id, toWarehouseId: wh.get("WH-FG").id, qty: 12 }],
      },
      "demo-opening-fg",
    );
    expect(res, [200, 201], "opening FG");
    return { note: "12 × PMP-CP50" };
  });

  // ---- 1. the vendor master, with the pair the AI has to notice ---------------
  //
  // The duplicate-vendor moment is the centre of the "AI drafts, a human approves" story,
  // and it needs something to actually find. These two are the same firm written two ways —
  // the form a real vendor master acquires when two buyers key it in the same week.
  console.log("\n  Vendor master");
  const vendorSpecs = [
    { code: "V-SUN-01", name: "Sundaram Precision Castings Pvt Ltd", gstin: "33AADCS4455L1Z2",
      address: "Plot 14, SIDCO Industrial Estate, Coimbatore 641021", paymentTerms: "30 days" },
    { code: "V-BHR-01", name: "Bharat Fasteners & Hardware", gstin: "27AABCB9911Q1ZP",
      address: "Gat 221, Chakan MIDC Phase II, Pune 410501", paymentTerms: "45 days" },
    { code: "V-DEC-01", name: "Deccan Seals & Gaskets", gstin: "36AACCD2244H1Z8",
      address: "Plot 9, Balanagar, Hyderabad 500037", paymentTerms: "30 days" },
  ];
  for (const v of vendorSpecs) {
    await step(`vendor ${v.name}`, async () => {
      const res = await call("POST", "/api/v1/purchase/vendors", v, `demo-vendor-${v.code}`);
      if (res.status === 409) return SKIPPED;
      const body = expect(res, [200, 201], `create vendor ${v.code}`);
      created.vendors.push(body.id ?? body.vendorId);
      return { note: body.vendorNo ?? v.code };
    });
  }

  // The near-duplicate. It is SUPPOSED to be flagged: the create returns the AI's
  // explanation and the caller has to acknowledge it deliberately.
  await step("near-duplicate vendor is FLAGGED, not silently created", async () => {
    const res = await call(
      "POST",
      "/api/v1/purchase/vendors",
      {
        code: "V-SUN-02",
        name: "Sundaram Precision Castings Private Limited",
        gstin: "33AADCS4455L1Z2",
        address: "Plot 14, SIDCO Indl Estate, Coimbatore - 641021",
      },
      "demo-vendor-dup-probe",
    );
    if (res.status === 200 || res.status === 201) {
      const dupes = res.body?.duplicates ?? res.body?.matches ?? [];
      if (dupes.length === 0) throw new Error("created with NO duplicate warning — the demo has nothing to show");
      return { note: `${dupes.length} match(es) surfaced for a human to judge` };
    }
    if (res.status === 409) {
      return { note: "refused pending acknowledgement (409)" };
    }
    expect(res, [200, 201, 409], "duplicate vendor probe");
  });

  const vendors = rows(expect(await call("GET", "/api/v1/purchase/vendors?limit=50"), 200, "vendors"));
  const vend = new Map(vendors.map((v) => [v.code, v]));
  const castingVendor = vend.get("V-SUN-01") ?? vendors[0];
  const fastenerVendor = vend.get("V-BHR-01") ?? vendors[0];

  // ---- 2. demand: the orders the plant is working against --------------------
  console.log("\n  Sales orders (the demand MRP nets against)");
  const customerA = cust.get("Bharat Auto Components Pvt Ltd") ?? customers[0];
  const customerB = cust.get("Sundaram Motors Ltd") ?? customers[1] ?? customers[0];
  const orderSpecs = [
    { key: "SO-A", customer: customerA, custPoNo: "BAC/PO/2026/1187", qty: 24, rate: 12500, due: "2026-08-07" },
    { key: "SO-B", customer: customerB, custPoNo: "SML-4471", qty: 40, rate: 12250, due: "2026-08-21" },
    { key: "SO-C", customer: customerA, custPoNo: "BAC/PO/2026/1206", qty: 18, rate: 12500, due: "2026-09-04" },
  ];
  for (const o of orderSpecs) {
    await step(`order ${o.custPoNo} — ${o.qty} × PMP-CP50 due ${o.due}`, async () => {
      const res = await call(
        "POST",
        "/api/v1/sales/orders",
        {
          customerId: o.customer.id,
          custPoNo: o.custPoNo,
          orderDate: TODAY,
          supplierGstin: TRISHUL_GSTIN_PUNE,
          // Dispatch reduces stock from a named warehouse, so the order has to say which
          // one when it is raised — an order with no source cannot be shipped, and the
          // refusal arrives at dispatch time when it is least convenient.
          fgWarehouseId: wh.get("WH-FG").id,
          lines: [
            {
              itemId: byCode.get("PMP-CP50").id,
              qty: o.qty,
              rate: o.rate,
              hsn: "84137010",
              gstRatePct: 18,
              uom: "nos",
              // The date this script has always printed in its own step label and then
              // thrown away, because the endpoint had nowhere to put it. It is what MRP
              // walks backwards from, so without it every planned order was dated from an
              // assumption rather than from a promise the customer was actually given.
              requestedDeliveryDate: o.due,
            },
          ],
        },
        `demo-so-${o.key}`,
      );
      const body = expect(res, [200, 201], `create ${o.key}`);
      created.orders.push({ ...o, id: body.id, soNo: body.soNo, lines: body.lines });
      return { note: body.soNo };
    });
  }

  for (const o of created.orders) {
    await step(`confirm ${o.soNo} (credit gate)`, async () => {
      const res = await call("POST", `/api/v1/sales/orders/${o.id}/confirm`, {}, `demo-confirm-${o.key}`);
      if (res.status === 409 || res.status === 422) {
        // A credit hold is a legitimate outcome and worth SHOWING, not seeding around.
        return { note: `held: ${res.body?.error?.code ?? res.status}` };
      }
      const body = expect(res, [200, 201], `confirm ${o.soNo}`);
      return { note: body.status ?? "confirmed" };
    });
  }

  // ---- 3. supply: buy the castings the plan asks for --------------------------
  console.log("\n  Purchase — raise, approve, receive");
  const poSpecs = [
    { key: "PO-CAST", vendor: castingVendor, expected: "2026-08-10",
      lines: [{ code: "CST-CAS50", qty: 60, rate: 1850 }, { code: "CST-IMP6", qty: 50, rate: 1240 }] },
    { key: "PO-FAST", vendor: fastenerVendor, expected: "2026-07-31",
      lines: [{ code: "RAW-BLT-M8", qty: 800, rate: 7.4 }] },
  ];
  for (const p of poSpecs) {
    const po = await step(`PO to ${p.vendor.name} (${p.lines.length} line(s))`, async () => {
      const res = await call(
        "POST",
        "/api/v1/purchase/orders",
        {
          vendorId: p.vendor.id,
          expectedDate: p.expected,
          lines: p.lines.map((l) => ({ itemId: byCode.get(l.code).id, qty: l.qty, rate: l.rate })),
        },
        `demo-po-${p.key}`,
      );
      const body = expect(res, [200, 201], `create ${p.key}`);
      return { value: body, note: body.poNo };
    });
    if (!po) continue;
    created.pos.push({ ...p, ...po });

    await step(`submit ${po.poNo} for approval`, async () => {
      const res = await call("POST", `/api/v1/purchase/orders/${po.id}/submit`, {}, `demo-po-submit-${p.key}`);
      const body = expect(res, [200, 201], `submit ${p.key}`);
      return { note: body.status ?? "submitted" };
    });

    // A submitted PO is not a receivable one, and it is not one signature away from being
    // one. `po_approval` is a TWO-level definition — Stores review by the stores in-charge,
    // then admin sign-off — so two different people with two different roles have to act.
    // Approving as the wrong one is refused by name ("You are not an approver for step 1"),
    // which is the separation of duties doing its job rather than describing itself.
    await step(`approve ${po.poNo} step 1 — Stores review (poongodi)`, async () => {
      const res = await stores(
        "POST",
        `/api/v1/purchase/orders/${po.id}/approve`,
        { comment: "Quantities match the requisition; bin space available." },
        `demo-po-approve1-${p.key}`,
      );
      const body = expect(res, [200, 201], `stores approval of ${p.key}`);
      return { note: body.status ?? "step 1 signed" };
    });
    await step(`approve ${po.poNo} step 2 — Admin sign-off (venkat)`, async () => {
      const res = await call(
        "POST",
        `/api/v1/purchase/orders/${po.id}/approve`,
        { comment: "Within budget; vendor rated A." },
        `demo-po-approve2-${p.key}`,
      );
      const body = expect(res, [200, 201], `admin approval of ${p.key}`);
      return { note: body.status ?? "approved" };
    });
  }

  // Receive the fastener order in full — the plant has the bolts, and the stock ledger
  // will say so through Inventory's single write path.
  const fastPo = created.pos.find((p) => p.key === "PO-FAST");
  if (fastPo) {
    await step(`GRN against ${fastPo.poNo} into WH-ACC`, async () => {
      const detail = expect(
        await call("GET", `/api/v1/purchase/orders/${fastPo.id}`),
        200,
        "read PO",
      );
      const poLines = detail.lines ?? [];
      if (!poLines.length) throw new Error("PO has no lines to receive");
      const res = await call(
        "POST",
        "/api/v1/purchase/grns",
        {
          poId: fastPo.id,
          warehouseId: wh.get("WH-ACC").id,
          grnDate: TODAY,
          // NO BATCH, and not for realism — M8 bolts genuinely are not lot-tracked, but the
        // reason this line says so explicitly is a defect found while seeding:
        //
        //   Stock received AGAINST A BATCH cannot be consumed by production at all.
        //   `stock_balance` is keyed (item, warehouse, batch); the production issue path
        //   asks for the (item, warehouse, NULL) row and finds nothing, while 800 units sit
        //   in the batch row beside it. `POST /production/orders/:id/issue` accepts no batch
        //   parameter, so there is no way to nominate one either — meaning a plant that
        //   receives anything by lot number can never build with it.
        //
        // Receiving without a batch is a workaround here, not the fix. The fix is for the
        // issue path to consume across batches oldest-first when none is nominated, which
        // touches the ledger and deserves its own tests rather than a hurried patch.
        lines: poLines.map((l) => ({ poLineId: l.id, qty: Number(l.qty) })),
        },
        `demo-grn-${fastPo.key}`,
      );
      const body = expect(res, [200, 201], "create GRN");
      created.grns.push(body);
      return { note: body.grnNo };
    });
  }

  // ---- 4. make -------------------------------------------------------------
  console.log("\n  Production — issue components, receive finished goods");
  const mo = await step("production order for 20 × PMP-CP50", async () => {
    const res = await call(
      "POST",
      "/api/v1/production/orders",
      {
        itemId: byCode.get("PMP-CP50").id,
        qtyToProduce: 20,
        sourceWarehouseId: wh.get("WH-ACC").id,
        fgWarehouseId: wh.get("WH-FG").id,
      },
      "demo-mo-01",
    );
    const body = expect(res, [200, 201], "create MO");
    return { value: body, note: body.orderNo };
  });
  if (mo) {
    created.mos.push(mo);
    await step(`issue components to ${mo.orderNo}`, async () => {
      const res = await call("POST", `/api/v1/production/orders/${mo.id}/issue`, undefined, "demo-mo-01-issue");
      const body = expect(res, [200, 201], "issue");
      return { note: body.status ?? "issued" };
    });
    await step(`complete ${mo.orderNo} — 20 good`, async () => {
      const res = await call(
        "POST",
        `/api/v1/production/orders/${mo.id}/complete`,
        { producedQty: 20 },
        "demo-mo-01-complete",
      );
      const body = expect(res, [200, 201], "complete");
      return { note: body.status ?? "completed" };
    });
  }

  // ---- 5. ship -------------------------------------------------------------
  console.log("\n  Dispatch");
  const shipMe = created.orders[0];
  if (shipMe) {
    await step(`dispatch 10 against ${shipMe.soNo}`, async () => {
      const detail = expect(await call("GET", `/api/v1/sales/orders/${shipMe.id}`), 200, "read SO");
      const line = (detail.lines ?? [])[0];
      if (!line) throw new Error("order has no lines");
      const res = await call(
        "POST",
        `/api/v1/sales/orders/${shipMe.id}/dispatch`,
        {
          lines: [{ orderLineId: line.id, qty: 10 }],
          transporter: "VRL Logistics",
          vehicleNo: "MH12AB4417",
        },
        "demo-dispatch-01",
      );
      const body = expect(res, [200, 201], "dispatch");
      created.dispatches.push(body);
      return { note: `${body.dispatchNo ?? "dispatched"}${body.invoiceNo ? ` / invoice ${body.invoiceNo}` : ""}` };
    });
  }

  // ---- 6. plan -------------------------------------------------------------
  //
  // Run MRP LAST, so it nets against the world the steps above actually built: the real
  // open demand, the real stock, the real open purchase orders. Run first, it would plan
  // against a plant that no longer exists by the end of the script.
  console.log("\n  Planning — one authoritative MRP run over the finished world");
  await step("MRP run", async () => {
    const res = await call("POST", "/api/v1/planning/mrp/run", { planningDate: TODAY }, "demo-mrp-final");
    const body = expect(res, [200, 201], "run MRP");
    return {
      note: `${body.runNo ?? "run"} — ${body.plannedOrderCount ?? "?"} planned order(s), ${body.exceptionCount ?? "?"} exception(s)`,
    };
  });
}

/* ------------------------------------------------------------------- Kaveri */

async function seedKaveri(call) {
  // Kaveri exists so the tenant switch has somewhere to switch TO. An EMPTY second tenant
  // makes the strongest demo moment look like a bug — the audience sees a blank screen and
  // reads "broken", not "fenced". It needs its own recognisable products, so that switching
  // shows DIFFERENT data rather than NO data.
  console.log("\nKAVERI ELECTROFAB INDUSTRIES — Bengaluru (the leak-probe counterpart)");
  const items = [
    { itemCode: "KEF-PNL-40", name: "Control Panel 40A", itemType: "finished_good", uom: "nos", standardCost: 18400 },
    { itemCode: "KEF-BUS-CU", name: "Copper Busbar 40×5", itemType: "raw_material", uom: "kg", standardCost: 810 },
    { itemCode: "KEF-ENC-IP55", name: "Sheet Steel Enclosure IP55", itemType: "component", uom: "nos", standardCost: 4250 },
  ];
  for (const it of items) {
    await step(`item ${it.itemCode} — ${it.name}`, async () => {
      const res = await call("POST", "/api/v1/engineering/items", it, `demo-kef-${it.itemCode}`);
      if (res.status === 409) return SKIPPED;
      const body = expect(res, [200, 201], `create ${it.itemCode}`);
      return { note: body.itemCode ?? it.itemCode };
    });
  }
}

/* ------------------------------------------------- HEXA: the platform console */

/**
 * ADMINISTRATION and INTEGRATION — the control plane and the edge.
 *
 * Everything here goes through the real endpoints for the same reason the rest of this file
 * does, and for one more that is specific to these two modules: their screens exist to show
 * that a control WORKED. A segregation-of-duties finding INSERTed by a migration proves
 * nothing about whether the scanner detects anything; an attestation INSERTed by a migration
 * is a row claiming the audit chain was verified by something that never ran. Seeding those
 * two by hand would fake exactly the evidence the module is sold on.
 *
 * So the SoD findings come from a real scan, and the chain verifications come from the real
 * verifier walking the real chain. If either is wrong, this seeder says so.
 *
 * The failures on the integration side are injected through `simulate`, which is the fake
 * adapter's failure-injection surface and the only honest way to rehearse a portal outage.
 * Note which failures can be produced this way and which cannot: `classifyFailure` treats a
 * timeout as RETRYABLE, so a single dispatch can never dead-letter one. Only the fatal
 * categories — auth, validation and a transform failure — land in the queue on the first
 * attempt. The timeout case is demonstrated on the e-invoice path instead, where it matters
 * most and where Get-before-retry is the actual remedy.
 */
async function seedPlatform(call) {
  console.log("\nPLATFORM — access, evidence, and the edge (HEXA)");

  // ---- 1. Segregation of duties -------------------------------------------
  //
  // 0037 already gives Priya both `buyer` and `purchase_approver`, and Meena both
  // `accountant` and `finance_controller`. The scan is what turns those role assignments
  // into findings a person can act on, and it is idempotent: a second run re-detects the
  // same conflicts and creates nothing.
  await step("scan for segregation-of-duties conflicts", async () => {
    const b = expect(await call("POST", "/api/v1/admin/sod/scan"), [200, 201], "sod scan");
    return { note: b.headline ?? `${b.conflictsFound} conflict(s)` };
  });

  // ---- 2. Webhooks ---------------------------------------------------------
  //
  // The signing secret is returned ONCE, at subscription, and never again — so delivery can
  // only be exercised in the same run that creates the subscription. On a re-run the
  // subscriptions already exist and this whole block is skipped rather than half-repeated.
  const existingSubs = rows(
    expect(await call("GET", "/api/v1/integration/webhooks"), 200, "webhooks"),
  );
  const haveSub = new Set(existingSubs.map((s) => s.subscriberName));

  const secrets = {};
  const subscriptions = [
    {
      subscriberName: "ashvamedha-dealer-portal",
      targetUrl: "https://portal.ashvamedha.example/hooks/xelor",
      eventNames: ["sales.order.confirmed.v1", "sales.dispatch.executed.v1", "accounts.invoice.raised.v1"],
    },
    {
      subscriberName: "finex-tally-bridge",
      targetUrl: "https://bridge.finex.example/xelor/events",
      eventNames: ["accounts.invoice.raised.v1", "accounts.payment.received.v1", "purchase.grn.created.v1"],
    },
  ];

  for (const sub of subscriptions) {
    await step(`subscribe ${sub.subscriberName}`, async () => {
      if (haveSub.has(sub.subscriberName)) return SKIPPED;
      const b = expect(
        await call("POST", "/api/v1/integration/webhooks", sub, `demo-websub-${sub.subscriberName}`),
        [200, 201],
        `subscribe ${sub.subscriberName}`,
      );
      secrets[sub.subscriberName] = b.secret;
      return { note: `${sub.eventNames.length} event(s)` };
    });
  }

  // Three clean deliveries to the dealer portal.
  if (secrets["ashvamedha-dealer-portal"]) {
    for (const eventName of ["sales.order.confirmed.v1", "accounts.invoice.raised.v1", "sales.dispatch.executed.v1"]) {
      await step(`deliver ${eventName} to ashvamedha-dealer-portal`, async () => {
        const b = expect(
          await call("POST", "/api/v1/integration/webhooks/deliver", {
            subscriberName: "ashvamedha-dealer-portal",
            eventName,
            payload: { ref: "demo", at: TODAY },
            secret: secrets["ashvamedha-dealer-portal"],
            simulate: { responseCode: 200 },
          }),
          [200, 201],
          "deliver",
        );
        return { note: b.delivered ? "200" : "not delivered" };
      });
    }

    // Rotate with a long grace so both secrets verify for the whole demo window. A rotation
    // with no grace period is a coordinated outage, which is why nobody performs one.
    await step("rotate the ashvamedha signing secret (30-day grace)", async () => {
      const b = expect(
        await call("POST", "/api/v1/integration/webhooks/ashvamedha-dealer-portal/rotate?graceHours=720"),
        [200, 201],
        "rotate",
      );
      return { note: `both secrets valid until ${String(b.graceUntil).slice(0, 10)}` };
    });
  }

  // The Tally bridge has gone away. Twenty consecutive failures is what trips the auto-pause
  // (`AUTO_PAUSE_AFTER`), and the pause is the point: continuing would be a slow
  // denial-of-service against a customer's server, delivered from ours.
  if (secrets["finex-tally-bridge"]) {
    await step("finex-tally-bridge fails until it auto-pauses", async () => {
      let last = null;
      for (let i = 0; i < 21; i += 1) {
        const res = await call("POST", "/api/v1/integration/webhooks/deliver", {
          subscriberName: "finex-tally-bridge",
          eventName: "accounts.invoice.raised.v1",
          payload: { ref: `demo-${i}` },
          secret: secrets["finex-tally-bridge"],
          simulate: { responseCode: 502 },
        });
        last = expect(res, [200, 201], "deliver (failing)");
        if (last.subscriptionStatus === "auto_paused") break;
      }
      return { note: `status ${last?.subscriptionStatus ?? "unknown"}` };
    });
  }

  // ---- 3. Dead letters -----------------------------------------------------
  //
  // Four failures, four different causes, chosen so the queue shows all three replay
  // verdicts rather than four rows of the same advice:
  //   transform  → refused, fix the mapping first
  //   validation → refused, fix the source document
  //   auth on a STATUTORY flow      → allowed, but demands explicit confirmation
  //   auth on a non-statutory flow  → allowed outright
  const dlqBefore = expect(await call("GET", "/api/v1/integration/dlq?status=new"), 200, "dlq");
  if ((dlqBefore.total ?? 0) > 0) {
    console.log(`  --   dead-letter queue already has ${dlqBefore.total} entr(ies)`);
  } else {
    const failures = [
      {
        label: "punch import fails to transform a dd/mm/yyyy date",
        flowCode: "punch_import",
        correlationId: "cor-punch-2627-0442",
        entityRef: "PUNCH-2026-07-20-GATE1",
        // `PunchDate` is mapped through to_iso_date. The device started exporting
        // dd/mm/yyyy, which produces a valid-looking wrong date for eleven days of
        // every month — so the mapping refuses it rather than guessing.
        payload: { EmpCode: "EMP-TR-0184", PunchDate: "20/07/2026", Direction: "IN", DeviceId: "GATE-1" },
      },
      {
        label: "e-way bill payload rejected by the portal (422)",
        flowCode: "dispatch_to_ewb",
        correlationId: "cor-ewb-2627-0313",
        entityRef: "SHP-2627-0313",
        payload: { shipmentRef: "SHP-2627-0313", distanceKm: 460, consignmentValue: 688400 },
        simulate: { httpStatus: 422, message: "Invalid HSN at line 3" },
      },
      {
        label: "e-invoice credential rejected (401) — statutory flow",
        flowCode: "invoice_to_irn",
        correlationId: "cor-irn-2627-0190",
        entityRef: "INV-2627-0190",
        payload: { invoiceRef: "INV-2627-0190", gstin: TRISHUL_GSTIN_PUNE },
        simulate: { httpStatus: 401, message: "API key rejected" },
      },
      {
        label: "bank drop credential rejected (401) — safe to replay",
        flowCode: "payment_file",
        correlationId: "cor-pay-2627-0031",
        entityRef: "PAYRUN-2627-0031",
        payload: {
          Beneficiary: { Name: "Deccan Forgings Pvt Ltd", IFSC: "SUVB0000412" },
          Amount: 486200,
          State: "MH",
        },
        simulate: { httpStatus: 401, message: "SFTP key rejected" },
      },
    ];

    for (const f of failures) {
      await step(f.label, async () => {
        const { label, ...body } = f;
        const b = expect(
          await call("POST", "/api/v1/integration/messages/dispatch", body),
          [200, 201],
          "dispatch",
        );
        return { note: `${b.status}${b.category ? ` (${b.category})` : ""}` };
      });
    }

    // Replay the one that is genuinely safe, so the queue shows a `retrying` row beside the
    // ones a person still has to look at.
    await step("replay the bank drop (non-statutory, replayable)", async () => {
      const q = expect(await call("GET", "/api/v1/integration/dlq?status=new"), 200, "dlq");
      const entry = (q.entries ?? []).find((e) => e.correlationId === "cor-pay-2627-0031");
      if (!entry) return SKIPPED;
      const b = expect(
        await call("POST", `/api/v1/integration/dlq/${entry.id}/replay`, {}),
        [200, 201],
        "replay",
      );
      return { note: b.status };
    });
  }

  // ---- 4. E-invoices and the 30-day window --------------------------------
  //
  // Dates are relative to NOW rather than to the fixed demo date, because the reporting
  // window is computed against the real clock: pinning them to 20-Jul would make the whole
  // watch screen drift into "blocked" a week later and stay there.
  const fresh = daysAgo(0);
  const aging = daysAgo(28); // two days left of thirty — alert level 3, the escalation case

  const invoices = [
    { invoiceRef: "INV-2627-0201", gstin: TRISHUL_GSTIN_PUNE, buyerGstin: "29AABCK9012M1Z3", shipToGstin: "29AABCK9012M1Z3", docDate: fresh, taxableValue: 1284500, totalValue: 1515710, ok: true },
    { invoiceRef: "INV-2627-0202", gstin: "33AABCT1234F1Z9", buyerGstin: "24AAACG7788L1ZB", shipToGstin: "24AAACG7788L1ZB", docDate: fresh, taxableValue: 486200, totalValue: 573716, ok: true },
    // Times out. NOT resubmitted — the next step is a Get-by-document, because a blind
    // retry is how one invoice becomes two filings that a regulator can see.
    { invoiceRef: "INV-2627-0188", gstin: TRISHUL_GSTIN_PUNE, buyerGstin: "29AABCK9012M1Z3", docDate: daysAgo(2), taxableValue: 942000, totalValue: 1111560, ok: false },
    { invoiceRef: "INV-2627-0151", gstin: TRISHUL_GSTIN_PUNE, buyerGstin: "24AAACG7788L1ZB", docDate: aging, taxableValue: 218400, totalValue: 257712, ok: false },
  ];

  for (const inv of invoices) {
    await step(`e-invoice ${inv.invoiceRef} (${inv.ok ? "reported" : "times out"})`, async () => {
      const { ok: shouldSucceed, ...doc } = inv;
      const b = expect(
        await call("POST", "/api/v1/integration/einvoice/submit", {
          ...doc,
          docType: "INV",
          fy: fyOf(inv.docDate),
          // Above the ₹10 crore turnover threshold, so the 30-day window applies.
          aato: 150_000_000,
          ...(shouldSucceed ? {} : { simulate: { timedOut: true } }),
        }),
        [200, 201],
        `submit ${inv.invoiceRef}`,
      );
      return { note: b.status === "generated" ? "IRN generated" : `${b.status}` };
    });
  }

  // The Get-before-retry step, on the document that timed out. This is the lesson the whole
  // statutory pipeline is built around: the portal DID have it, and a blind resubmit would
  // have produced a second filing that cannot be withdrawn.
  await step("recover INV-2627-0188 by fetching it rather than resubmitting", async () => {
    const b = expect(
      await call("POST", "/api/v1/integration/einvoice/INV-2627-0188/fetch"),
      [200, 201],
      "fetch by document",
    );
    return { note: b.recoveredByGet ? "recovered by GET, no duplicate filing" : String(b.status) };
  });

  // ---- 5. E-way bills ------------------------------------------------------
  const existingEwb = rows(
    expect(await call("GET", "/api/v1/integration/ewaybill"), 200, "ewaybills"),
  );
  const haveEwb = new Set(existingEwb.map((e) => e.shipmentRef));

  const bills = [
    {
      shipmentRef: "SHP-2627-0311",
      invoiceRef: "INV-2627-0201",
      consignmentValue: 1515710,
      distanceKm: 840,
      vehicleNo: "MH14GH2231",
      transporterGstin: "27AACFT5566H1ZP",
      shipToGstin: "29AABCK9012M1Z3",
      billToState: "27",
      shipToState: "29",
    },
    {
      // The primary portal is down. A truck at a gate cannot wait for it, so this one fails
      // over to the secondary — and it must be closed there too, which is the fact the
      // `portalUsed` column exists to keep.
      shipmentRef: "SHP-2627-0312",
      invoiceRef: "INV-2627-0202",
      consignmentValue: 573716,
      distanceKm: 1850,
      vehicleNo: "TN38AR7742",
      transporterGstin: "33AAFCT9911K1ZQ",
      shipToGstin: "24AAACG7788L1ZB",
      billToState: "33",
      shipToState: "24",
      portalHealth: { ewb1Healthy: false, ewb2Healthy: true },
    },
    {
      shipmentRef: "SHP-2627-0298",
      consignmentValue: 342800,
      distanceKm: 310,
      vehicleNo: "MH12QR8890",
      transporterGstin: "27AACFT5566H1ZP",
      billToState: "27",
      shipToState: "27",
    },
  ];

  for (const ewb of bills) {
    await step(`e-way bill ${ewb.shipmentRef}`, async () => {
      if (haveEwb.has(ewb.shipmentRef)) return SKIPPED;
      const b = expect(
        await call("POST", "/api/v1/integration/ewaybill/generate", ewb),
        [200, 201],
        `generate ${ewb.shipmentRef}`,
      );
      return { note: `${b.portalUsed}${b.failedOver ? " (failed over)" : ""}, ${b.daysValid}d validity` };
    });
  }

  await step("close SHP-2627-0298 on the portal that issued it", async () => {
    const res = await call("POST", "/api/v1/integration/ewaybill/SHP-2627-0298/close", {
      remarks: "Delivered at Nashik stores; gate entry 4471.",
    });
    if (res.status === 409) return SKIPPED;
    const b = expect(res, [200, 201], "close ewb");
    return { note: b.replay ? "already closed" : `closed on ${b.portalUsed}` };
  });

  // ---- 6. The evidence -----------------------------------------------------
  //
  // Last, deliberately: the verification covers everything this seeder just did. It is the
  // real verifier re-walking the real chain, so if any write above broke the chain, this
  // step reports it rather than a migration quietly asserting otherwise.
  const priorVerifications = rows(
    expect(await call("GET", "/api/v1/admin/audit/verifications"), 200, "verifications"),
  );
  if (priorVerifications.length >= 3) {
    console.log(`  --   ${priorVerifications.length} chain verification(s) already recorded`);
  } else {
    for (const chain of ["audit_log", "ai_action_log"]) {
      await step(`verify the ${chain} hash chain`, async () => {
        const b = expect(
          await call("POST", `/api/v1/admin/audit/verify?chain=${chain}`),
          [200, 201],
          `verify ${chain}`,
        );
        if (b.intact === false) {
          throw new Error(`${chain} is BROKEN at ${b.firstBreakSeq} (${b.breakKind}): ${b.message}`);
        }
        return { note: b.message };
      });
    }
    await step("anchor the audit chain", async () => {
      const b = expect(await call("POST", "/api/v1/admin/audit/anchor"), [200, 201], "anchor");
      return { note: b.anchored ? `anchored up to seq ${b.uptoSeq}` : String(b.reason) };
    });
  }
}

/* --------------------------------------------------------------------- main */

async function main() {
  console.log("Seeding the §7 demo universe through the API — every document via a real request.\n");

  const trishul = makeClient(await token("venkat"));
  // The stores in-charge is not decoration: `po_approval` step 1 is HERS, and venkat
  // cannot sign it. Two roles, two people, two signatures — the way the plant runs.
  const storesInCharge = makeClient(await token("poongodi"));
  const kaveri = makeClient(await token("kaveri-admin"));
  console.log("  tokens: venkat@trishul (admin), poongodi@trishul (stores in-charge), kaveri-admin@kaveri (admin)");

  await seedTrishul(trishul, storesInCharge);
  // The platform console runs LAST for Trishul, so its chain verification covers every
  // document the steps above created rather than attesting to a half-built world.
  await seedPlatform(trishul);
  await seedKaveri(kaveri);

  // The point of the whole exercise: readable, consecutive, year-qualified numbers.
  const line = (label, values) =>
    values.filter(Boolean).length ? [`${label} : ${values.filter(Boolean).join("  ")}`] : [];
  finish([
    ...line("sales orders", created.orders.map((o) => o.soNo)),
    ...line("purchase    ", created.pos.map((p) => p.poNo)),
    ...line("receipts    ", created.grns.map((g) => g.grnNo)),
    ...line("production  ", created.mos.map((m) => m.orderNo)),
    ...line("dispatch    ", created.dispatches.map((d) => d.dispatchNo)),
  ]);
}

main().catch((e) => {
  console.error("\nseeder aborted:", e.message);
  process.exit(2);
});
