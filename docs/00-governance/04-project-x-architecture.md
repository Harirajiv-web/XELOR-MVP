# Project X — the technology spine for Indian manufacturing

Status: **accepted**, 14 September 2026. Supersedes nothing; extends
[02-four-product-consolidation](02-four-product-consolidation.md) and
[03-product-names-and-workspace](03-product-names-and-workspace.md) from four products to ten.

## What Project X is

Project X is the whole programme, not a tenth product. The name covers one ambition: to be
the **technology spine for the Indian manufacturing market** — the system a plant runs on,
plus the connected packages that extend it, plus the service that gets it live.

The spine metaphor is doing real architectural work here, so it is worth being literal about
it. A spine carries load and carries signal, and everything else attaches to it. In this
programme that is XELOR: the ERP is the system of record, and every other product reads from
and writes to it. Nothing attaches to anything else.

## The shape: ten products, one spine, no bundle

| | Product | Profile | Web | API | What it owns |
|---|---|---|---|---|---|
| **spine** | XELOR ERP | 1 | 4001 | 4000 | Orders, stock, finance, people, approvals — the system of record |
| | ONYX | 2 | 4101 | 4100 | AI intelligence over the spine's evidence |
| | AIKYANTRA | 3 | 4201 | 4200 | The supplier network outside the company |
| | Integrated workspace | 4 | 4301 | 4300 | All three in one view (pre-existing; not extended) |
| **packages** | Plant Operations | 5 | 4401 | 4400 | Machine signals, maintenance, energy — on one asset register |
| | Quality, Safety & Compliance | 6 | 4501 | 4500 | One corrective-action engine for defects and incidents |
| | Warehouse & Dispatch | 7 | 4601 | 4600 | One handling unit from gate to truck |
| | Planning & Engineering | 8 | 4701 | 4700 | One BOM and capacity model; change control |
| | Revenue & Service | 9 | 4801 | 4800 | Quote it, then stand behind the serial number |
| | Delivery & Managed Services | 10 | 4901 | 4900 | The people work that gets it live and keeps it live |

Ports follow the existing formula `api = 3900 + phase × 100`, `web = api + 1`. Profiles 1–4
and their ports, database names and integration keys are unchanged, as governance requires.

### Why six packages and not eighteen

The research catalogue held 94 capabilities across 18 surrounding offerings. Those were
regrouped into six by asking what each part actually shares — the same master record, the
same device on the wall, the same person signing — rather than what the names sound like.
Four merges collapse two offerings, one collapses three, and one collapses five. The
reasoning per package is in [deliverables/xelor-ecosystem-consolidated.html](../../deliverables/xelor-ecosystem-consolidated.html).

The largest merge is the services one, and it is the least arguable: 20 of those 21
capabilities are marked delivery or partner work. There is almost no product code in them.
They are one engagement — migrate, integrate, commission, support, secure — not five SKUs.

### Why there is deliberately no "everything" bundle

Profile 4 already exists and is left alone. No new bundle was created that contains all ten,
because a single application holding every package is the thing this structure is designed to
avoid: it makes the ERP look complicated to a customer who wanted an ERP, and it makes each
package unsellable on its own terms. Each package is its own product with its own runtime,
navigation, palette and identity.

## How a package connects to XELOR

This is the part that makes them packages rather than separate products that happen to be
installed nearby.

**One database, one ledger.** All profiles share the tenant-isolated database. A change
recorded in a package is visible in XELOR and the reverse, immediately, because there is only
one set of rows. No package keeps a second copy of stock, ledger or order data.

**One write path per domain.** A package never writes directly to a domain it does not own.
Warehouse & Dispatch posts stock movements through Inventory's existing endpoint, with
Inventory's idempotency key and Inventory's `FOR UPDATE` lock on the balance row. The
architectural rule inherited from the research — *"an add-on must not create a competing
ledger"* — is enforced by the API surface, not by convention.

**One permission system.** No package introduced a permission. Every screen reuses the
permission that already guards the data it shows, which is why a person who may not read
purchase orders does not gain that right by opening the Warehouse package. The registry
refuses a permission that no route enforces, in both directions, so inventing one would fail
the build rather than quietly widen access.

**One server-side gate.** `ProductProfileGuard` gives each profile an explicit prefix set and
fails closed for anything unrecognised. A package reaches the ERP data it extends and nothing
else — Plant Operations cannot read a customer's quotations just because both are add-ons —
and no package gets the supplier-network endpoints, which remain AIKYANTRA's.

**No new migrations.** The ten-product structure required zero schema change. Profiles are an
environment and build concept; there is no product or phase column anywhere in the database.

## The user interface: one design system, ten skins

The three shipping products already shared one shell with per-product palettes. That held, so
the six packages reuse it rather than introducing new design languages.

Each package declares a `:root[data-product-phase="N"]` block of 67 tokens plus a dark delta.
The six new palettes were **derived from the XELOR block by keeping each token's relative
luminance and changing only its hue**, so the contrast ratios the palette test enforces are
preserved by construction rather than by hand-tuning. The resulting identities are teal,
forest, terracotta, indigo, plum and slate — each clearly distinct from the existing maroon,
navy, cream and blue.

The palette test loops every declared profile automatically. All ten products, in both
themes, across page, sidebar, topbar and tab scopes, pass every contrast floor: 63 assertions.

A screen still never writes a colour down. Tokens only — a literal hex or a Tailwind palette
class is a light-mode bug waiting for somebody's night shift.

## What the MVP deliberately does not do

The scope discipline here matters more than the feature count, because every item below is
something a demo could fake convincingly and a customer would later discover.

- **No AI API calls.** The packages contain none. Where the research proposed assistance, the
  MVP uses structured intake and deterministic arithmetic. A model never sets a price, and
  cost sheets are computed in visible lines.
- **No invented numbers.** OEE renders an explicit "insufficient data" state when an input is
  missing rather than a plausible percentage. This is the single most important honesty rule
  in the programme: a wrong OEE is worse than no OEE, because people act on it.
- **No claimed certification.** Nothing states or implies ISO 9001, IATF 16949, IEC 62443 or
  "audit-ready". Compliance-support features do not certify a customer.
- **No faked safety detection.** PPE and camera-based hazard detection are partner scope and
  are not simulated. A faked safety detection is the most dangerous thing this codebase could
  contain.
- **No physical machine control.** Machine signals can be simulated because the edge simulator
  already refuses to claim a physical action completed. Actuation is a separate engineering
  scope needing site and OEM approval.
- **No claimed service.** A service dashboard is not a staffed service, and the research
  companies are candidate options, not partners. None has been contacted.
- **No predictive maintenance.** Until a failure mechanism, labelled history and measured
  warning lead time exist, the feature is called condition monitoring or threshold alerts.

## Where the real work remains

The most repeated finding across the source audit was that **the gap is screens, not
services**: backend breadth runs well ahead of the customer-facing journeys. Read-only work
order boards, a ticket view with no reply box, quality documents rendering static props, no
PM creation journey. The packages were therefore built as *finishing the journeys over what
already posts real transactions*, not as adding capability — which is cheaper and more honest
than the alternative.

Two structural gaps are worth naming because they limit what any package can claim:

1. **There is no `plant` or `site` table.** The schema has `company` and `gst_registration`,
   so two GSTINs under one PAN works, but "GSTIN inherited from plant" has no plant to inherit
   from. Multi-plant is correctly marked as new work.
2. **There is no engineering change record.** `item`, `bom`, `bom_line` and a version integer
   is the whole of it. The result of a change can be recorded; the change cannot. "Which
   revision was in the unit we shipped in August" is still unanswerable, and the Planning &
   Engineering package surfaces the impact analysis it can compute rather than pretending the
   record exists.

## India fit, and where that claim comes from

The India-specific depth in this programme — 43B(h) 15/45-day MSME payment clocks, ITC-04 and
the Rule 45 job-work ageing register, state-varying e-way bill thresholds, Section 17(5)(h)
scrap reason codes, the ₹5-crore e-invoice mandate with its 30-day cliff, Factories Act §88 —
comes from the product specifications under `platform/workspace/docs/`, **not** from the
supplier research. The nine researched suppliers contain almost no India compliance content.

When positioning Project X on India fit, cite the specs. Attributing that depth to the
supplier research would be a claim the research does not support.
