# Investor demo — One decision, nine agents, complete evidence

Everything below is live data in the running system. No slides, no mock screens. Every
document was created by a real request through the real guards, so anything on screen can be
clicked into and questioned.

---

## Before you start

| | |
|---|---|
| Open | `http://localhost:3001` |
| Investor presentation mode | No sign-in; `.env` has both public-demo flags set to `true` |
| Optional authenticated demo | Username `hari` · password `1234` after turning both public-demo flags off |
| Specialist logins | Password `demo` |
| Demo "today" | **Monday 20 July 2026**, FY 2026-27 |
| Rebuild | `pnpm demo:rebuild` (about a minute; see *Resetting between presentations*) |

Check the services before anyone is in the room. In sign-in-free presentation mode the
healthy state is `web:200 · commander with the fixed demo header:200 · API without that
header:401`. The last response proves the demo switch did not turn the backend into a public
API. Keycloak remains available at port 8080 for the optional role-isolation segment.

---

## Recommended 8–10 minute investor route

This is the primary presentation. The detailed module-by-module route below is the optional
technical follow-up.

### 1 · Start with what XELOR is

Open `http://localhost:3001`, press **Enter the factory intelligence**, then press the ONYX
hub or **Open Decision Commander**.

Say: **“XELOR is the decision layer above the factory system of record. It connects the
records that belong to one operating decision, explains the evidence, and keeps a person in
control of every consequential action.”**

### 2 · Show the Northstar decision first

The first card is **SO-2627-00004 · Northstar Process Systems**. It is first because two live
facts are connected: the open ₹74.34 lakh customer commitment and the rejected PX-400 final
inspection. Open the source-record disclosure and show both Sales and Quality.

Then open the confidence calculation. Explain that the percentage measures evidence
coverage, freshness, completeness and prior verified history. It is explicitly **not** a
probability that a recovery action will succeed.

### 3 · Explain the complete intelligence loop

Scroll to **One visible decision-intelligence loop**:

`Live records → Evidence graph → Confidence → Human decision → Verified outcome → Memory`

The Knowledge Graph must show persisted relationships across at least two business areas.
Organizational Memory must show one completed, verified non-financial example and one current
Northstar decision waiting for a person. The verified example claims **₹0 financial value**:
it proves seven governed work items completed their control boundary, not that XELOR invented
savings.

### 4 · Prove the seven MVP upgrades

At **MVP platform readiness**, show API and integration health, document-intelligence
measurement, operational health, and the seven proof cards. The cards say `Live MVP` or
`MVP operations`; none says production-ready. Simulated connectors are labelled simulated.

### 5 · Choose the right guided demo

Press **Start Demo**. There are exactly two choices:

- **From customer order to delivery** is the primary 11-step story for a non-technical
  audience. It begins in Sales, follows planning, buying, stock, production, quality,
  approval and finance, and finishes by separating MICA product care from RELAY's XELOR
  technology service.
- **Meet the agents** is the optional 9-step overview. It opens each agent map and gives one
  high-level explanation of the role and one simple hand-off line—nothing technical.

The ninth and final stop is **ACHILES**, the private platform watcher. Explain it in one
sentence: “ACHILES quietly checks whether XELOR is working every hour; it records evidence
but cannot repair anything or contact the customer.” Its status page is visible only to
authorised XELOR/IT roles, not ordinary customer users.

At the first Sales step, click **New order**, create and save a real sales order, show the
saved detail page, and then click **Next**. Repeat that pattern at the Purchase step for a
real purchase order. The guide itself never saves a document, and a successful save only
unlocks **Next**; it never moves away before the presenter is ready.
The floating guide temporarily hides while either order dialog is open so the form and its
Save button stay fully usable, then returns with the saved document number.

### 6 · Make the human boundary visible

When the guide reaches **Approvals**, one seeded Northstar recovery is waiting. Read the
proposed action: it creates seven attributable internal work items and does not claim to send
a supplier message, customer promise or payment. Approve it only if you want to demonstrate
the live transition; doing so is attributable and changes the demo state until the next
rebuild.

### 7 · Finish on proof, not animation

Open Mission Control to show the specialist work-item ledger, then Administration → Audit
trail. Finish with: **“The recommendation, the human decision, the work dispatched and the
verification are all separate records. That separation is the product.”**

---

## Optional authenticated role-isolation deep dive

The five personas below are used only after disabling sign-in-free presentation mode and
restarting the web/API processes. They demonstrate real Keycloak identities and server-side
permission boundaries; they are not required for the main investor journey.

---

### The five people

| Sign in as | Who they are | What they can open |
|---|---|---|
| `hari` | Hari, XELOR Administrator | Everything |
| `mica.commercial` | Anitha Raghavan, Commercial | MICA + ONYX |
| `spar.supply` | Farida Shaikh, Supply Chain | SPAR + ONYX |
| `kiln.operations` | Ravi Thangaraj, Operations | KILN + ONYX |
| `hexa.admin` | Deepak Menon, Platform | HEXA + ONYX |

ONYX is open to all five. It is not a department — it is the intelligence layer that reads
across a factory whose parts are otherwise walled off from each other.

---

### The story in one line

**Northstar Process Systems ordered 120 PX-400 precision pump assemblies, ₹74.34 lakh, for
4 September.** Every department below is looking at that one order from its own angle.

---

### 1 · MICA — the order, and a control that fires

Sign in as **`mica.commercial`**. Sales → Orders → **SO-2627-00004**.

- 120 × PX-400 at ₹52,500. Customer reference **NPS/PO/10482**. Gujarat, so **IGST**, not
  CGST+SGST — the system worked that out from the two GSTINs, nobody chose it.
- **The order was refused first.** ₹74.34 lakh against a ₹45 lakh credit limit put it on
  `credit_hold`. It is now `override`, and the reason is on the order:

  > *Northstar has paid 11 of 11 invoices within terms since FY24-25. MD approved a temporary
  > limit of ₹80 lakh for this order on 20-Jul-2026 (ref: board note 2627/14).*

**The line worth saying:** an ERP that says yes to everything is a spreadsheet with a login
page. This one stopped a commercially significant order on its own and would not proceed
until a person put a reason in writing — and that reason is now attached to the order rather
than sitting in somebody's inbox.

---

### 2 · SPAR — buying the metal, two signatures at a time

Sign in as **`spar.supply`**. Purchase → Orders.

- **PO-2627-00003** — 750 kg of SS 316L bright bar from **Meridian Metals**, ₹2,88,750. The
  remarks carry the award: Meridian at ₹385/kg against Atlas Alloys at ₹394/kg.
- **PO-2627-00004** — 120 casing blanks from Sundaram, ₹11,52,000. Still open: a receipt the
  buyer is watching for.
- Open PO-2627-00003 and show the approval trail. **Two different people signed it** — the
  stores in-charge reviewed it, the administrator approved it. Signing as the wrong one is
  refused by name.
- Inventory → Stock: the 316L is in **Pune Stores**, and 485 kg of the 750 is still there
  after the first tranche was machined.

---

### 3 · KILN — from bar stock to pumps, and the twelve that did not pass

Sign in as **`kiln.operations`**.

**Quality → Inspections → INS-2627-00001** (incoming, the 316L):
three specimens from the heat, chromium and molybdenum in range, hardness in range, mill
certificate matched. Accepted, and stores released it from quarantine.

**Production → Work orders:** three of them, in the order the metal actually moved.
MO-2627-00002 made 45 impellers, MO-2627-00003 made 45 shafts, both from the received heat.
MO-2627-00004 turned those into **40 finished pumps**.

**Quality → Inspections → INS-2627-00002** (final) — *this is the beat to slow down on*:

- Eight units sampled. One measured **0.034 mm of shaft runout at the seal face** against a
  0.020 mm limit.
- Runout is classed **critical** on this product, because a 316L process pump that weeps is a
  customer incident rather than a quality one. The lot was rejected.
- **Twelve units from that machining setup are now in quarantine.** Finished goods shows
  28, not 40 — and there is a stock ledger entry explaining exactly where the other twelve
  went.

**Maintenance → Work orders → MWO-2627-00001:** Furnace 02 — the plant's only annealing route
for 316L — lost vacuum mid-build. An operator raised it, a fitter fixed it, 4.5 hours of
production time lost, ₹1,855 of cost rolled up, and the cause recorded as **seal wear, found
by the operator** rather than as a tick in a box. It is completed and waiting for closure
sign-off.

**Maintenance → Assets → Furnace 02:** criticality A, *"sole solution-annealing route for
316L parts; no standby furnace"*. The next quarterly service falls inside the Northstar build.

---

### 4 · AXLE — what the plan says has to happen

Sign in as **`hari`** (AXLE has no dedicated persona).

- Engineering → Items → **PMP-PX400**, and its BOM: impeller, shaft, casing, two cartridge
  seals, sixteen bolts. The impeller and shaft have their own BOMs underneath.
- Planning → MRP run → **MRP-2627-00002**: 21 planned orders, 24 exceptions.
- Planning → Exceptions: 42 critical, 8 high. **This is the number nobody can reach by
  looking at the order.** 120 pumps pull roughly 707 kg of 316L through two levels of
  explosion, and the bar has a 16-working-day lead time with a 250 kg minimum.
- The planner has already accepted one of them, with a note: *Meridian confirmed the balance
  heat for 11-Aug.*

---

### 5 · MICA again — product care notices before we ship

Back as **`mica.commercial`**. Customer Care & Warranty → Product cases →
**TKT-2627-00015**.

> *PX-400 pre-shipment sample — seal weep at 1.5× hydro. Serial PX400-2627-0007.*

- The AI proposed a category and a priority. A person **accepted** it — the record shows the
  proposal and the acceptance as two separate acts.
- The AI drafted a reply. A person **edited it and sent it**. The edit is recorded against
  the draft. Nothing reached the customer because a model decided it should.
- The reply tells Northstar the truth we already knew from our own bench: twelve units from
  one machining setup are held, the balance is unaffected, 4 September still stands.

**The line worth saying:** the customer's complaint and our own inspection are the same
finding arriving from two directions, and the system already connected them.

This is MICA's boundary: the manufactured product, its warranty, spares, complaint and
customer feedback. If the problem is instead an outage, connector failure or AI-operation
issue in XELOR itself, RELAY opens and coordinates the managed-service incident. The two
records are linked only when the product and the XELOR service are both affected.

---

### 6 · Shipping, money, and people

- MICA → the order shows **28 dispatched of 120**. The twelve held stayed behind. DN-2627-00002,
  invoice INV-2627-00002, reported to the IRP, e-way bill raised.
- Accounts → Vouchers: the invoice, and Northstar's ₹10 lakh part-payment against it.
- HRM → Muster (as `hari`): the three people who built it, rostered and their attendance
  computed from punches.
- The quality engineer's trip to Northstar's works — flight, hotel, meals — was claimed,
  **budget-checked on submission** against the FY 2026-27 sales travel budget, and approved.

---

### 7 · HEXA — why any of this can be believed

Sign in as **`hexa.admin`**. Administration → Audit trail.

- **120 audit entries**, hash-chained, verified end to end after the story was built. Not a
  claim in a migration — the real verifier re-walked the real chain.
- The chain is **append-only in the database**, for the schema owner as well as for the
  application. There is no switch that turns it off.
- Administration → Roles: the five demo roles and what each one holds.
- **HEXA-GOV-024** is on the incident register: the credit override, logged for the quarterly
  control review. A control that fired, recorded as one.

---

### 8 · ONYX — the part that answers questions

Available to every persona. Copilot → Ask.

Three questions that work, and one that must not:

| Ask | What comes back |
|---|---|
| `how much PMP-PX400 do we have` | The balance, citing `stock_balance`, `item`, `warehouse` |
| `what moved for PMP-PX400` | The movement trail, citing `stock_ledger` — including the twelve into quarantine |
| `open sales orders` | Four orders, citing `sales_order`, `customer` |
| *"Should we ship the twelve held pumps anyway to make the date?"* | **Refused** |

**The refusal is the most important thing on this screen.** It is not a judgement call the
model got right — there is no endpoint that takes a question and runs it, none that takes SQL,
none that writes anything. The read-only promise is kept by there being nothing to call.

AI Operations → Feature registry, Evals, Cost:

- Eight AI features, closed set. Nothing else is allowed to use a model.
- A candidate triage prompt was written, evaluated against a 140-case golden set (0.93
  against a 0.89 baseline), and **promoted by a different person from the one who wrote it** —
  the gate refuses the author by name: *"Still needs: an approver who is not the author. The
  gate is not a warning."*
- Every model call is metered and priced at the rate in force on the day.

---

### 9 · The wall between people — the two-minute version

The strongest thirty seconds in the demo, and it needs two browser windows.

1. As **`mica.commercial`**, go back to ONYX. The other six accountable departments are **visibly shut**
   — shown, dimmed, not hidden. You can see the factory has a supply chain; you cannot open it.
2. Type `/department/SPAR` into the address bar. **Access restricted**, with a way back.
3. The point: this is not a hidden menu. The **server** refuses. The same persona's browser
   asking the API for another department's data gets **403**, resolved from grants in
   tenant-fenced tables, with nothing in between that a browser's developer tools could edit.

Verified mechanically before every presentation:

```
node _scratch/probe-personas.mjs     # five personas: map, deep links, and real-token 403s
node _scratch/probe-northstar.mjs    # every department screen actually shows the story
```

---

## Resetting between presentations

```
pnpm demo:rebuild
```

That runs `db:demo-reset` → `db:migrate` → `demo:seed` → `demo:northstar` and produces the
same world every time.

**It rebuilds rather than deletes, and that is deliberate.** Fifty-four tables in this system
carry an append-only trigger — the audit log, the stock ledger, the general ledger, payroll,
the workflow trail — and those triggers fire for the schema owner too. A row-level undo would
have to begin by dropping them, which is exactly the weakening the demo exists to prove this
system does not do. Throwing the database away and building it again keeps every guarantee
intact, and takes about a minute.

The reset refuses to run on a database whose `tenant` table holds anything other than the two
demo tenants. Point it at a real one and it stops without touching a row.

Nothing needs restarting afterwards — the running services pick the rebuilt database up on
their own. Refresh the browser. In public-demo mode no sign-in is required; in authenticated
mode sign in again.

---

## A note on the document numbers

The brief named records like SO-10482 and PO-7719. What you will see is **SO-2627-00004** and
**PO-2627-00003**, because XELOR allocates its own gapless, financial-year-qualified
numbers through a shared series, inside the same transaction as the document. Forcing the
brief's numbers would have meant writing outside that allocator, which is the one thing on
these screens that must never look improvised.

The story's own identifiers are carried where a plant carries them: **NPS/PO/10482** is
Northstar's purchase order number, on the sales order. **MMA-Q-7719** is Meridian's quotation
reference, in the purchase order's remarks. **RM-316L-2407** is the heat number, on the
receipt and the incoming inspection.
