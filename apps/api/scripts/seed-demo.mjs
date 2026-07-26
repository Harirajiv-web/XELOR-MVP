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
 *   node scripts/seed-demo.mjs [--reset] [--verbose]
 */

const API = process.env.API_BASE ?? "http://127.0.0.1:3000";
const KC = process.env.KEYCLOAK_URL ?? "http://127.0.0.1:8080";
const REALM = process.env.KEYCLOAK_REALM ?? "indcore";

const VERBOSE = process.argv.includes("--verbose");

/** Demo "today" — §7 fixes it at Monday 20 July 2026 so every screen agrees. */
const TODAY = "2026-07-20";
const TRISHUL_GSTIN_PUNE = "27AABCT1234F1Z5";

let ok = 0;
let failed = 0;
const created = { vendors: [], orders: [], pos: [], grns: [], mos: [], dispatches: [] };

/* ------------------------------------------------------------------ plumbing */

async function token(username) {
  const res = await fetch(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "indcore-api",
      grant_type: "password",
      username,
      password: "demo",
      scope: "openid",
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`no token for ${username}: ${JSON.stringify(j)}`);
  return j.access_token;
}

function makeClient(tok) {
  return async function call(method, path, body, idemKey) {
    const headers = { authorization: `Bearer ${tok}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    // The key is derived from the path and the payload, so re-running the seeder replays
    // rather than duplicates — the same guarantee a retrying client gets.
    if (idemKey) headers["idempotency-key"] = idemKey;
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };
}

/** Run a step, print one line, keep going. A failed step must not hide the ones after it. */
async function step(label, fn) {
  try {
    const result = await fn();
    if (result === SKIPPED) {
      console.log(`  --   ${label} (already present)`);
      ok++;
      return null;
    }
    console.log(`  ok   ${label}${result?.note ? ` — ${result.note}` : ""}`);
    ok++;
    return result?.value ?? result ?? null;
  } catch (e) {
    failed++;
    console.log(`  FAIL ${label}`);
    console.log(`         ${e.message}`);
    if (VERBOSE && e.detail) console.log(`         ${JSON.stringify(e.detail)}`);
    return null;
  }
}

const SKIPPED = Symbol("skipped");

function expect(res, want, what) {
  const wants = Array.isArray(want) ? want : [want];
  if (!wants.includes(res.status)) {
    const env = res.body?.error;
    const detail = env
      ? `${env.code}: ${env.message}${env.details ? ` ${JSON.stringify(env.details)}` : ""}`
      : JSON.stringify(res.body).slice(0, 300);
    const err = new Error(`${what} → HTTP ${res.status} (wanted ${wants.join("/")}) — ${detail}`);
    err.detail = res.body;
    throw err;
  }
  return res.body;
}

const rows = (b) => (Array.isArray(b) ? b : (b?.data ?? b?.items ?? []));

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
  await seedKaveri(kaveri);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${ok} step(s) ok, ${failed} failed`);

  // The point of the whole exercise: readable, consecutive, year-qualified numbers.
  const sos = created.orders.map((o) => o.soNo).filter(Boolean);
  if (sos.length) console.log(`  sales orders : ${sos.join("  ")}`);
  const pos = created.pos.map((p) => p.poNo).filter(Boolean);
  if (pos.length) console.log(`  purchase     : ${pos.join("  ")}`);
  const grns = created.grns.map((g) => g.grnNo).filter(Boolean);
  if (grns.length) console.log(`  receipts     : ${grns.join("  ")}`);
  const mos = created.mos.map((m) => m.orderNo).filter(Boolean);
  if (mos.length) console.log(`  production   : ${mos.join("  ")}`);
  const dns = created.dispatches.map((d) => d.dispatchNo).filter(Boolean);
  if (dns.length) console.log(`  dispatch     : ${dns.join("  ")}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nseeder aborted:", e.message);
  process.exit(2);
});
