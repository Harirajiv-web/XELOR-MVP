/** Integrated procurement acceptance story. Uses real APIs and fake .invalid recipients;
 * run ONLY against the isolated demo with NOTIFY_PROVIDER=preview. */
import {
  makeClient,
  token,
  expect,
  rows,
  step,
  finish,
  API,
} from "../shared/demo-client.mjs";
const date = (days) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const run = process.env.DEMO_TENDER_RUN_ID ?? date(0);
const key = (name) => `tender-story-${run}-${name}`;
const root = "/api/v1/purchase/network/tenders";
async function main() {
  const admin = makeClient(await token("venkat"));
  const buyer = makeClient(await token("spar.supply"));
  const items = rows(
    expect(
      await admin("GET", "/api/v1/engineering/items?limit=100"),
      200,
      "items",
    ),
  );
  const vendors = rows(
    expect(
      await admin("GET", "/api/v1/purchase/vendors?limit=100"),
      200,
      "vendors",
    ),
  );
  if (items.length < 2 || vendors.length < 2)
    throw new Error("Run base-world seeder first.");
  const parts = [
    items.find((i) => i.itemCode === "CMP-CAS50") ?? items[0],
    items.find((i) => i.itemCode === "CMP-IMP6") ?? items[1],
  ];
  const title = `Integrated pump procurement · ${run}`;
  const existing = rows(expect(await admin("GET", root), 200, "tenders")).find(
    (t) => t.title === title && t.status === "awarded",
  );
  if (existing) {
    const tender = expect(
      await admin("GET", `${root}/${existing.id}`),
      200,
      "existing tender",
    );
    if (
      tender.lines.length !== 2 ||
      tender.lines.some((l) => !l.rfq.award?.convertedPoId)
    )
      throw new Error("Incomplete prior tender story.");
    await step(
      "tender story is already awarded; replay leaves two linked POs",
      async () => ({ note: tender.tenderNo }),
    );
    finish();
  }
  const tender = await step(
    "create two-line tender with ordinary RFQs",
    async () => {
      const value = expect(
        await buyer(
          "POST",
          root,
          {
            title,
            quoteDeadline: date(7),
            needDate: date(30),
            deliveryPlant: "Pune",
            vendorIds: [vendors[0].id],
            notes:
              "Released drawing, traceable certificates, human technical approval before award.",
            lines: parts.map((p) => ({
              itemId: p.id,
              qty: 100,
              uom: "nos",
              drawingRev: "REV-C",
            })),
          },
          key("create"),
        ),
        [200, 201],
        "create tender",
      );
      if (value.lines.length !== 2) throw new Error("Expected two RFQs.");
      return { value, note: value.tenderNo };
    },
  );
  if (!tender) return finish();
  await step("publish tender", async () => ({
    value: expect(
      await buyer("POST", `${root}/${tender.id}/publish`, {}, key("publish")),
      [200, 201],
      "publish",
    ),
  }));
  const goodQuotes = [];
  for (const [index, line] of tender.lines.entries()) {
    const result = await step(
      `receive and technically approve line ${index + 1}`,
      async () => {
        const view = expect(
          await buyer(
            "POST",
            `/api/v1/purchase/rfqs/${line.rfqId}/quotes`,
            {
              vendorId: vendors[0].id,
              unitPrice: 100 + index * 20,
              freightCost: 500,
              promisedDate: date(20),
              validUntil: date(14),
              moq: 50,
            },
            key(`quote-${index}`),
          ),
          [200, 201],
          "quote",
        );
        const quote = view.quotes.find(
          (q) => q.vendorId === vendors[0].id && q.status === "submitted",
        );
        expect(
          await buyer(
            "POST",
            `/api/v1/purchase/rfqs/${line.rfqId}/quotes/${quote.id}/gate`,
            {
              gate: "pass",
              note: "Released drawing and certification reviewed.",
            },
            key(`gate-${index}`),
          ),
          [200, 201],
          "gate",
        );
        return {
          value: {
            rfqId: line.rfqId,
            quoteId: quote.id,
            awardReason:
              "Meets specification and need date at verified landed cost.",
          },
        };
      },
    );
    if (result) goodQuotes.push(result);
  }
  const supplier = await step(
    "link a network-only invitation to an approved vendor",
    async () => ({
      value: expect(
        await admin(
          "POST",
          "/api/v1/purchase/network/suppliers",
          {
            supplierCode: `NET-TENDER-${run}`.slice(0, 40),
            name: "Tender response demonstration supplier",
            email: "supplier@example.invalid",
            vendorId: vendors[1].id,
            categories: ["machining"],
            city: "Pune",
          },
          key("supplier"),
        ),
        [200, 201],
        "supplier",
      ),
    }),
  );
  let badQuote;
  if (supplier) {
    await step(
      "broadcast and accept supplier answer through public phone link",
      async () => {
        expect(
          await admin(
            "POST",
            `/api/v1/purchase/network/rfqs/${tender.lines[0].rfqId}/broadcast`,
            { supplierIds: [supplier.id] },
            key("broadcast"),
          ),
          [200, 201],
          "broadcast",
        );
        const outbox = rows(
          expect(
            await admin("GET", "/api/v1/purchase/network/outbox?limit=200"),
            200,
            "outbox",
          ),
        );
        const message = outbox.find(
          (m) =>
            m.recipient === "supplier@example.invalid" &&
            m.template === "rfq_invitation",
        );
        if (!message?.linkUrl) throw new Error("Expected invitation link.");
        if (message.status !== "previewed")
          throw new Error("Demo requires preview notifications.");
        const secret = message.linkUrl.split("/").at(-1);
        const response = await fetch(`${API}/api/v1/supplier/${secret}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitPrice: 70,
            promisedDate: date(45),
            moq: 150,
            supplierNote:
              "Low price, but delivery and MOQ are outside the request.",
          }),
        });
        const body = await response.json();
        if (
          !response.ok &&
          !(response.status === 409 && body?.error?.code === "ALREADY_ANSWERED")
        )
          throw new Error(
            `supplier response ${response.status}: ${JSON.stringify(body)}`,
          );
        const submissions = rows(
          expect(
            await admin(
              "GET",
              `/api/v1/purchase/network/rfqs/${tender.lines[0].rfqId}/submissions`,
            ),
            200,
            "submissions",
          ),
        );
        const submission = submissions.find(
          (s) => s.supplierId === supplier.id,
        );
        const accepted = expect(
          await admin(
            "POST",
            `/api/v1/purchase/network/submissions/${submission.id}/accept`,
            {},
            key("accept-network"),
          ),
          [200, 201],
          "accept submission",
        );
        badQuote = accepted.quoteId;
        expect(
          await buyer(
            "POST",
            `/api/v1/purchase/rfqs/${tender.lines[0].rfqId}/quotes/${badQuote}/gate`,
            {
              gate: "pass",
              note: "Technical drawing fits, commercial terms do not.",
            },
            key("gate-network"),
          ),
          [200, 201],
          "network gate",
        );
        return {
          note: "network vendor was not directly invited; accepted once with MOQ preserved",
        };
      },
    );
  }
  await step("close bidding for evaluation", async () => ({
    value: expect(
      await buyer("POST", `${root}/${tender.id}/close`, {}, key("close")),
      [200, 201],
      "close",
    ),
  }));
  await step("closed tender refuses a new supplier price", async () => {
    const response = await buyer(
      "POST",
      `/api/v1/purchase/rfqs/${tender.lines[0].rfqId}/quotes`,
      { vendorId: vendors[0].id, unitPrice: 80 },
      key("closed-bid"),
    );
    expect(response, 409, "closed bid");
    if (response.body?.error?.code !== "TENDER_BIDDING_CLOSED")
      throw new Error("Wrong rejection reason.");
    return { note: response.body.error.code };
  });
  if (badQuote && goodQuotes.length === 2)
    await step(
      "cheap quote missing need date and MOQ is rejected atomically",
      async () => {
        const awards = goodQuotes.map((q, index) =>
          index === 0 ? { ...q, quoteId: badQuote } : q,
        );
        const response = await admin(
          "POST",
          `${root}/${tender.id}/award`,
          { awards },
          key("bad-award"),
        );
        expect(response, 409, "bad award");
        if (response.body?.error?.code !== "QUOTE_NOT_AWARDABLE")
          throw new Error("Wrong rejection reason.");
        const view = expect(
          await admin("GET", `${root}/${tender.id}`),
          200,
          "verify rollback",
        );
        if (view.lines.some((l) => l.rfq.award))
          throw new Error("Partial award escaped rollback.");
        return { note: "zero lines awarded" };
      },
    );
  if (goodQuotes.length === 2) {
    await step("raiser cannot award their own tender", async () => {
      const response = await buyer(
        "POST",
        `${root}/${tender.id}/award`,
        { awards: goodQuotes },
        key("self-award"),
      );
      expect(response, 403, "self award");
      return { note: response.body?.error?.code };
    });
    await step(
      "two concurrent approvals create exactly two linked purchase orders",
      async () => {
        const responses = await Promise.all([
          admin(
            "POST",
            `${root}/${tender.id}/award`,
            { awards: goodQuotes },
            key("award-a"),
          ),
          admin(
            "POST",
            `${root}/${tender.id}/award`,
            { awards: goodQuotes },
            key("award-b"),
          ),
        ]);
        if (
          responses.filter((r) => r.status === 201).length !== 1 ||
          responses.filter((r) => r.status === 409).length !== 1
        )
          throw new Error(
            `Expected one success and one conflict: ${JSON.stringify(responses)}`,
          );
        const view = expect(
          await admin("GET", `${root}/${tender.id}`),
          200,
          "awarded tender",
        );
        const poIds = view.lines.map((l) => l.rfq.award?.convertedPoId);
        if (
          view.status !== "awarded" ||
          poIds.some((id) => !id) ||
          new Set(poIds).size !== 2
        )
          throw new Error("Expected one PO for each line.");
        for (const id of poIds) {
          const po = expect(
            await admin("GET", `/api/v1/purchase/orders/${id}`),
            200,
            "read linked PO",
          );
          if (po.status !== "draft")
            throw new Error("Award bypassed PO approval.");
          if (Number(po.additionalCharges) !== 500)
            throw new Error("Freight did not reach PO approval value.");
          const lineTotal = po.lines.reduce(
            (sum, line) => sum + Number(line.amount),
            0,
          );
          if (Number(po.totalAmount) !== lineTotal + 500)
            throw new Error("PO commitment total omitted one-off charges.");
        }
        return {
          note: view.lines.map((l) => l.rfq.award.convertedPoNo).join(", "),
        };
      },
    );
  }
  if (supplier)
    await step("supplier score does not invent delivery history", async () => {
      const result = expect(
        await admin(
          "GET",
          `/api/v1/purchase/network/suppliers/${supplier.id}/performance`,
        ),
        200,
        "performance",
      );
      if (!Array.isArray(result.evidence)) throw new Error("Missing evidence.");
      if (!result.deliverySampleSize && result.onTimeRate !== null)
        throw new Error("Unknown delivery history was scored.");
      return { note: `${result.deliverySampleSize} measured delivery samples` };
    });
  finish([`Integrated tender: ${tender.tenderNo}`]);
}
main().catch((error) => {
  console.error(error);
  process.exit(2);
});
