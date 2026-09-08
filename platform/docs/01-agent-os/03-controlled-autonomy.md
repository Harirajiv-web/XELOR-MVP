# Agent OS — Phase 3: Controlled autonomy

Phase 3 moves the Agent OS from evidence-backed review to approval-bound action. It does
not give a model SQL access, silently mutate ERP transactions or imply that an external
connector is configured.

## Controlled action graph

`operations.controlled-action-mission@3`:

1. ONYX bounds the operating objective.
2. HEXA, MICA, SPAR, AXLE, KILN, RASP, RELAY and ACHILES read eight live, tenant-scoped
   platform, service or ERP views in one parallel wave.
3. Every specialist produces an evidence-backed recommendation.
4. ONYX joins the recommendations into one action plan.
5. HEXA verifies the evidence and consequence boundaries.
6. The graph pauses at a durable, attributable human approval.
7. After approval, seven business/service specialists dispatch one governed work item in
   parallel. RELAY's item coordinates service communication; the other six remain owned by
   their domains. ACHILES remains read-only and dispatches nothing.
8. HEXA verifies that every side effect has an approved graph ancestor.
9. ONYX publishes the execution outcome.

The engine enforces approval ancestry independently of graph authorship. A side-effecting
capability called without a successful approval ancestor fails closed with
`AGENT_ACTION_APPROVAL_REQUIRED`.

## Action dispatch ledger

`agent_action_dispatch` is an append-only, tenant-fenced execution ledger. Each row records:

- the originating run and graph node;
- the approval node;
- the responsible specialist;
- target domain, action type, risk and exact structured payload;
- the approving actor; and
- the dispatch timestamp and execution boundary.

The shipped execution mode is `governed_work_item`. This is a real internal action boundary,
not a claim that an external API, supplier message or autonomous financial posting ran.
Domain-specific executors can be added behind the same contract later.

## Internal ERP signal ingress

`POST /api/v1/agent-os/signals` accepts a typed local ERP event and starts the controlled
action graph. `eventId` becomes the run's idempotency boundary, so replaying the same event
cannot create two missions. The persisted mission input records the event type, source
domain, severity, receipt time and structured payload.

Mission Control includes a local Northstar risk signal for the investor flow. This proves
event-started orchestration without claiming that an external webhook or paid API is active.

## Provider and connection disclosure

- Live: graph orchestration, ERP reads, checkpoints, evidence, approval decisions, action
  dispatch and audit.
- Offline: deterministic language reasoning.
- External connections: zero.
- Optional local model: the repository's existing Ollama EDGE adapter can be configured
  later without changing the action or approval contract.

## Investor flow

The default mission is:

> Protect the Northstar delivery commitment with a governed seven-lane recovery plan.

The investor can see all nine agents connected on the first authenticated frame, open
Mission Control, start the controlled mission, inspect the complete human gate, approve it,
and watch seven attributable work items appear in the live dispatch ledger. The difference
between eight evidence lanes and seven dispatches is deliberate: ACHILES may observe, but it
may never repair, restart or change a business record.

## Verification

`pnpm --filter @ind-core/web e2e:agent-os` verifies:

- the initial page contains the live 9/9 topology—ONYX plus eight specialists—without an intermediate Brain;
- the same ONYX hub opens Mission Control;
- the Phase 3 graph reaches its approval gate;
- approval resumes the durable graph; and
- exactly seven governed action dispatches are recorded and shown.
