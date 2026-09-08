/**
 * PHASE 4 — the supplier network, seeded as the round trip it actually is.
 *
 * Everything here goes through the real HTTP API, including the supplier's side: the quotes
 * are submitted through the PUBLIC portal endpoint using the token out of the message that
 * was composed for them. So a green run is evidence that a stranger holding a link can
 * genuinely answer, not that a row was inserted.
 *
 * The story is shaped so the ranking has something to say. Three suppliers answer:
 *
 *   the CHEAPEST cannot deliver until well after the material is needed
 *   the MIDDLE one is dearest per piece but lands comfortably early
 *   the THIRD is close on both
 *
 * A ranking that only ever agrees with the lowest price is a ranking nobody needs.
 *
 * Run after `demo:seed`. Idempotency keys are stable, so a re-run replays.
 */
import {
  makeClient,
  token,
  step,
  expect,
  rows,
  finish,
  isoDate,
} from "../shared/demo-client.mjs";

const DAY = 86_400_000;
/** Real-clock relative, because the server checks these against today, not the demo's date. */
const inDays = (n) => isoDate(Date.now() + n * DAY);

const created = { suppliers: [], rfqNo: null, answered: 0 };

const SUPPLIERS = [
  {
    key: "spc",
    supplierCode: "NET-SPC",
    name: "Sundaram Precision Castings",
    categories: ["casting", "machining"],
    city: "Coimbatore",
    contactName: "R. Sundaram",
    whatsappE164: "+919876500011",
    email: "quotes@sundaramcast.example",
    quote: {
      unitPrice: 1920,
      freightCost: 14000,
      promisedDate: inDays(22),
      leadTimeDays: 22,
      supplierNote: "Can start this week. Full material certification included.",
    },
  },
  {
    key: "bfh",
    supplierCode: "NET-BFH",
    name: "Bharat Fasteners & Hardware",
    categories: ["casting", "fasteners"],
    city: "Pune",
    contactName: "A. Bharat",
    whatsappE164: "+919876500022",
    email: "sales@bharatfast.example",
    quote: {
      unitPrice: 1840,
      toolingCost: 18000,
      freightCost: 9000,
      promisedDate: inDays(26),
      leadTimeDays: 26,
      supplierNote: "Offering equivalent SS316L grade; tooling is a one-off charge.",
    },
  },
  {
    key: "dsg",
    supplierCode: "NET-DSG",
    name: "Deccan Seals & Gaskets",
    categories: ["casting", "seals"],
    city: "Hyderabad",
    contactName: "K. Deccan",
    whatsappE164: "+919876500033",
    quote: {
      unitPrice: 1710,
      freightCost: 7500,
      promisedDate: inDays(52),
      leadTimeDays: 52,
      supplierNote: "Lowest price we can do, but our furnace is booked until then.",
    },
  },
];

async function main() {
  console.log("Seeding the supplier network — a request goes out, three answers come back.\n");

  const buyer = makeClient(await token("venkat"));
  console.log("  tokens: venkat@3S (admin)");

  console.log("\nSPAR / Network — who this factory can ask");
  for (const s of SUPPLIERS) {
    await step(`add ${s.name} (${s.city})`, async () => {
      const { quote: _quote, key: _key, ...body } = s;
      const res = await buyer("POST", "/api/v1/purchase/network/suppliers", body, `net-sup-${s.key}`);
      const out = expect(res, [200, 201], `add ${s.supplierCode}`);
      created.suppliers.push({ ...s, id: out.id });
      const reach = [s.whatsappE164 && "WhatsApp", s.email && "email"].filter(Boolean).join(" + ");
      return { note: `reachable by ${reach}` };
    });
  }

  // A fresh request, because a request that has already been awarded cannot be published.
  const items = rows(expect(await buyer("GET", "/api/v1/engineering/items?limit=100"), 200, "items"));
  const vendors = rows(expect(await buyer("GET", "/api/v1/purchase/vendors?limit=50"), 200, "vendors"));
  const casting = items.find((i) => i.itemCode === "CMP-CAS50");
  if (!casting) throw new Error("base world missing CMP-CAS50 — run demo:seed first");

  console.log("\nSPAR / Sourcing — the request that goes out");
  const rfq = await step("300 CP-50 casings needed — raise the request", async () => {
    const res = await buyer(
      "POST",
      "/api/v1/purchase/rfqs",
      {
        title: "CP-50 casing body — 300 off, sourced through the network",
        itemId: casting.id,
        qty: 300,
        uom: "nos",
        drawingRev: "CAS50-D-REV-C",
        needDate: inDays(40),
        quoteDeadline: inDays(10),
        deliveryPlant: "Pune",
        originRef: "MRP shortage · Q3 pump build",
        notes: "SS316 investment casting, machined datum face. Certificate of conformity required.",
        // One known vendor is invited directly; the network reaches the rest.
        vendorIds: [vendors[0].id],
      },
      "net-rfq-cas",
    );
    const body = expect(res, [200, 201], "raise RFQ");
    created.rfqNo = body.rfqNo;
    return { note: body.rfqNo, value: body };
  });
  if (!rfq) return finish([]);

  await step("issue it", async () => {
    const res = await buyer("POST", `/api/v1/purchase/rfqs/${rfq.id}/issue`, {}, "net-rfq-issue");
    return { note: expect(res, [200, 201], "issue").status };
  });

  const broadcast = await step(
    "publish it to every casting supplier on the network",
    async () => {
      const res = await buyer(
        "POST",
        `/api/v1/purchase/network/rfqs/${rfq.id}/broadcast`,
        { category: "casting" },
        "net-broadcast",
      );
      const body = expect(res, [200, 201], "broadcast");
      return {
        note: `${body.invited} suppliers · ${body.messages} messages composed`,
        value: body,
      };
    },
  );
  if (!broadcast) return finish([]);

  // The tokens are read back out of the messages, exactly as a supplier would get them.
  const outbox = rows(
    expect(await buyer("GET", "/api/v1/purchase/network/outbox?limit=50"), 200, "outbox"),
  );
  const invites = outbox.filter((m) => m.template === "rfq_invitation" && m.channel === "whatsapp");

  console.log("\nThe suppliers answer — through the public link, with no account");
  for (const s of created.suppliers) {
    const msg = invites.find((m) => m.recipientName === s.name);
    if (!msg?.linkUrl) continue;
    const tok = msg.linkUrl.slice(msg.linkUrl.lastIndexOf("/") + 1);

    await step(`${s.name} opens the link`, async () => {
      const res = await fetch(`${process.env.API_BASE ?? "http://localhost:4300"}/api/v1/supplier/${tok}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      return { note: `sees ${body.card?.rfqNo} · ${body.card?.itemLabel ?? ""}`.slice(0, 90) };
    });

    await step(`${s.name} sends a price`, async () => {
      const res = await fetch(
        `${process.env.API_BASE ?? "http://localhost:4300"}/api/v1/supplier/${tok}/quote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(s.quote),
        },
      );
      const body = await res.json();
      // A repeat run replays into the "already answered" refusal, which is the correct
      // outcome rather than a failure — one invitation, one answer.
      if (res.status === 409 && body?.error?.code === "ALREADY_ANSWERED") return { note: "already answered (replay)" };
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      created.answered += 1;
      return { note: `landed ₹${body.landedCost} · promised ${s.quote.promisedDate}` };
    });
  }

  console.log("\nThe ranking — soon enough, and cheap");
  await step("order the answers and explain the order", async () => {
    const res = await buyer("GET", `/api/v1/purchase/network/rfqs/${rfq.id}/ranking`);
    const body = expect(res, 200, "ranking");
    for (const q of body.quotes) {
      const flag = q.disqualified ? "  UNUSABLE" : "";
      console.log(`         #${q.rank} ${q.supplierName} — ₹${q.landedCost}${flag}`);
      console.log(`             ${q.explanation}`);
    }
    const top = body.quotes[0];
    const cheapest = [...body.quotes].sort((a, b) => Number(a.landedCost) - Number(b.landedCost))[0];
    if (top && cheapest && top.submissionId === cheapest.submissionId) {
      // Not a failure — just worth noticing, because the demo's whole point is the case
      // where they differ.
      return { note: "the cheapest answer also ranked first this time" };
    }
    return { note: `ranked first is NOT the cheapest — ${top?.supplierName} over ${cheapest?.supplierName}` };
  });

  finish([
    `suppliers   : ${created.suppliers.map((s) => s.supplierCode).join("  ")}`,
    `request     : ${created.rfqNo}`,
    `answers     : ${created.answered} received through the public portal`,
  ]);
}

main().catch((e) => {
  console.error("\nseeder aborted:", e.message);
  process.exit(2);
});
