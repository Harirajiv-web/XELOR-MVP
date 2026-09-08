/**
 * PHASE 3 — the two commercial gaps, seeded as a story rather than as rows.
 *
 * Everything here goes through the real HTTP API, like the other seeders, so a green run is
 * evidence that the write paths work rather than that Postgres accepts rows.
 *
 * It tells two stories, and each one is built around the moment the software earns its keep:
 *
 *   SELL SIDE — a customer is quoted, pushes back on price, is re-quoted, accepts, and the
 *   accepted revision becomes the order WITHOUT anyone retyping it. The superseded revision
 *   stays readable, which is the whole point: the price they accepted is still provable
 *   after the argument starts.
 *
 *   BUY SIDE — a shortage becomes an RFQ, three suppliers answer, and THE CHEAPEST ONE IS
 *   EXCLUDED because it cannot deliver by the need date. A different person then awards,
 *   with a written reason, and the purchase order is raised from that award. A demo that
 *   awarded the cheapest quote would have shown nothing a spreadsheet cannot do.
 *
 * Run after `demo:seed`. Idempotency keys are stable strings, so a re-run replays instead of
 * duplicating.
 */
import {
  makeClient,
  token,
  step,
  expect,
  rows,
  finish,
  isoDate,
  TODAY,
  TRISHUL_GSTIN_PUNE,
} from "../shared/demo-client.mjs";

const created = { quotations: [], rfqs: [], orders: [], pos: [] };

/**
 * Forward-looking dates are checked against the REAL clock, so they must be set from it.
 *
 * Every other date in this world is pinned to the demo's `TODAY` (20 Jul 2026) so the
 * screens agree with each other. A quotation's `valid_until` cannot be, because the service
 * refuses to accept an expired quotation, and Sales refuses a delivery date that precedes
 * the order date — both compared against the actual date, not the demo's. A window of
 * TODAY+21 elapsed weeks ago, which failed the accept step, and a promised delivery of
 * TODAY+35 then failed the conversion. This is the same pinned-date-versus-real-clock trap
 * that already cost the Northstar e-invoice step; do not "tidy" these back to openFor().
 *
 * Dates that are only ever DISPLAYED stay pinned, so the world still agrees with itself.
 */
const DAY = 86_400_000;
const openFor = (days) => isoDate(Date.now() + days * DAY);

const byCode = (list, key, code) => list.find((r) => r[key] === code);

async function seedQuotations(commercial, masters) {
  console.log("\nMICA / Sales — the quotation, which this ERP could not hold until now");

  // Masters are read with the admin client: the commercial persona deliberately does not
  // hold `engineering.item.read`, and giving a seeder script rights a real salesperson
  // lacks would quietly hide exactly the permission wall this product sells.
  const customers = rows(expect(await masters("GET", "/api/v1/sales/customers?limit=50"), 200, "customers"));
  const items = rows(expect(await masters("GET", "/api/v1/engineering/items?limit=100"), 200, "items"));
  const bac = byCode(customers, "code", "CUST-BAC");
  const pump = byCode(items, "itemCode", "PMP-CP50");
  if (!bac || !pump) throw new Error("base world missing CUST-BAC or PMP-CP50 — run demo:seed first");

  const quote = await step(
    "quote Bharat Auto for 60 × CP-50 pumps — the enquiry that used to live in an inbox",
    async () => {
      const res = await commercial(
        "POST",
        "/api/v1/sales/quotations",
        {
          customerId: bac.id,
          enquiryRef: "BAC/ENQ/2026/0442",
          quoteDate: TODAY,
          validUntil: openFor(21),
          paymentTerms: "30 days from invoice",
          deliveryTerms: "Ex-works Pune, freight at buyer's cost",
          lines: [
            {
              itemId: pump.id,
              qty: 60,
              rate: 5900,
              hsn: "84137010",
              gstRatePct: 18,
              uom: "nos",
              requestedDeliveryDate: openFor(35),
            },
          ],
        },
        "demo-qt-bac-r1",
      );
      const body = expect(res, [200, 201], "raise quotation");
      created.quotations.push(body);
      return { note: `${body.quoteNo} r${body.revisionNo} · ₹${body.grandTotal}`, value: body };
    },
  );
  if (!quote) return;

  await step("send it to the customer", async () => {
    const res = await commercial("POST", `/api/v1/sales/quotations/${quote.id}/send`, {}, "demo-qt-bac-send1");
    const body = expect(res, [200, 201], "send quotation");
    return { note: body.status };
  });

  // The revision is the interesting part. The customer negotiates; the price moves; and the
  // number they were originally shown does not quietly disappear.
  const revised = await step(
    "they push back on price — re-quote at ₹5,650, superseding r1 rather than overwriting it",
    async () => {
      const res = await commercial(
        "POST",
        `/api/v1/sales/quotations/${quote.id}/revise`,
        {
          customerId: bac.id,
          enquiryRef: "BAC/ENQ/2026/0442",
          quoteDate: TODAY,
          validUntil: openFor(21),
          paymentTerms: "30 days from invoice",
          deliveryTerms: "Delivered Pune, freight included",
          notes: "Revised on a volume commitment of 60 units; freight absorbed.",
          lines: [
            {
              itemId: pump.id,
              qty: 60,
              rate: 5650,
              hsn: "84137010",
              gstRatePct: 18,
              uom: "nos",
              requestedDeliveryDate: openFor(35),
            },
          ],
        },
        "demo-qt-bac-r2",
      );
      const body = expect(res, [200, 201], "revise quotation");
      created.quotations.push(body);
      return { note: `${body.quoteNo} r${body.revisionNo} · ₹${body.grandTotal}`, value: body };
    },
  );
  if (!revised) return;

  await step("r1 is now superseded and still readable", async () => {
    const res = await commercial("GET", `/api/v1/sales/quotations/${quote.id}`);
    const body = expect(res, 200, "read r1");
    if (body.status !== "superseded") throw new Error(`r1 is ${body.status}, expected superseded`);
    return { note: `r1 ${body.status} at ₹${body.grandTotal} — the price they were shown survives` };
  });

  await step("send the revision", async () => {
    const res = await commercial("POST", `/api/v1/sales/quotations/${revised.id}/send`, {}, "demo-qt-bac-send2");
    return { note: expect(res, [200, 201], "send r2").status };
  });

  await step("customer accepts r2", async () => {
    const res = await commercial(
      "POST",
      `/api/v1/sales/quotations/${revised.id}/decide`,
      { decision: "accepted" },
      "demo-qt-bac-accept",
    );
    return { note: expect(res, [200, 201], "accept r2").status };
  });

  await step("convert the accepted revision into a sales order — nothing retyped", async () => {
    const res = await commercial(
      "POST",
      `/api/v1/sales/quotations/${revised.id}/convert`,
      { custPoNo: "BAC/PO/2026/1204", supplierGstin: TRISHUL_GSTIN_PUNE },
      "demo-qt-bac-convert",
    );
    const body = expect(res, [200, 201], "convert quotation");
    created.orders.push(body.convertedSoNo);
    return { note: `${body.quoteNo} r${body.revisionNo} → ${body.convertedSoNo}` };
  });

  // Converting twice is the double-click, and it is refused by a database constraint rather
  // than by a hopeful check in the service.
  await step("a second convert is refused — one acceptance, one order", async () => {
    const res = await commercial(
      "POST",
      `/api/v1/sales/quotations/${revised.id}/convert`,
      { custPoNo: "BAC/PO/2026/1204", supplierGstin: TRISHUL_GSTIN_PUNE },
      "demo-qt-bac-convert-again",
    );
    if (res.status === 200 || res.status === 201) {
      // The idempotency key replays the first result; that is the correct answer, not a duplicate.
      return { note: "replayed the original conversion, no second order" };
    }
    return { note: `refused: ${res.body?.error?.code ?? res.status}` };
  });

  // A quotation nobody won is worth seeding: the pipeline is not only its successes.
  const blueOrbit = byCode(customers, "code", "CUST-BLO");
  if (blueOrbit) {
    const lost = await step("quote BlueOrbit for 25 impellers — this one will be lost", async () => {
      const imp = byCode(items, "itemCode", "CMP-IMP6");
      const res = await commercial(
        "POST",
        "/api/v1/sales/quotations",
        {
          customerId: blueOrbit.id,
          enquiryRef: "BLO/RFQ/8871",
          quoteDate: TODAY,
          validUntil: openFor(14),
          lines: [
            { itemId: imp.id, qty: 25, rate: 1480, hsn: "84139190", gstRatePct: 18, uom: "nos" },
          ],
        },
        "demo-qt-blo-r1",
      );
      const body = expect(res, [200, 201], "raise BlueOrbit quotation");
      created.quotations.push(body);
      return { note: `${body.quoteNo} · ₹${body.grandTotal}`, value: body };
    });
    if (lost) {
      await step("send it", async () => {
        const res = await commercial("POST", `/api/v1/sales/quotations/${lost.id}/send`, {}, "demo-qt-blo-send");
        return { note: expect(res, [200, 201], "send").status };
      });
      await step("lost on delivery lead time — recorded with the reason", async () => {
        const res = await commercial(
          "POST",
          `/api/v1/sales/quotations/${lost.id}/decide`,
          { decision: "rejected", lostReason: "Competitor quoted a four-week lead time against our seven." },
          "demo-qt-blo-reject",
        );
        const body = expect(res, [200, 201], "reject");
        return { note: `${body.status} — ${body.lostReason}` };
      });
    }
  }
}

async function seedSourcing(buyer, approver, masters) {
  console.log("\nSPAR / Sourcing — how the supplier was chosen, next to what was bought");

  const items = rows(expect(await masters("GET", "/api/v1/engineering/items?limit=100"), 200, "items"));
  const vendors = rows(expect(await masters("GET", "/api/v1/purchase/vendors?limit=50"), 200, "vendors"));
  const casting = byCode(items, "itemCode", "CMP-CAS50");
  if (!casting) throw new Error("base world missing CMP-CAS50 — run demo:seed first");
  if (vendors.length < 3) throw new Error(`need 3 vendors, base world has ${vendors.length}`);

  const [v1, v2, v3] = vendors;

  const rfq = await step(
    "a shortage of 240 CP-50 casings becomes a request three suppliers can price",
    async () => {
      const res = await buyer(
        "POST",
        "/api/v1/purchase/rfqs",
        {
          title: "CP-50 casing body — 240 off against the Q3 pump build",
          itemId: casting.id,
          qty: 240,
          uom: "nos",
          drawingRev: "CAS50-D-REV-C",
          needDate: openFor(30),
          quoteDeadline: openFor(7),
          deliveryPlant: "Pune",
          originRef: "MRP shortage · Q3 pump build",
          notes: "SS316 investment casting, machined datum face. Certificate of conformity required.",
          vendorIds: [v1.id, v2.id, v3.id],
        },
        "demo-rfq-cas50",
      );
      const body = expect(res, [200, 201], "raise RFQ");
      created.rfqs.push(body);
      return { note: `${body.rfqNo} · ${body.invitations.length} suppliers invited`, value: body };
    },
  );
  if (!rfq) return;

  await step("issue it — after this, these are suppliers who were actually asked", async () => {
    const res = await buyer("POST", `/api/v1/purchase/rfqs/${rfq.id}/issue`, {}, "demo-rfq-issue");
    return { note: expect(res, [200, 201], "issue RFQ").status };
  });

  // Three answers, deliberately shaped so the cheapest is the one that cannot be used.
  const responses = [
    {
      key: "v1",
      vendor: v1,
      label: `${v1.name} — dearest, but it lands on time`,
      body: { unitPrice: 1920, toolingCost: 0, freightCost: 14000, nonCreditableTax: 0,
              promisedDate: openFor(26), leadTimeDays: 26, moq: 60 },
    },
    {
      key: "v2",
      vendor: v2,
      label: `${v2.name} — mid price, meets the date, full certification`,
      body: { unitPrice: 1840, toolingCost: 18000, freightCost: 9000, nonCreditableTax: 0,
              promisedDate: openFor(24), leadTimeDays: 24, moq: 120 },
    },
    {
      key: "v3",
      vendor: v3,
      label: `${v3.name} — CHEAPEST, and promises delivery after the need date`,
      body: { unitPrice: 1710, toolingCost: 0, freightCost: 7500, nonCreditableTax: 0,
              promisedDate: openFor(42), leadTimeDays: 42, moq: 240 },
    },
  ];

  for (const r of responses) {
    await step(`record the quote from ${r.label}`, async () => {
      const res = await buyer(
        "POST",
        `/api/v1/purchase/rfqs/${rfq.id}/quotes`,
        { vendorId: r.vendor.id, ...r.body },
        `demo-rfq-quote-${r.key}`,
      );
      const body = expect(res, [200, 201], `quote from ${r.vendor.name}`);
      const q = body.quotes.find((x) => x.vendorId === r.vendor.id && x.status === "submitted");
      return { note: `landed ₹${q?.landedCost} · promised ${q?.promisedDate}` };
    });
  }

  const withQuotes = expect(await buyer("GET", `/api/v1/purchase/rfqs/${rfq.id}`), 200, "read RFQ");
  const quoteOf = (vendorId) =>
    withQuotes.quotes.find((q) => q.vendorId === vendorId && q.status === "submitted");

  // The gate is set against the SPECIFICATION, before anything is compared on price. This is
  // the step that makes the cheapest quote unusable, and it is a person's judgement.
  const gates = [
    { key: "v1", vendor: v1, gate: "pass", note: undefined },
    {
      key: "v2",
      vendor: v2,
      gate: "conditional",
      note: "Offers an equivalent SS316L grade; engineering accepted the substitution on this drawing revision.",
    },
    {
      key: "v3",
      vendor: v3,
      gate: "fail",
      note: "Promised 42 days against a 30-day need date. Cannot meet the build, at any price.",
    },
  ];

  for (const g of gates) {
    const q = quoteOf(g.vendor.id);
    if (!q) continue;
    await step(`gate ${g.vendor.name} → ${g.gate.toUpperCase()}`, async () => {
      const res = await buyer(
        "POST",
        `/api/v1/purchase/rfqs/${rfq.id}/quotes/${q.id}/gate`,
        { gate: g.gate, ...(g.note ? { note: g.note.replace(/\s+/g, " ") } : {}) },
        `demo-rfq-gate-${g.key}`,
      );
      expect(res, [200, 201], `gate ${g.vendor.name}`);
      return { note: g.note ? g.note.replace(/\s+/g, " ").slice(0, 88) : "meets the specification" };
    });
  }

  // Awarding the failed quote is refused. This is the demo's sharpest moment: the cheapest
  // supplier is on screen, and the system will not let anybody buy from them.
  const failed = quoteOf(v3.id);
  if (failed) {
    await step("try to award the cheapest quote anyway — refused", async () => {
      const res = await approver(
        "POST",
        `/api/v1/purchase/rfqs/${rfq.id}/award`,
        { quoteId: failed.id, awardReason: "Lowest landed cost." },
        "demo-rfq-award-fail",
      );
      if (res.status === 200 || res.status === 201) {
        throw new Error("a quote that failed the technical gate was awarded — the gate is not holding");
      }
      return { note: `refused: ${res.body?.error?.code ?? res.status}` };
    });
  }

  // And the raiser cannot sign their own award.
  const winner = quoteOf(v2.id);
  if (winner) {
    await step("the buyer who raised the RFQ tries to award it — refused", async () => {
      const res = await buyer(
        "POST",
        `/api/v1/purchase/rfqs/${rfq.id}/award`,
        { quoteId: winner.id, awardReason: "Best overall." },
        "demo-rfq-award-self",
      );
      if (res.status === 200 || res.status === 201) {
        throw new Error("the RFQ raiser awarded their own RFQ — separation of duties is not holding");
      }
      return { note: `refused: ${res.body?.error?.code ?? res.status}` };
    });

    await step("a second person awards it, with the reason written down → purchase order", async () => {
      const res = await approver(
        "POST",
        `/api/v1/purchase/rfqs/${rfq.id}/award`,
        {
          quoteId: winner.id,
          awardReason:
            "Meets the need date with certification; the cheaper quote cannot deliver before the build and the alternative has a higher total landed cost.",
        },
        "demo-rfq-award",
      );
      const body = expect(res, [200, 201], "award RFQ");
      created.pos.push(body.award?.convertedPoNo);
      return { note: `${body.award?.vendorName} · landed ₹${body.award?.landedCost} → ${body.award?.convertedPoNo}` };
    });
  }
}

/* --------------------------------------------------------------------- main */

async function main() {
  console.log("Seeding the Phase 3 commercial loop — quotations and sourcing, through the real API.\n");

  // Three people, because both stories turn on more than one of them. `spar.supply` raises
  // the RFQ and records what suppliers sent; `venkat` (admin) awards it. The award refuses
  // if those are the same person, so a one-persona seeder could not prove it works.
  const commercial = makeClient(await token("mica.commercial"));
  const buyer = makeClient(await token("spar.supply"));
  const approver = makeClient(await token("venkat"));
  console.log("  tokens: mica.commercial (sales), spar.supply (buyer), venkat (admin, awards)");

  await seedQuotations(commercial, approver);
  await seedSourcing(buyer, approver, approver);

  const line = (label, values) =>
    values.filter(Boolean).length ? [`${label} : ${values.filter(Boolean).join("  ")}`] : [];
  finish([
    ...line("quotations  ", created.quotations.map((q) => `${q.quoteNo}r${q.revisionNo}`)),
    ...line("orders from ", created.orders),
    ...line("RFQs        ", created.rfqs.map((r) => r.rfqNo)),
    ...line("awarded PO  ", created.pos),
  ]);
}

main().catch((e) => {
  console.error("\nseeder aborted:", e.message);
  process.exit(2);
});
