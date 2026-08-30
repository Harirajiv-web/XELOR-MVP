# AIKYANTRA — ONYX and XELOR

Two products, one platform, one workspace. **Everything here belongs to exactly one of
them, or is deliberately shared — and the folder name says which.**

| | | |
|---|---|---|
| **ONYX by AIKYANTRA** | Phase 1 | The ERP. The system of record: Sales, Purchase, Inventory, Production, Quality, Maintenance, People and Accounts. |
| **XELOR by AIKYANTRA** | Phase 2 | The intelligence layer on top of it. Autonomous fulfilment, the nine agents, the copilot, the AI control centre. |

XELOR does not replace ONYX and does not fork it. It **reads ONYX's records and writes
back through ONYX's own endpoints**, which is why the two run side by side on separate
ports and separate databases rather than as one build.

```bash
./run-phase.sh 1          # ONYX   → http://localhost:3001
./run-phase.sh 2          # XELOR  → http://localhost:3101
./run-phase.sh 2 --keep   # start without rebuilding the demo world
./run-phase.sh stop       # stop both
```

`web:200 · api:401 · kc:200` is the healthy state. **The API's 401 is the auth guard
answering, not a fault** — its global prefix is `api/v1`, so `/` correctly 404s.

---

## What is where

```
MVP FILES/
├── ONYX-phase-1/        THE ERP.        api :3000  web :3001  db indcore
├── XELOR-phase-2/       THE AI LAYER.   api :3100  web :3101  db indcore_p2
│
├── deliverables/        Documents for people outside the team.
│   ├── 1-MVP-ONYX-and-XELOR-Technology-and-Architecture.pdf        what is built today
│   ├── 2-END-PRODUCT-ONYX-and-XELOR-Production-Architecture.pdf    what it becomes in production
│   ├── Architecture-Dossier.html / .pdf     the technical brief, both phases
│   ├── Investor-Pitch.html                  the deck
│   ├── competitor-research/                 four studies + their PDFs
│   └── make-dossier.sh                      regenerates the dossier PDF
│
├── docs/                The blueprints and governance. Shared by both products.
│   ├── 00-governance/   ← 01-binding-platform-decisions-v2.md is BINDING
│   └── 01-…08-…/        module blueprints, AI architecture, execution, decks
│
└── archive/             Nothing here is live. Kept for provenance.
    ├── old-checkout-MVP_PROTOTYPE_1/   the original single-repo checkout
    ├── plain-erp-experiment/           an earlier ERP-only cut
    ├── research-corpus-immutable/      the original research, never edited
    ├── old-deliverables/               superseded decks and documents
    ├── floorplan-3d/                   the standalone Three.js prototype
    └── scratch-probes/                 disposable diagnostics and screenshots
```

### Which product does this file belong to?

The top-level folder answers it. Inside `ONYX-phase-1/` everything is ONYX; inside
`XELOR-phase-2/` everything is XELOR. `deliverables/` and `docs/` cover **both** — they are
written about the platform, not about one half of it.

---

## The two are NOT a fork, and the difference matters

`XELOR-phase-2` began as a copy of `ONYX-phase-1` and has since diverged: it carries extra
migrations, the whole `fulfilment` module, the agent runtime and the mission arc. Phase 1
has none of those.

**They share Keycloak, Valkey and Gotenberg** — none of which hold phase-specific state —
**and they do NOT share a database.** Phase 2 runs migrations Phase 1 has never seen, so a
shared database would mean that starting Phase 2 once silently rewrote Phase 1 into
something that no longer matched its own code.

The shared containers are brought up from `XELOR-phase-2/infra/docker-compose.yml`. All
three compose files in the tree are byte-identical, so it does not matter which one starts
them — but the **sign-in theme and the Keycloak realm are bind-mounted from whichever one
did**, which is worth knowing when a change to the login page appears to do nothing.

## The sign-in page is shared, and it carries one name

Both products sign in through the same Keycloak realm and the same theme, so the front door
says **XELOR**. A single door cannot carry two wordmarks. If the two ever need to look
distinct on the way in, that is a second realm and a second theme, not a CSS change.

## The demo factory

One pilot factory, **3S Precision Parts Pvt Ltd** — a machining shop that buys castings and
bar stock, machines components and sells finished housings and valve bodies. Both phases
seed the same 157-step world so the numbers agree wherever you look. A second tenant,
Kaveri ElectroFab, exists only to prove tenant isolation and is invisible from inside 3S.

Every start rebuilds that world unless you pass `--keep`, so a demo shown twice opens on
identical numbers both times.
