import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function items(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data as unknown[];
  if (!isRecord(data)) return null;
  return Array.isArray(data.items) ? (data.items as unknown[]) : null;
}

/**
 * THE SUPPLIER NETWORK (SPAR) — reaching people who do not use this ERP.
 *
 * Sourcing compares the answers; this goes and gets them. A request is published to matching
 * suppliers, each is messaged a link, and the link opens a one-minute form that needs no
 * account. The answers come back, are ranked by delivery and price, and are brought onto the
 * request as ordinary quotes when the buyer accepts them.
 *
 * It sits beside Sourcing rather than inside it because the two answer different questions —
 * "who should we buy from" is a decision, and "who can we even ask" is a network — and
 * because deleting this folder must leave Sourcing working exactly as it did.
 */
export const networkManifest: ModuleManifest = {
  key: "network",
  name: "Supplier Network",
  summary:
    "The suppliers this factory can ask for a price, the messages sent to them, and their answers ranked by delivery and cost.",
  department: "SPAR",
  icon: "Radio",
  licenceKey: "purchase",
  order: 25,
  nav: [
    {
      label: "Suppliers",
      path: "suppliers",
      permission: "purchase.network.read",
      icon: "Users",
      description:
        "Everybody this factory can ask for a price, whether or not it has ever bought from them — that is the difference between this list and the vendor master. Each supplier carries what they make and a WhatsApp number or email address, because a supplier who cannot be reached cannot be asked. The column that matters most is whether they are also an approved vendor: a request can go to anyone here, but an award can only raise a purchase order against somebody who has been approved.",
    },
    {
      label: "Messages",
      path: "messages",
      permission: "purchase.network.read",
      icon: "MessageCircle",
      description:
        "Every message this system composed for a supplier, shown exactly as written — on a phone, which is where it would really be read, and on the desktop. Nothing is delivered: no live WhatsApp or email sender is configured, and the screen says so rather than letting a demonstration imply that somebody's phone buzzed. What is real is the card, the link inside it, and the page that link opens.",
    },
    {
      label: "Ranked answers",
      path: "ranking",
      permission: "purchase.network.read",
      icon: "Sparkles",
      description:
        "What the suppliers answered, ordered by how soon each one can deliver and what it costs, with the reasoning written out beside every row. Delivery counts for slightly more than price, because a cheap part that arrives after the build has already cost more than the difference. The ranking explains and does not decide — an answer that cannot meet the need date is marked unusable however cheap it is, and the award remains a person's.",
    },
  ],
  screens: {
    suppliers: () => import("./screens/suppliers"),
    messages: () => import("./screens/messages"),
    ranking: () => import("./screens/ranking"),
  },
  /**
   * One question a buyer asks of this module at a glance: HOW MANY PEOPLE CAN I ACTUALLY ASK.
   * A network of two is not a network, and the tile says so rather than showing a proud count.
   */
  signals: [
    {
      label: "Suppliers reachable",
      permission: "purchase.network.read",
      path: "/purchase/network/suppliers",
      reduce: (data): SignalValue | null => {
        const rows = items(data);
        if (rows === null) return null;
        const suppliers = rows.filter(isRecord);
        if (suppliers.length === 0) {
          return { value: "0", hint: "Nobody on the network yet", tone: "warn" };
        }
        const onWhatsApp = suppliers.filter((s) => typeof s.whatsappE164 === "string").length;
        const awardable = suppliers.filter((s) => typeof s.vendorId === "string").length;
        return {
          value: String(suppliers.length),
          hint: `${onWhatsApp} on WhatsApp · ${awardable} approved as vendors`,
          tone: suppliers.length < 3 ? "warn" : "ok",
          fraction: suppliers.length === 0 ? 0 : awardable / suppliers.length,
        };
      },
    },
  ],
};
