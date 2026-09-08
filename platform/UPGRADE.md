# XELOR Autonomous Manufacturing AI — Investor MVP Upgrade Plan

**Document purpose:** define the product, AI architecture, investor demonstration, delivery plan, controls, and evaluation criteria for the XELOR autonomous manufacturing MVP.

**Architecture decision:** **Policy-Governed, Event-Driven Graph of Bounded Agentic Loops**.

**Scope note:** this document is intentionally implementation-neutral. It does not prescribe a backend stack, database, cloud provider, model vendor, programming language, or infrastructure product.

---

## 1. Purpose and investor claim

XELOR should not be presented as an ERP with chatbots attached. The investor claim is that, after a factory accepts a sales order, XELOR can coordinate the remaining fulfilment lifecycle toward a measurable business outcome:

> Give XELOR an approved customer order. It determines what must happen, produces a feasible cross-functional plan, carries out permitted actions, watches the factory state, responds to disruption, asks for human authority only when required, and verifies that the customer commitment was achieved.

The ERP remains the system of record and transaction authority. The AI layer is the **goal-directed coordination and adaptation system above it**.

The MVP must demonstrate five properties:

1. **Goal ownership:** it manages a customer commitment, not just a prompt.
2. **Cross-functional planning:** it coordinates engineering, materials, procurement, inventory, production, quality, logistics, and commercial constraints as one mission.
3. **Governed action:** it can take permitted actions through controlled business capabilities rather than merely recommending them in text.
4. **Adaptation:** it notices a material change, evaluates impact, and revises the remaining plan.
5. **Outcome verification:** it proves whether the order was completed on time, within policy, and within the promised commercial envelope.

### 1.1 What makes this genuinely agentic

The presence of multiple named agents does not make a system agentic. XELOR is agentic only when it repeatedly performs this closed loop:

> **Observe → Diagnose → Plan → Authorize → Act → Verify → Wait or Replan**

It must have an objective, a changing environment, a choice of actions, authority boundaries, memory of prior steps, stopping conditions, and evidence-based verification. A chatbot that explains a late order is not agentic. A system that detects the risk, creates an allowed recovery plan, executes it, verifies the new state, and continues pursuing the delivery objective is.

### 1.2 Honest MVP positioning

The investor MVP should be described as:

> **Autonomous manufacturing orchestration powered by a governed agent runtime.**

It is not yet a production-ready, lights-out factory. The AI reasoning and plan selection are real; the factory data and external-world events are synthetic; all important calculations and controls are testable; and all simulated elements are visibly labelled.

---

## 2. What the MVP must prove

The MVP should answer one investor question convincingly:

> Can XELOR turn an approved order into a controlled, adaptive, cross-functional execution mission rather than a collection of disconnected departmental transactions?

### 2.1 Required proof

The demonstration must show that XELOR can:

- translate an approved order into explicit objectives and constraints;
- collect the evidence needed to plan;
- identify missing, stale, or contradictory information;
- evaluate engineering readiness without inventing technical facts;
- calculate material and inventory implications using authoritative rules;
- generate and compare multiple feasible fulfilment strategies;
- explain the chosen strategy in business terms;
- create the permitted downstream records and actions;
- run independent checks before and after each material action;
- monitor milestones, risks, cost, margin, and delivery confidence;
- react to at least one supplier or production disruption;
- request one meaningful human approval with a complete decision brief;
- resume safely after the approval;
- complete the simulated lifecycle; and
- present evidence of the achieved outcome and full decision history.

### 2.2 What the MVP does not need to prove

The MVP does not need to prove:

- unrestricted autonomy across every factory process;
- direct machine or safety-system control;
- optimal scheduling for every manufacturing topology;
- autonomous engineering sign-off;
- autonomous treasury, tax, or statutory submission;
- integration with every supplier, carrier, machine, or customer portal;
- a general-purpose multi-agent swarm; or
- that an AI model can replace deterministic manufacturing mathematics.

---

## 3. Whole-project analysis and upgrade baseline

This plan was checked against the current repository rather than treating XELOR as a blank-sheet product. The audit covered the project documentation, all business modules, the Agent OS runtime, the AI feature layer, the Northstar seed and presenter flow, the browser surfaces, the project checks, and the current limitation register.

### 3.1 Verification performed for this plan

On 10 August 2026, the following non-destructive checks were run against the working project:

- full project build — passed;
- lint — passed with zero warnings;
- type checking across every workspace — passed;
- workspace unit and persistence tests — passed;
- module-boundary validation — passed;
- report fact validation — passed, but its embedded test count is stale; and
- document and source audit — completed.

Repository inspection and current executable checks establish:

- 22 installed and registered product modules;
- 163 valid navigation-permission references;
- 9 registered agent roles;
- 7 registered Agent OS graphs;
- 19 Agent OS capabilities, of which only one is side-effecting;
- 90 tracked business-data and control-model evolution steps;
- 31 business interface surfaces; and
- 799 passing automated tests in the current executable suites: 728 platform, 56 application-service, 4 persistence, 6 edge, and 5 web tests.

The report validator still contains a hard-coded 783-test total and checks only that its stored breakdown sums correctly; it does not derive the number from current test output. The demo database was not reset and the waiting investor approval was not consumed during this audit. The full browser suite was not replayed, but targeted local and hosted smoke checks were performed.

### 3.2 Current maturity conclusion

XELOR is not an empty ERP mock-up. It is a broad, governed manufacturing prototype with substantial deterministic business logic and a credible decision-control foundation.

However, the current system is **not yet the autonomous order-to-fulfilment system described in this plan**. It presently demonstrates:

- deterministic cross-module risk detection;
- fixed, bounded, durable Agent OS missions;
- parallel evidence gathering;
- human approval and pause/resume;
- governed internal work-item dispatch;
- deterministic language summaries inside Agent OS;
- narrow optional model-assisted features elsewhere in the application; and
- a manually guided order-to-delivery investor story.

The required upgrade is therefore not “build an AI platform from nothing.” It is:

> **Turn an already governed fixed-graph decision prototype into an order-level, event-driven, model-assisted fulfilment controller with real domain actions and verified replanning.**

### 3.3 What already exists and should be reused

| Existing asset | What is genuinely implemented | How the upgrade should use it |
|---|---|---|
| Manufacturing records and rules | Sales, engineering, planning, purchasing, inventory, production, quality, maintenance, accounts, people, spend, customer care, integrations, and governance are represented as working modules | Treat them as the truth and deterministic action layer; do not rebuild them inside the AI |
| Agent graph contract | Versioned graphs with agent, capability, transform, branch, approval, and verification nodes | Extend the contract rather than replace it |
| Graph validator | Rejects missing dependencies, invalid agents, unbounded retries, underfunded step budgets, and cycles | Retain fail-closed compilation; add explicit safe loop and event-wait constructs rather than permitting arbitrary cycles |
| Parallel-wave engine | Runs dependency-ready nodes concurrently and checkpoints every wave | Reuse for independent evidence analysis and candidate evaluation |
| Durable mission records | Mission, node, event, checkpoint, approval, and action history survive request boundaries | Evolve them into long-running order missions and plan versions |
| Approval ancestry | Side effects fail when no successful human approval exists upstream | Generalize into risk-tiered policy ancestry while preserving mandatory approvals |
| Capability registry | Agents are limited by allowed capability prefixes, allow-lists, input validation, and the user’s permissions | Add narrow fulfilment actions and verifiers through the same controlled boundary |
| Execution safety | Idempotency, timeouts, retries, execution leases, stale-worker protection, and recovery sweeps are already tested | Keep these controls around every new AI or domain action |
| AI governance | Closed feature registry, kill switch, opt-out, usage controls, model-call audit, deterministic fallback, and guarded local-model adapter | Reuse the governance chokepoint for the real Agent OS reasoner |
| Decision Commander | Joins current sales, planning, supply, quality, and maintenance evidence into deterministic risk cards and confidence explanations | Use as the order-mission intake and exception surface |
| Knowledge and outcome views | Evidence relationships, organizational memory, and outcome metrics are visible | Promote only automatically verified mission outcomes into memory |
| Investor UX | Mission Control, graph progress, approvals, action ledger, Control Center, guided demo, and real-versus-simulated disclosure already exist | Refocus them around one fulfilment mission instead of a generic nine-agent review |
| Northstar story | A coherent 120-unit PX-400 order crosses sales, planning, procurement, inventory, production, quality, maintenance, and finance | Reuse it as the autonomous mission scenario instead of inventing a second demo universe |

### 3.4 Manufacturing capability assessment

| Area | Current usable capability | Gap for autonomous fulfilment |
|---|---|---|
| Sales | Create and amend orders, run a credit gate, confirm demand, dispatch stock, calculate tax, raise the customer invoice, and create the receivable | The AI lacks a fulfilment-mission trigger tied automatically to order confirmation and a verified delivery objective |
| Engineering | Item and BOM definition, BOM snapshots for production, product structure, and where-used analysis | No engineering change request/order lifecycle, effectivity control, qualified substitution flow, or shipped-serial revision trace; active-version uniqueness must be enforced before autonomous MRP because more than one BOM version can currently remain active |
| Planning | Forecast consumption, MPS/ATP, multi-level MRP, netting, lot sizing, lead-time offset, pegging, exceptions, capacity loading, dispatch-rule schedules, and planned-order conversion | No multi-candidate order-level strategy optimizer, no plan/critic lifecycle, no versioned fulfilment plan, and no event-driven replan; current make-order conversion loses need-date and peg context, undated supply is treated optimistically, capacity findings are diagnostic, and MRP/production scrap calculations must be reconciled |
| Procurement | Supplier master, purchase order, workflow approval, amendment, goods receipt, and open-supply view | A planned buy becomes a requisition, but there is no traceable requisition-to-PO conversion, governed sourcing rule, vendor/price selection path, or autonomous supplier-promise loop |
| Inventory | One controlled stock write path, balance and append-only ledger, batch-aware FIFO issue, receipts, issues, transfer behavior, and quarantine movements | There is no persisted sales-order reservation/available-to-promise allocation or explicit quality-release stock state that the autonomous mission can commit and verify |
| Production | Production-order creation from a plan, pinned BOM, component issue, operation sequence, operator evidence, reject quantities, final receipt, and production events | Open production supply has no reliable due date; published schedules do not update Production execution state; physical progress remains manual or simulated |
| Quality | Sampling plans, inspection requests, readings, deterministic verdicts, disposition, quarantine, NCR, CAPA, and effectiveness verification | Required inspection creation is not universally derived from an order plan; repeated disposition quantities are not cumulatively bounded; dispatch must be blocked by an explicit quality-release state, not merely by remaining finished-goods quantity; qualified dispositions must remain outside AI authority |
| Maintenance | Assets, work orders, downtime, preventive maintenance, spares, reliability, and planning downtime inputs | Live mission impact and resource recovery are not yet correlated automatically to an affected order plan |
| Finance | Customer invoicing and receivables are integrated with dispatch; exact tax and accounting rules exist | Direct-material supplier invoice, three-way match, accounts payable, and payment are absent and remain outside the investor fulfilment scope |
| External world | Honest simulator-only factory command path and broad event records | No supplier/logistics world simulator currently drives a persistent order mission from acknowledgement through delay and delivery |

Other project-wide gaps remain relevant even though they are not required for the order-triggered MVP:

- there is no lead/opportunity pipeline before an order;
- there is no quotation document, revision, validity, or quote-to-order conversion;
- employee and budget records use cost-centre vocabularies that are not fully unified, so some budget-control joins can fail;
- the supplied count-based sampling model has no appropriate default for bulk material measured by mass; and
- several product and operator documents describe an earlier, smaller version of the project.

These should stay visible in the broader product roadmap. They must not be quietly represented by static demo copy as though the underlying workflow exists.

### 3.5 Agent OS assessment

The current Agent OS is a strong foundation but not yet a fully agentic fulfilment runtime.

#### What the runtime already does well

- validates and snapshots registered graphs;
- uses explicit node kinds and dependency edges;
- executes independent ready nodes in parallel;
- enforces maximum steps, attempts, deadlines, and no-progress failure;
- persists checkpoints and structured evidence;
- resumes after attributable human approval;
- records approval decisions separately from resumed execution and preserves the approver identity;
- repeats user permission checks inside capability calls;
- enforces agent capability allow-lists;
- fails closed on unapproved side effects;
- survives interrupted executions through bounded recovery; and
- exposes honest provider and external-connection disclosure.

#### What prevents the current runtime from meeting the new claim

1. **Graphs are fixed acyclic workflows.** The validator deliberately rejects cycles. There is no explicit bounded-loop node, event-wait node, or governed re-entry path.
2. **Agent reasoning is deterministic.** Agent and verification nodes call a deterministic summarizer with a fixed confidence value; the real model adapter used by narrow product features is not connected to Agent OS reasoning. The current summarizer also does not use the node instruction or order-specific mission input to decide what to investigate.
3. **The mission horizon is short.** Current graphs are bounded reviews with minute-scale timeouts, not persistent order missions that wait days, resume on events, and maintain changing commitments.
4. **Actions are generic work items.** Eighteen capabilities read, analyze, simulate, or draft. The sole side-effecting capability writes a governed dispatch record; it does not create a purchase order, reserve inventory, release a work order, or verify a domain postcondition.
5. **Signals are manually ingested.** An endpoint can start a mission from a typed signal, but the general event stream currently has a demonstration consumer rather than automatic order-mission correlation and wake-up. Every accepted signal starts the same graph, rather than resuming the affected order mission.
6. **Recovery options are predefined descriptions.** Decision Commander’s options are useful and evidence-linked, but they are not model-compared, deterministically simulated candidate fulfilment plans.
7. **Branching and verification are mostly structural.** A branch node type exists but no registered graph uses it. Verification proves registration, tenancy, evidence presence, and approval ancestry; it does not yet verify the business postcondition of every fulfilment action.
8. **Memory is not an autonomous learning loop.** Outcomes can be recorded and linked, but successful verified mission patterns are not automatically promoted through a controlled review process.
9. **Approval is not yet bound to a dynamic action plan.** The existing fixed graph limits current risk, but a future approval must cover an immutable plan version and the exact action parameters. Protected action classes must also enforce proposer/creator separation from approver where policy requires it.
10. **There is no completed action-result or compensation lifecycle.** The current append-only dispatch proves that a governed work item was created, not that a domain command succeeded. Partial success, reconciliation, safe compensation, and terminal failure paths must be explicit.
11. **Every side effect requires the same human-gate shape.** There is not yet an action-level autonomy envelope for routine reversible actions versus material commercial, quality, engineering, or safety decisions.

### 3.6 Precise architecture delta

| Current state | Keep | Add for the investor MVP |
|---|---|---|
| Seven fixed mission graphs | Validation, snapshots, dependencies, branch, approval, and verification | One approved order-fulfilment template plus explicit wait, bounded-loop, and validated-plan-patch behavior |
| Deterministic Agent OS summaries | Evidence structure, disclosure, fallback, audit | Real structured model decisions for investigation, candidate comparison, explanation, and bounded tool selection |
| Nine visible roles called in broad reviews | Role ownership and capability isolation | Sparse invocation: one order supervisor, only relevant specialists, and one independent critic/verifier |
| Read-heavy capability catalogue | Validation, user authority, agent allow-list, audit | Narrow domain actions, deterministic simulators, and explicit postcondition verifiers |
| One generic governed work-item action | Approval ancestry, idempotency, immutable evidence | Actual order-scoped business actions within policy, still mediated by the existing domain rules |
| Manual signal ingestion | Typed events and idempotent event identity | Automatic mission correlation, impact analysis, wake-up, and affected-subgraph replanning |
| Deterministic risk cards | Cross-domain joins, confidence explanation, evidence links | Order objective, candidate plans, plan versions, action state, next event, and outcome forecast |
| Manually linked outcome memory | Evidence graph and verified-outcome concept | Automatic postcondition capture and controlled promotion of successful recovery patterns |
| Guided manual Northstar journey | Scenario, business records, disclosure, and presentation quality | One-click autonomous mission, real AI choice, supplier disruption, one approval, and verified completion |

The autonomous mission also needs one trace spine linking:

> sales-order line → demand peg → plan version → reservation/requisition/purchase order/work order → material lot or serial → inspection release → shipment and invoice

Without this chain, the system can create individually valid records but cannot prove that they collectively fulfilled the original customer objective.

### 3.7 Reuse-first upgrade rule

The MVP should not replace the current Agent OS with an unrelated agent framework. The repository already contains the difficult governance and manufacturing boundaries that generic agent frameworks do not provide.

The upgrade should preserve those guarantees and add only the missing primitives:

1. an order objective and versioned fulfilment-plan lifecycle;
2. a real bounded structured reasoner for Agent OS;
3. explicit loop and event-wait behavior;
4. approved candidate-plan generation and deterministic simulation;
5. narrow domain action, action-result, postcondition, reconciliation, and compensation capabilities;
6. automatic event-to-mission correlation;
7. immutable plan/action digests bound to approvals;
8. independent plan critique and outcome verification; and
9. risk-tiered autonomy with human-on-exception and required separation of duties.

### 3.8 Real, simulated, and manually orchestrated boundary

The present demo combines substantial real domain behavior with a manually composed story:

| Category | Current reality |
|---|---|
| Real and deterministic | Order and credit rules, BOM and planning calculations, inventory movements, production records, quality verdicts and dispositions, tax, invoices, receivables, permissions, approvals, audit, and durable graph mechanics |
| Model-assisted but not fulfilment-controlling | Narrow registered explanation, extraction, triage, and narration features can use a local model; the Agent OS fulfilment path itself currently uses deterministic summaries |
| Simulated | Factory commands and external integration responses are governed simulations; seeded external adapters are fake by design |
| Manually orchestrated | Demo scripts advance planning, procurement, production, quality, dispatch, and presentation in a prescribed sequence; a confirmed sales order does not yet cause those steps autonomously |
| Static presentation surfaces | Several Working Capital and Quality workspace views render hard-coded page definitions and metrics rather than live mission state, despite older presenter documentation claiming there are no mock screens |

The existing automated checks are valuable but do not yet prove the new claim. Most current browser scenarios verify navigation, presenter behavior, and the governed fixed graph. In the primary guided tour, saving any qualifying order or purchase order unlocks the next presentation step, but its identifier is not carried into later planning, production, quality, or finance steps; those screens return to pre-seeded Northstar facts. The MVP therefore needs a golden acceptance test that begins with only an approved sales order and verifies the same order identity through the complete downstream document, inventory, quality, commercial, event, and audit state.

### 3.9 Deployment and presentation readiness

The local project checks and demo matrix pass, and the hosted web shell returned successfully during this audit. However, a browser-level check of the hosted Commander reported that it could not reach the application server while a required public-header request stalled. A successful page response is therefore not sufficient evidence that the investor flow is healthy.

Before every investor session, require one hosted end-to-end smoke test that proves:

1. the web experience loads;
2. live mission data is returned within a defined timeout;
3. the correct isolated demo identity and permissions are applied;
4. one read and one safe write complete through the full path;
5. the order mission can pause and resume; and
6. the final outcome view loads from persisted evidence.

The ignored local deployment-environment files also contain live-looking credentials in plaintext and are readable beyond the owner account. They were not found in tracked history, but their permissions should be restricted and any credentials that may have been displayed, logged, copied, or shared should be rotated. No secret value belongs in documentation, test output, screenshots, or an investor handoff.

### 3.10 Documentation and test-confidence gaps

The repository’s runtime has advanced faster than several written claims:

- the main project and operator documents contain conflicting module, migration, test, CI-job, hosting, and demo-date statements;
- the presenter guide says all screens are live even though some finance and QMS workspaces are static presentation definitions;
- the reported test total is hard-coded and lower than the current executable total; and
- 36 browser-test declarations exist, but the mandatory CI paths exercise only a subset and omit several primary guided-demo, Commander, controlled-autonomy, finance/QMS, and agent-story suites.

Investor-facing facts must be generated from executable project metadata wherever possible. Before release, replace contradictory snapshots with one dated runbook, make the critical end-to-end investor flow mandatory in CI, and add assertions that every screen and figure is correctly labelled as live, derived, seeded, simulated, or illustrative.

### 3.11 Current source-of-truth references

The most relevant implementation evidence is:

- [Agent OS contracts](packages/platform/src/agent-os/types.ts);
- [graph validation and parallel readiness](packages/platform/src/agent-os/graph.ts);
- [mission engine](apps/api/src/agent-os/agent-graph.engine.ts);
- [registered mission graphs](apps/api/src/agent-os/graph-registry.service.ts);
- [current deterministic Agent OS reasoner](apps/api/src/agent-os/agent-reasoner.service.ts);
- [capability registry](apps/api/src/agent-os/capability-registry.service.ts);
- [governed action boundary](apps/api/src/agent-os/agent-action.service.ts);
- [AI governance and provider routing](apps/api/src/ai/ai-router.service.ts);
- [decision-intelligence layer](apps/api/src/agent-os/decision-intelligence.service.ts);
- [current demonstration event consumer](apps/api/src/bus/event-consumer.ts);
- [planning and planned-order conversion](apps/api/src/modules/planning/planned-order.service.ts);
- [manufacturing requirement planning](apps/api/src/modules/planning/mrp.service.ts);
- [production execution](apps/api/src/modules/production/production.service.ts);
- [sales fulfilment and dispatch](apps/api/src/modules/sales/sales.service.ts);
- [guided investor scenario](apps/web/src/spine/demo/demo-scenarios.ts);
- [guided-demo event bridge](apps/web/src/spine/demo/demo-events.ts);
- [Working Capital presentation workspace](apps/web/src/modules/working-capital/workspace.tsx);
- [Quality presentation workspace](apps/web/src/modules/quality/workspace.tsx); and
- [verified capability gaps](docs/02-investor-demo/02-capability-gaps.md).

---

## 4. Research conclusion: why the architecture must be hybrid

The choice between a “loop” and a “graph” is a false choice for this product. Manufacturing fulfilment needs both, at different levels.

- A **graph** provides the explicit lifecycle, dependencies, checkpoints, parallel branches, approvals, resumability, and auditability required for a long-running order.
- A **bounded loop** provides adaptive investigation and decision-making where the next useful step cannot be completely predetermined.
- **Deterministic engines** decide feasibility and compute exact consequences.
- **Policy gates** decide what may be executed automatically.
- **Events** wake the mission when the world changes.

The resulting design is:

> **A policy-governed, event-driven state graph, with bounded Plan–Act–Verify reasoning loops inside selected decision nodes.**

The short name used in this plan is **Graph of Bounded Loops**.

### 4.1 Pattern comparison

| Pattern | Strength | Weakness in manufacturing | Decision for XELOR |
|---|---|---|---|
| Prompt chain | Predictable transformation through fixed steps | Cannot adapt well to disruptions or uncertain evidence | Use for small, fixed transformations only |
| Router | Efficiently sends a request to the right specialist | Routing alone does not own an end-to-end objective | Use for evidence and specialist selection |
| Parallel workers | Reduces time for independent analyses | Conflicting writes and stale reads create coordination risk | Use only for read-only analysis on the same state snapshot |
| Evaluator–optimizer | Improves a draft through critique | Can loop indefinitely and an AI critic can still be wrong | Use with deterministic tests and a strict revision limit |
| ReAct tool loop | Adapts its next investigation step from observed evidence | Cost and error compound across long horizons | Use only inside bounded investigation nodes |
| Planner–executor | Separates deciding from doing | A model-generated plan may be infeasible or unsafe | Use only when every plan is compiled and verified before action |
| Static workflow graph | Auditable, resumable, and easy to govern | Cannot encode every future exception | Use as the mission backbone |
| Dynamic graph | Can adapt structure to novel situations | Unrestricted graph generation is difficult to validate | Allow only small patches composed from approved node types |
| Peer-agent swarm | Useful for broad, highly decomposable exploration | Communication overhead, coordination failure, unclear authority, and poor fit for sequential operations | Do not use as the control architecture |
| Hybrid graph plus bounded loops | Combines control with adaptation | Requires careful boundaries and evaluation | **Chosen architecture** |

### 4.2 Why not a single open-ended agent loop

A sales-order mission may last days or months, wait on external parties, encounter approvals, and change after partial execution. Keeping one model loop alive across that horizon would be hard to resume, expensive, difficult to audit, and vulnerable to compounding error.

The mission must instead persist as explicit state. The model is invoked only when a decision is needed, receives the current trusted state, works within a bounded budget, and returns a structured proposal. The mission graph then continues, waits, verifies, or escalates.

### 4.3 Why not a fully fixed graph

A fixed graph is suitable for known order paths but brittle when a supplier fails, a machine becomes unavailable, a quality hold appears, or several recovery choices are possible. XELOR therefore needs controlled adaptive nodes that can investigate evidence, compare recovery strategies, and propose a limited plan revision.

### 4.4 Why not a swarm of nine autonomous agents

Order fulfilment is a tightly coupled, mostly sequential objective. Independent peers can optimize their own departments at the expense of the whole order, duplicate work, exchange unsupported conclusions, or create conflicting actions.

XELOR should use sparse, hierarchical coordination:

- one supervisor owns the order-level objective;
- specialists are called only for scoped analysis or proposals;
- all communication is mediated through the mission state;
- all actions return through one governed action boundary; and
- an independent verifier checks claims and results.

An “agent” is a role and capability boundary, not necessarily a separate model or an always-running process.

---

## 5. Chosen architecture: Policy-Governed Graph of Bounded Loops

### 5.1 Governing rule

> **The graph controls what may happen; bounded agents decide what should happen at designated decision points; deterministic systems determine what can happen; policy determines what is allowed to happen; verification proves what actually happened.**

### 5.2 Conceptual architecture

```text
Approved customer order
        │
        ▼
Order objective and hard constraints
        │
        ▼
Evidence routing and parallel read-only analysis
        │
        ▼
Trusted mission state ────────────────┐
        │                              │
        ▼                              │ external or internal event
Candidate plan generation              │
        │                              │
        ▼                              │
Bounded AI planning and critique loop  │
        │                              │
        ▼                              │
Deterministic feasibility verification │
        │                              │
        ▼                              │
Policy and approval gate                │
        │                              │
        ▼                              │
Controlled business action              │
        │                              │
        ▼                              │
Independent postcondition verification  │
        │                              │
        ▼                              │
Wait / continue / replan / escalate ────┘
        │
        ▼
Verified customer outcome
```

### 5.3 The five control planes

The architecture is easiest to understand as five conceptual planes. These are responsibility boundaries, not technology products.

#### Mission control plane

Owns the durable order objective, lifecycle stage, dependency graph, checkpoints, plan versions, deadlines, and completion criteria. It knows where the mission is and what can run next.

#### Decision plane

Invokes the supervisor and specialists only at approved decision nodes. It supports evidence gathering, diagnosis, strategy comparison, explanation, and small plan revisions.

#### Truth and constraint plane

Provides authoritative order, product, material, inventory, supplier, resource, quality, cost, and policy facts. It also provides deterministic calculations and feasibility checks. The AI may interpret these results but may not replace them.

#### Governance plane

Applies authority, risk, approval, segregation-of-duties, freshness, budget, and safety rules. It records why an action was allowed, rejected, or escalated.

#### Execution and observation plane

Carries out approved business actions, receives acknowledgements and real-world events, and verifies postconditions. For the investor MVP, external-world observations are simulated but clearly labelled.

### 5.4 The four nested loops

The design uses four different loops. Each exists for a different reason.

#### Loop A — Mission lifecycle loop

```text
Observe → Diagnose → Plan → Authorize → Execute → Verify → Wait or Replan
```

This is the long-running order loop. It is persisted as mission state and is not one continuous model conversation.

#### Loop B — Plan and critique loop

```text
Gather evidence → Generate candidates → Simulate → Compare → Critique → Accept or revise
```

This loop is used when more than one feasible strategy exists. It has a maximum of two revisions in the MVP. Acceptance requires deterministic feasibility checks; the critic cannot approve its own unsupported claim.

#### Loop C — Specialist investigation loop

```text
Question → Select permitted read capability → Observe evidence → Assess sufficiency
```

This is a short ReAct-style loop for questions such as “Which material causes the delivery risk?” or “Is an alternate supplier actually qualified?” It ends when the evidence requirement is met, a budget is reached, or a human decision is needed.

#### Loop D — Action and verification loop

```text
Propose → Refresh state → Check preconditions → Authorize → Execute → Verify postconditions
```

This is not an open reasoning loop. It is a controlled action protocol. If verification fails, the action is not reported as successful; the mission moves to retry, compensate, replan, or escalate according to policy.

### 5.5 Mandatory loop boundaries

Every AI loop must declare:

- its objective;
- permitted evidence sources;
- permitted read and proposal capabilities;
- a maximum number of reasoning/tool steps;
- a maximum number of plan revisions;
- a time and cost budget;
- an evidence sufficiency test;
- a success condition;
- a no-progress condition;
- an escalation condition; and
- what state it is allowed to change.

No production loop is allowed to run “until the model feels done.”

### 5.6 Event-driven operation

The system should be dormant while nothing relevant has changed. It wakes when an event may affect a commitment, for example:

- order approved, changed, cancelled, or placed on hold;
- engineering revision released or superseded;
- inventory reserved, consumed, rejected, or adjusted;
- supplier promise accepted, delayed, short-shipped, or failed;
- resource capacity changed;
- work operation started, completed, paused, or scrapped;
- quality result passed, failed, or requires disposition;
- approval granted, rejected, or expired;
- cost or margin crossed a policy boundary;
- dispatch or delivery status changed; or
- data required by the current plan became stale.

On each event, XELOR first performs impact analysis:

1. **No mission impact:** record it and continue.
2. **Known deterministic response:** apply the approved response path.
3. **Several feasible responses:** invoke a bounded recovery-planning loop.
4. **No permitted response or high-risk impact:** escalate with evidence and options.

### 5.7 State, evidence, and memory

The authoritative mission state—not agent conversation—is the source of truth.

Every material fact used by the AI should carry:

- source;
- timestamp;
- freshness status;
- unit and scope;
- confidence or uncertainty where relevant;
- current revision/version; and
- links to supporting business evidence.

The AI may use four memory types:

| Memory type | Purpose | Write rule |
|---|---|---|
| Working memory | Current mission facts and reasoning context | Rebuilt from trusted state at each decision |
| Episodic memory | What happened in earlier steps of this mission | Written only from verified events and outcomes |
| Semantic memory | Approved factory knowledge, policies, definitions, and playbooks | Curated and version-controlled by authorized owners |
| Procedural memory | Approved graph templates and recovery patterns | Changed only through controlled review |

Free-form model conclusions do not become permanent memory merely because a model stated them.

### 5.8 Safe dynamic planning

The AI must never invent an arbitrary executable workflow. Dynamic planning follows a four-level ladder:

1. **Approved template:** select the standard order-fulfilment graph.
2. **Template plus parameters:** choose approved branches, priorities, and values.
3. **Validated graph patch:** propose a small subgraph made only from approved node types and capabilities; compile and verify it before insertion.
4. **Human escalation:** if no approved composition can represent the situation, stop and request a decision.

Every inserted patch inherits the mission’s authority limits, budgets, approval rules, and verification requirements.

Before authorization, the complete executable proposal is frozen as an immutable plan version. The approval record must bind to a digest covering the action types, targets, parameters, expected consequences, and relevant evidence versions. Any material change invalidates that approval and returns the proposal to policy evaluation.

### 5.9 Industrial control boundary

XELOR operates at manufacturing operations and business-planning levels. It may coordinate orders, schedules, materials, quality workflows, and commercial decisions. It must not bypass machine controls, safety controllers, emergency stops, validated process limits, or qualified human sign-off.

In ISA-95 terms, the AI coordinates mainly across Levels 3 and 4. Levels 0–2 remain under deterministic industrial control and established safety systems.

---

## 6. Who controls what

The architecture deliberately separates language reasoning, exact computation, authority, execution, and verification.

| Responsibility | AI | Deterministic logic | Policy or human authority |
|---|---:|---:|---:|
| Interpret customer intent and summarize constraints | Primary | Validate required fields | Resolve commercial ambiguity when material |
| Decide which evidence to investigate | Primary within budget | Enforce source permissions | Escalate inaccessible or sensitive evidence |
| Identify conflicts, gaps, and risks | Primary | Confirm rule violations and calculations | Judge unresolved business trade-offs |
| Explode product structure and calculate material need | Explain result | **Authoritative** | Approve exceptional substitutions |
| Calculate availability, capacity, cost, tax, and margin | Compare implications | **Authoritative** | Approve threshold exceptions |
| Generate recovery strategies | Primary | Generate/validate feasible candidates | Approve strategies outside autonomy envelope |
| Select among feasible strategies | Recommend or choose within policy | Enforce hard constraints | Decide high-risk trade-offs |
| Create or change business records | Propose and invoke permitted action | Validate and execute | Approve protected actions |
| Change engineering definition | Draft rationale only | Validate revision and effectivity | **Qualified human authority required** |
| Change a physical inventory fact | Never infer from text alone | Record verified movement/event | Physical or authorized confirmation required |
| Release quality disposition | Explain evidence and propose | Validate limits and status | Qualified approval where required |
| Control machines or safety functions | No | Established industrial controls | Authorized plant procedures |
| Claim mission success | Summarize evidence | **Verify all completion conditions** | Accept exceptions where policy allows |

### 6.1 Non-negotiable action boundary

No model response directly edits an authoritative business state. A material action follows this sequence:

1. produce a structured action proposal;
2. refresh the facts on which it depends;
3. reject stale or superseded proposals;
4. check required fields and preconditions;
5. run deterministic feasibility and business-rule checks;
6. evaluate policy, risk, and approval requirements;
7. execute through the relevant controlled capability;
8. verify the expected postcondition independently; and
9. append the action, evidence, decision, and result to the mission history.

Repeated delivery of the same instruction must not produce duplicate purchase orders, work orders, reservations, approvals, or invoices.

Each protected action also declares whether the proposer or mission creator is prohibited from approving it. Approval is an attributable grant of authority, not merely a button that advances the graph.

### 6.2 Truth hierarchy

When sources disagree, use this order:

1. verified physical or transactional event;
2. current authoritative business record;
3. deterministic calculation from current records;
4. approved policy or procedure;
5. curated reference knowledge;
6. AI inference;
7. unverified external or user-supplied text.

AI inference can guide investigation. It cannot silently overrule a higher source.

---

## 7. Agent roles and coordination

The investor interface may show distinct XELOR specialists, but the control model remains hierarchical and sparse.

### 7.1 Core mission roles

#### ONYX — Fulfilment supervisor

Owns the end-to-end customer commitment. ONYX:

- maintains the objective and current plan;
- decides which specialist analysis is required;
- reconciles cross-functional trade-offs;
- presents candidate strategies;
- requests approvals;
- chooses permitted actions;
- responds to events; and
- closes only after independent verification.

ONYX is the only AI role allowed to propose changes to the order-level plan.

#### HEXA — Policy and evidence verifier

Acts independently from the proposing role. HEXA:

- checks evidence coverage and freshness;
- verifies that deterministic tests were run;
- checks policy and approval ancestry;
- identifies unsupported assumptions;
- challenges plan contradictions; and
- verifies completion evidence.

HEXA may reject or return a proposal for revision. It does not bypass deterministic checks or grant human authority.

### 7.2 Scoped specialist roles

Specialists are invoked as workers for narrow questions; they do not privately hand the mission to one another.

| Specialist | Scope in the order mission |
|---|---|
| MICA — Sales & Product Care | Customer commitment, commercial terms, delivery priorities, complaints, warranty, and after-sales implications |
| SPAR — Supply | Inventory exposure, shortages, reservations, supplier evidence, procurement alternatives, and supply recovery |
| AXLE — Engineering & Planning | Product definition, revision readiness, BOMs, routings, material plans, capacity, schedules, and planning constraints |
| KILN — Operations & Quality | Production execution, inspections, quality holds, nonconformance, maintenance, and shop-floor recovery |
| RASP — Finance & Working Capital | Cost, margin, cash, supplier commitments, stock-holding exposure, controls, workforce, and payroll impact |
| RELAY — Managed Services | XELOR service incidents, changes, service levels, customer updates, and integration-service coordination |
| ACHILES — Platform Assurance | Private availability and platform-health evidence, escalating failures to RELAY and the accountable owner |

Not every mission invokes every specialist. A role that cannot materially improve the decision is not called.

### 7.3 Coordination rules

- The supervisor sends a scoped question, evidence snapshot, output contract, and budget.
- Independent read-only investigations may run in parallel on the same versioned state.
- Dependent planning and execution steps remain sequential.
- Specialists return evidence, uncertainty, risks, and proposals—not final authority.
- The supervisor resolves disagreements using hard constraints and the mission objective.
- The verifier reviews the resulting plan independently.
- No hidden agent-to-agent conversation is treated as evidence.
- No specialist can enlarge its own authority or tool access.

### 7.4 Manufacturing holon mapping

The design borrows a useful separation from holonic manufacturing research:

- **Order authority:** owns the customer mission and task progress.
- **Product authority:** owns approved product knowledge and revision status.
- **Resource authorities:** own current material, supplier, equipment, labour, and capacity facts.
- **Staff advisers:** analyze, predict, compare, and recommend.

The AI roles are primarily **staff advisers and mission coordinators**. They do not become the authoritative product, resource, or transaction record.

---

## 8. Planning strategy

### 8.1 Planning begins with an objective, not a chat prompt

For each accepted sales order, the mission objective should include:

- promised product, quantity, destination, and required date;
- applicable product revision and quality requirements;
- customer and contractual priorities;
- hard safety, regulatory, engineering, and commercial constraints;
- available autonomy envelope;
- target service level, cost, margin, and risk tolerance; and
- explicit completion and failure conditions.

### 8.2 Hard constraints versus soft objectives

The planner must never trade away a hard constraint to improve a soft objective.

**Hard constraints** may include:

- released engineering definition;
- qualified materials and suppliers;
- required inspections and quality holds;
- resource compatibility;
- policy and legal boundaries;
- segregation of duties;
- customer-mandated specifications;
- non-negative confirmed inventory; and
- safety limits.

**Soft objectives** may include:

- earliest reliable delivery;
- highest margin;
- lowest expedite cost;
- lowest operational risk;
- least schedule disruption;
- preferred supplier allocation; and
- minimal human intervention.

The investor MVP should expose the trade-off weights so the audience can see why a plan was selected.

### 8.3 Candidate-plan method

The recommended planning method is:

1. instantiate the approved fulfilment template;
2. collect a consistent evidence snapshot;
3. calculate exact requirements and constraints;
4. generate several feasible candidate strategies using deterministic planning and approved options;
5. let the AI compare the candidates, explain trade-offs, and propose small allowed adjustments;
6. simulate the expected consequences;
7. run independent critique;
8. re-run all feasibility and policy checks;
9. accept, revise within the strict limit, or escalate; and
10. freeze a versioned plan before execution.

This is stronger than asking a language model to invent a long list of steps from scratch. Research on long-horizon planning shows that language models are useful for interpreting and decomposing goals, while formal planners and domain checks are more reliable for feasibility.

### 8.4 Plan contents

Every accepted plan should make the following visible:

- the order objective and current plan version;
- assumptions and their evidence;
- hard constraints and optimization priorities;
- milestones and dependencies;
- required records and actions;
- owner or authority for each action;
- planned start and completion conditions;
- approval requirements;
- expected cost, margin, and delivery effect;
- known risks and contingency branches;
- verification test for every material step; and
- replan triggers;
- immutable action digest and required approver separation; and
- compensation or reconciliation path for partial success.

### 8.5 Replanning rules

Replanning is not a complete restart by default. It should preserve completed, still-valid work and change only the affected future subgraph.

On a material event, the supervisor should:

1. identify which assumptions and actions are invalidated;
2. lock completed and irreversible steps;
3. calculate the current gap to the objective;
4. generate recovery candidates;
5. compare delivery, cost, margin, quality, and operational impact;
6. request approval if the recovery leaves the autonomy envelope;
7. publish a new plan version with a visible difference summary; and
8. verify that all pending actions now reference the current plan.

Typical replan triggers include:

- supplier delay threatens a milestone;
- incoming material fails inspection;
- capacity falls below the plan;
- scrap or rework changes the material or schedule need;
- product revision or customer quantity changes;
- expedite cost crosses a threshold;
- projected margin falls below the floor;
- required evidence expires; or
- a postcondition fails after execution.

### 8.6 Stopping and escalation

The mission must stop, pause, or escalate when:

- no feasible plan satisfies hard constraints;
- evidence remains insufficient after the investigation budget;
- candidate plans produce materially different high-risk outcomes;
- required approval is rejected or expires;
- the same action repeatedly fails verification;
- the model or specialist makes no progress;
- the cost or time budget is exhausted;
- a policy conflict cannot be resolved; or
- a safety, regulatory, engineering, quality, treasury, or legal decision requires qualified authority.

---

## 9. Order-to-fulfilment AI plan

This section defines what the AI layer does after an order is approved. It focuses on orchestration and decisions, not ordinary ERP data entry.

### Phase 1 — Accept and understand the mission

The supervisor:

- reads the approved order and customer commitment;
- separates explicit requirements from assumptions;
- identifies missing or conflicting terms;
- establishes the product revision, quantity, due date, destination, and commercial envelope;
- creates success criteria; and
- pauses for clarification only if the ambiguity could materially change the plan.

**Output:** a verified order objective and evidence checklist.

### Phase 2 — Establish product and engineering readiness

The product/engineering specialist:

- checks that the correct product revision is released and effective;
- confirms the required product structure and process definition exist;
- identifies missing approvals, obsolete references, or unresolved change notices;
- checks whether proposed alternatives are already approved; and
- explains engineering blockers to the supervisor.

The AI may draft a change request or substitution rationale. It may not approve a new design, release an engineering revision, or invent a technical substitution.

**Output:** engineering-ready status, constraints, and any qualified-human decision required.

### Phase 3 — Calculate fulfilment feasibility

The mission combines exact calculations with AI interpretation:

- material requirements and timing;
- available and reservable inventory;
- existing supply and demand conflicts;
- supplier qualification and promise evidence;
- production routing and capacity;
- inspection and release lead times;
- expected cost, margin, and delivery confidence; and
- risks and dependencies.

Independent analyses can run in parallel, but all use the same state snapshot.

**Output:** a consistent constraint model and list of feasible candidate strategies.

### Phase 4 — Select the fulfilment strategy

The supervisor compares at least three meaningful candidates, such as:

- standard procurement with normal production sequence;
- split sourcing with partial expedite;
- alternative approved resource allocation or resequencing.

For each candidate it shows:

- estimated completion date;
- confidence and major uncertainty;
- incremental cost;
- margin effect;
- supplier and capacity risk;
- required approvals; and
- operational disruption.

The verifier challenges unsupported claims. Deterministic checks decide whether each candidate is feasible. The supervisor selects only within policy; otherwise it presents the options to the human decision-maker.

**Output:** a versioned, verified, authorized fulfilment plan.

### Phase 5 — Commit materials, supply, and work

The mission proposes and, where authorized, carries out the required actions in dependency order:

- reserve available inventory;
- create or revise planned supply;
- prepare and release purchase commitments within the approved envelope;
- create work orders and operations;
- assign available resources and planned dates;
- establish inspection and quality checkpoints; and
- set milestone watchers.

Every action is preceded by a fresh-state and precondition check and followed by independent postcondition verification.

**Output:** committed, traceable supply and production actions linked to the current plan.

### Phase 6 — Monitor execution

The supervisor does not continually “think.” It waits for meaningful events and milestone deadlines. It maintains:

- plan progress;
- delivery confidence;
- expected cost and margin;
- unresolved exceptions;
- dependency status; and
- evidence freshness.

Low-impact events follow known branches. Material events trigger impact analysis and possibly bounded replanning.

**Output:** an up-to-date mission status with evidence and next expected event.

### Phase 7 — Recover from disruption

When the simulated primary supplier reports a delay, XELOR:

1. verifies the supplier event and affected quantity/date;
2. identifies impacted milestones and downstream actions;
3. preserves completed and unaffected steps;
4. generates recovery candidates;
5. evaluates alternate supply, split allocation, expedite, resequencing, and customer-impact options;
6. calculates delivery, cost, margin, quality, and approval consequences;
7. selects a recovery within authority or requests approval;
8. publishes a new plan version; and
9. carries out and verifies only the changed future actions.

**Output:** a transparent recovery decision and revised commitment forecast.

### Phase 8 — Quality, dispatch, and commercial completion

The mission:

- confirms all required inspections and dispositions are complete;
- prevents release while mandatory holds remain;
- verifies finished quantity and customer requirements;
- coordinates dispatch readiness and delivery milestones;
- invokes the permitted commercial completion actions;
- reconciles planned versus actual cost and time; and
- validates all mission completion conditions.

The AI can summarize the quality and commercial evidence, but deterministic checks and qualified authorities retain their existing responsibilities.

**Output:** a verified outcome report, not merely a textual claim of success.

---

## 10. Autonomy and human-on-exception matrix

Autonomy is granted by action class and risk, not by agent personality.

| Tier | Action class | Default mode | Example |
|---|---|---|---|
| A0 | Read, search, summarize, explain | Automatic | Explain the source of projected lateness |
| A1 | Analyze, calculate, simulate, compare | Automatic with evidence | Compare three feasible supply strategies |
| A2 | Draft or propose a reversible business action | Automatic proposal; controlled execution | Draft a purchase commitment or work-plan change |
| A3 | Routine, reversible action inside explicit value and policy limits | Automatic execution with verification | Reserve available stock or create an approved routine work order |
| A4 | Material commercial or operational commitment | Human-on-exception or threshold approval | Pay expedite premium or change a customer promise |
| A5 | Engineering, quality, regulatory, treasury, legal, or safety authority | Qualified human mandatory | Release a design revision or approve a nonconformance disposition |

### 10.1 Approval experience

An approval request must not be a vague “Approve?” dialog. It must include:

- the objective at risk;
- what changed;
- evidence and freshness;
- feasible options considered;
- the recommended option and why;
- delivery, cost, margin, quality, and risk differences;
- action that will occur after approval;
- consequences of rejection or delay; and
- expiry time or latest useful decision point.

After approval, the mission resumes from the persisted checkpoint and revalidates any facts that may have changed while waiting.

### 10.2 Human-on-exception principle

The goal is not “no humans.” The goal is to eliminate routine coordination work while concentrating qualified human attention on decisions involving authority, ambiguity, or material risk.

---

## 11. Synthetic factory and investor scenario

### 11.1 Why mock data is appropriate

An investor MVP does not require live factory integrations to prove the control concept. It does require a coherent world in which the same business rules, actions, dependencies, and failure modes can be exercised repeatedly.

The synthetic factory must be deterministic enough for evaluation and rich enough to require genuine AI choices.

### 11.2 Scenario

- **Customer:** Northstar Process Systems
- **Product:** PX-400 Industrial Pump
- **Order quantity:** 120 units
- **Promised delivery:** 30 simulated days
- **Target gross margin:** at least 18%
- **Primary challenge:** a critical component is short
- **Available strategies:** normal primary supplier, faster higher-cost alternate supplier, or split sourcing
- **Disruption:** the primary supplier later delays the remaining commitment
- **Approval moment:** recovery requires an expedite premium or a margin exception above the autonomous threshold

The data set should include:

- released product definition and current revision;
- multi-level product structure;
- manufacturing route and inspection plan;
- current inventory and reservations;
- open supply and competing demand;
- two qualified suppliers with different price, lead time, reliability, and capacity;
- work centres with capacity calendars;
- cost and margin rules;
- policy and approval thresholds;
- a supplier-delay event;
- production and inspection outcomes; and
- dispatch and delivery events.

### 11.3 What is real and what is simulated

| Demonstration element | Status | Investor disclosure |
|---|---|---|
| AI evidence selection, reasoning, comparison, explanation, and tool choice | Real | “A real model is making bounded decisions.” |
| Mission graph, policy checks, approvals, plan versions, and audit history | Real | “These controls are operating, not animated.” |
| Business records, calculations, preconditions, and postcondition checks | Real inside the MVP | “The application is changing and checking its own coherent business state.” |
| Customer, order, product, inventory, suppliers, resources, and costs | Synthetic | “This is a seeded demonstration company.” |
| Supplier messages, machine events, physical movements, inspections, carrier events | Simulated | “The external and physical world is being simulated.” |
| Passage of operational time | Compressed | “Thirty operational days are compressed into minutes.” |

The interface should always label synthetic data and simulated events. Investor trust is more valuable than theatrical realism.

### 11.4 Simulator behavior

The simulated world should respond to committed actions rather than play a fixed video:

- a valid purchase commitment creates a supplier acknowledgement event;
- the selected supplier changes expected cost and arrival date;
- a material receipt becomes usable only after its required verification event;
- production consumes available material and capacity;
- inspection results determine whether dispatch can proceed;
- the disruption invalidates the relevant plan assumption; and
- compressed time advances only when the mission has established the required next state.

This makes the demo reproducible while still allowing the real AI to choose among valid strategies.

---

## 12. Investor demonstration

### 12.1 Demo objective

In 8–12 minutes, show one complete order mission with one disruption and one governed human decision.

### 12.2 Walkthrough

#### Scene 1 — The commitment

Open the Northstar order. Show quantity, due date, product, margin target, and the single action:

> **Fulfil autonomously**

The mission opens with explicit success criteria rather than a blank chat window.

#### Scene 2 — Evidence and readiness

Show the supervisor dispatching a small number of scoped investigations. Engineering, materials, supplier, capacity, quality, and commercial analyses may run in parallel where independent.

The audience sees:

- what question each specialist is answering;
- what evidence was used;
- whether evidence is current;
- deterministic results; and
- any uncertainty.

#### Scene 3 — Strategy comparison

Show three feasible plans side by side. Highlight delivery confidence, cost, margin, operational disruption, risk, and approvals.

The AI explains why it selected the initial plan. The verifier shows that hard constraints and evidence checks passed.

#### Scene 4 — Governed execution

Show the plan creating reservations, supply actions, work orders, checkpoints, and watchers. Each action visibly moves through:

> Proposed → Checked → Authorized → Executed → Verified

The investor should be able to open any action and see the reason, evidence, authority, and result.

#### Scene 5 — Disruption

Trigger the primary-supplier delay. The mission wakes, shows the affected milestone, and explains why the existing plan is no longer sufficient.

It generates recovery candidates without restarting completed work.

#### Scene 6 — Human-on-exception

The best recovery requires an expedite premium beyond the autonomous threshold. Show the decision brief and approve it.

The mission resumes, refreshes the underlying facts, publishes a revised plan, and executes only the affected future steps.

#### Scene 7 — Compressed fulfilment

Advance simulated time. Show material receipt, production, inspection, dispatch, and delivery events. The mission verifies each postcondition rather than narrating success in advance.

#### Scene 8 — Outcome proof

Close on the mission outcome:

- ordered versus delivered quantity;
- promised versus actual delivery;
- planned versus actual cost;
- achieved margin;
- exceptions and human decisions;
- plan versions and reason for change;
- number of autonomous versus approved actions;
- verification results; and
- complete evidence trail.

### 12.3 What the investor should understand

By the end, the investor should see that:

1. the ERP records are only the substrate;
2. XELOR owns and coordinates the outcome across departments;
3. AI handles ambiguity, investigation, strategy, and adaptation;
4. exact calculations and policies constrain the AI;
5. humans are involved for authority and material exceptions; and
6. success is independently verified.

---

## 13. Investor-facing mission experience

The primary interface should be a **Mission Control** view, not nine separate chat windows.

### 13.1 Mission header

Show:

- customer and order;
- objective;
- current lifecycle stage;
- promised date and delivery confidence;
- planned margin and current forecast;
- current plan version;
- autonomy status; and
- next expected event.

### 13.2 Mission graph

Visualize completed, active, waiting, blocked, approval, verification, and replanned nodes. Collapse routine nodes by default and allow investors to inspect the evidence behind them.

### 13.3 Decision panel

For every important decision, show:

- question being answered;
- evidence consulted;
- candidates considered;
- deterministic test results;
- AI reasoning summary;
- verifier outcome;
- authority used; and
- final result.

Do not display hidden chain-of-thought. Show concise decision rationale and evidence.

### 13.4 Exception inbox

Group only decisions that genuinely need human attention. Each card should communicate urgency, value at risk, recommended action, alternatives, and the latest useful response time.

### 13.5 Outcome and audit view

Allow a reviewer to reconstruct:

- what the system knew at each decision;
- which plan version was active;
- who or what authorized an action;
- what changed in the business state;
- whether the expected postcondition occurred; and
- how the final outcome was calculated.

### 13.6 AI disclosure

The UI must distinguish:

- authoritative fact;
- deterministic calculation;
- AI inference;
- AI recommendation;
- approved action;
- verified result;
- synthetic data; and
- simulated external event.

---

## 14. Five-week delivery plan

This is a target outcome sequence, not a technology prescription or a commitment that one developer can complete the scope in five weeks. The five-week target assumes stable MVP scope, fast product decisions, and parallel ownership across at least these workstreams:

- manufacturing domain integrity and transactional actions;
- mission orchestration, policy, and event handling;
- bounded AI decisions and evaluation;
- investor experience and simulator behavior; and
- end-to-end quality, security, deployment, and demo reliability.

One person may own more than one workstream, but enough experienced contributors must work in parallel. Before execution, estimate the repository-specific tasks, assign accountable owners, identify external dependencies, and rebaseline the calendar if those assumptions are not met.

### Week 1 — Mission definition and controlled world

Deliver:

- final Northstar scenario and seeded factory state;
- single authoritative active-BOM resolution;
- one reconciled scrap/yield calculation across planning and execution;
- preserved order peg and need date through planned-order conversion;
- cumulative quality-disposition quantity control and mandatory quality-release shipment gate;
- explicit order objective, hard constraints, and completion criteria;
- approved fulfilment graph template;
- autonomy and approval matrix;
- event catalogue;
- deterministic calculation and verification inventory;
- simulator rules; and
- golden expected outcomes for the baseline and disruption runs.

Exit test: the complete scenario can be walked manually from order approval to verified delivery with no undefined business state.

### Week 2 — End-to-end mission and action protocol

Deliver:

- durable mission lifecycle;
- implemented trace spine from sales-order line through plan, supply/work, lot or serial, quality release, shipment, and invoice;
- dependency and milestone tracking;
- plan and action versioning;
- controlled proposal, precondition, authorization, execution, and verification flow;
- immutable plan/action digests bound to approvals;
- action-result, partial-success, reconciliation, and safe compensation states;
- required proposer/approver separation for protected action classes;
- pause and resume for approval;
- evidence and audit presentation; and
- baseline fulfilment using deterministic candidate selection.

Exit test: the mission can complete without AI, every material action has a verified postcondition, and replay after any interruption neither duplicates actions nor conceals partial success. This establishes the safety harness before adding model autonomy.

### Week 3 — Real bounded AI decisions

Deliver:

- objective interpretation;
- evidence routing;
- scoped specialist investigation loops;
- candidate-plan comparison and explanation;
- independent critique;
- structured proposals;
- step, revision, time, and cost limits;
- uncertainty and escalation behavior; and
- evaluation traces for each AI decision.

Exit test: the model can choose and justify a feasible initial plan across repeated runs without bypassing deterministic checks.

### Week 4 — Events, disruption, and replanning

Deliver:

- event-driven wake-up and impact analysis;
- supplier-delay scenario;
- affected-subgraph replanning;
- human-on-exception decision brief;
- stale-state rejection and fact refresh after approval;
- revised-plan difference view; and
- recovery execution and postcondition verification.

Exit test: the mission recovers from the supplier delay without duplicating actions or rewriting completed, unaffected work.

### Week 5 — Investor experience, evaluation, and hardening

Deliver:

- Mission Control experience;
- live strategy comparison;
- action and verification timeline;
- explicit live, derived, seeded, simulated, and illustrative labels;
- one-order identity continuity through every guided-demo step;
- outcome scorecard;
- scripted 8–12 minute investor walkthrough;
- repeated-run evaluation suite;
- fault-injection scenarios;
- mandatory end-to-end investor-flow coverage in the release gate;
- automatically derived project and test facts;
- hosted full-path smoke check with latency limits;
- fallback demonstration path; and
- product claim and talk-track review.

Exit test: the full demo passes the definition of done repeatedly and can be explained without overstating autonomy.

---

## 15. Evaluation and definition of done

The model must never grade its own success. Evaluation is based on authoritative end state, deterministic checks, policy compliance, and trace review.

### 15.1 Functional success

The MVP is complete when it can:

- accept the seeded approved order;
- preserve and prove that order line’s identity through every downstream plan, document, material lot or serial, inspection release, shipment, and invoice;
- establish a correct objective and evidence set;
- generate at least three materially different feasible strategies;
- select a strategy that satisfies hard constraints;
- create and verify the required downstream actions;
- detect the supplier disruption;
- produce a valid affected-subgraph recovery;
- request and resume from the required approval;
- avoid duplicate or stale-plan actions;
- complete the simulated fulfilment lifecycle; and
- prove the final delivery, cost, margin, quality, and governance outcome.

### 15.2 AI decision quality

Score each AI decision on:

- evidence relevance and coverage;
- unsupported-claim rate;
- correct tool/capability selection;
- respect for step and authority limits;
- correct distinction between fact and inference;
- candidate comparison quality;
- escalation correctness;
- plan-revision minimality; and
- clarity of decision rationale.

### 15.3 Deterministic and policy safety

All repeated runs must demonstrate:

- zero execution of infeasible plans;
- zero bypass of mandatory approvals;
- zero direct model mutation of authoritative state;
- zero duplicated material actions;
- zero claim of success before verified postconditions;
- zero use of stale evidence when freshness is mandatory;
- zero engineering, quality, safety, legal, or treasury authority invented by AI; and
- complete traceability for every action.

### 15.4 Repeated-run reliability

Because model decisions can vary, evaluate the scenario many times with controlled variations.

Measure:

- **single-run success rate:** percentage of runs reaching the correct verified outcome;
- **all-runs reliability:** probability that every run in a set succeeds, which exposes fragile behavior hidden by a good average;
- **decision consistency:** whether different valid explanations lead to the same allowed action class;
- **recovery consistency:** whether the same disruption produces a feasible, policy-compliant recovery; and
- **boundedness:** whether all loops terminate within declared limits.

For the investor build, target 100% policy safety and deterministic validity, even if the AI selects different but equally valid strategies.

### 15.5 Fault-injection tests

Test at least:

- conflicting active BOM revisions;
- planning/execution component-quantity disagreement;
- disposition attempts whose cumulative quantity exceeds the rejected lot;
- attempted dispatch without an explicit quality release;
- missing engineering release;
- stale inventory snapshot;
- supplier delay;
- supplier short shipment;
- capacity reduction;
- inspection failure;
- rejected approval;
- expired approval;
- changed order quantity during execution;
- action acknowledgement without the expected state change;
- repeated delivery of the same event;
- contradictory evidence; and
- no feasible recovery.

Each case must end in a correct known path: continue, deterministic response, replan, compensate, pause, or escalate.

### 15.6 Investor experience quality

The demo is ready only when:

- a viewer can explain the AI’s role after one walkthrough;
- the difference between real and simulated elements is unmistakable;
- the reason for every important decision is inspectable;
- the approval moment demonstrates governance rather than weakness;
- the disruption visibly changes the future plan; and
- the outcome page proves business value rather than only technical activity.

---

## 16. Non-goals

The investor MVP will not include:

- unrestricted autonomous execution;
- direct control of machines, safety functions, or physical actuators;
- unreviewed engineering design changes;
- unreviewed quality dispositions where qualified authority is required;
- autonomous payments, treasury decisions, tax filing, or statutory submission;
- arbitrary model-generated executable graphs;
- unlimited self-reflection or background reasoning;
- agents that grant themselves capabilities;
- private peer-agent negotiations outside the mission state;
- permanent learning from unverified model output;
- claims of production-grade optimization across all plants; or
- claims that simulated supplier and factory events are live integrations.

---

## 17. Main risks and mitigations

| Risk | Consequence | Mitigation in this plan |
|---|---|---|
| Hallucinated fact or action | Wrong plan or unsafe proposal | Trusted evidence, structured proposals, deterministic validation, independent verification |
| Long-horizon error compounding | Later actions depend on an early mistake | Explicit graph checkpoints, short bounded loops, fresh state at each decision |
| Agent coordination failure | Conflicts, duplicated work, unclear ownership | One supervisor, scoped workers, shared versioned state, graph-mediated communication |
| Over-autonomy | Material commitment without authority | Risk-tiered policy, approvals, qualified-human boundaries |
| Under-autonomy | Demo feels like ordinary workflow automation | Automatic routine execution, event-driven recovery, human only at a genuine threshold |
| Stale data | Correct reasoning over obsolete facts | Freshness metadata, state refresh before action, stale-proposal rejection |
| Model self-approval | Persuasive but invalid plan | Deterministic verifier is authoritative; independent critic cannot replace rules |
| Infinite or expensive loops | Unpredictable cost and latency | Step, revision, time, cost, and no-progress limits |
| Prompt injection or untrusted text | Manipulated decision or tool call | Treat external text as data, minimize its influence, use structured boundaries and restricted capabilities |
| Partial action failure | Mission and business state diverge | Idempotent actions, postcondition verification, retry/compensation/escalation paths |
| Seeded story is mistaken for transaction continuity | Demo overstates what a newly entered order caused | Carry one order identity through every record and assert the lineage end to end |
| Static presentation data is described as live | Investor cannot distinguish evidence from illustration | Label every figure by provenance and remove claims that contradict implemented capabilities |
| Hosted shell works while mission services fail | Shared demo URL fails after entry | Release-blocking browser-to-service smoke test with bounded latency and persisted-result checks |
| Demo determinism overwhelms real AI | Investor sees a scripted animation | Real model chooses among valid strategies and responds to controlled variations |
| Real AI makes the demo fragile | Inconsistent investor experience | Constrained choice space, golden evaluations, repeat testing, and safe fallback path |
| Misleading product claim | Loss of investor trust | Persistent real-versus-simulated labels and explicit autonomy limits |

---

## 18. Post-MVP roadmap

### Stage 1 — Investor proof

- One product family, one order template, one disruption, one approval path.
- Synthetic factory and external events.
- Real bounded AI planning and governed business actions.
- Complete outcome and evaluation trail.

### Stage 2 — Pilot decision support

- Read-only connection to a real plant’s order and planning data.
- Shadow-mode missions alongside human planners.
- Comparison of predicted versus actual outcomes.
- Plant-specific policy, freshness, and authority calibration.
- No autonomous material commitment until evidence demonstrates safety.

### Stage 3 — Governed routine execution

- Automatic low-risk actions in narrow, measured envelopes.
- Live supplier and manufacturing-operation events.
- Human-on-exception for material trade-offs.
- Continuous trace evaluation, incident review, and autonomy rollback.

### Stage 4 — Multi-order and plant-level coordination

- Portfolio objectives across competing customer orders.
- Shared material and capacity conflict resolution.
- Plant-level optimization with local resource authorities.
- Scenario planning for major disruptions.
- Hierarchical missions so global priorities do not erase local operational constraints.

### Stage 5 — Production learning and expansion

- Promote only verified recovery patterns into approved procedural memory.
- Expand product families, plants, suppliers, and event types incrementally.
- Use measured reliability to widen or narrow action authority.
- Retain hard human and safety boundaries regardless of model capability.

---

## 19. Research basis

The architecture is based on a synthesis of current agent-design research, official orchestration guidance, industrial automation standards, and manufacturing-control research. No single framework is adopted wholesale.

Named software-framework sources below are evidence about orchestration patterns, not recommended components or a prescribed backend stack.

### 19.1 Agent workflows and bounded autonomy

| Source | Finding used in this plan |
|---|---|
| [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) | Distinguishes predefined workflows from model-directed agents; recommends starting with simple composable patterns; documents routing, parallelization, orchestrator–worker, evaluator–optimizer, and agent loops; emphasizes environmental feedback, checkpoints, and stopping conditions. |
| [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) | Supports short interleaved reasoning/action/observation loops for evidence gathering, used here only inside bounded specialist nodes. |
| [Plan-and-Solve Prompting](https://aclanthology.org/2023.acl-long.147/) | Supports explicit planning before execution, while also showing why planning quality must be evaluated rather than assumed. |
| [LLM+P: Empowering Large Language Models with Optimal Planning Proficiency](https://arxiv.org/abs/2304.11477) | Motivates separating language understanding from formal feasibility planning for long-horizon tasks. |
| [Reflexion](https://arxiv.org/abs/2303.11366) | Supports feedback-based revision, adopted here with a small revision cap and external verification. |
| [Google Agent Development Kit — Graph workflows](https://adk.dev/graphs/) | Shows how graph workflows combine deterministic control with AI nodes, branches, state, loops, and reliability. |
| [Google Agent Development Kit — Dynamic workflows](https://adk.dev/graphs/dynamic/) | Supports runtime decisions and loops while reinforcing the need to distinguish dynamic behavior from static control structure. |
| [Google Agent Development Kit — Human input](https://adk.dev/graphs/human-input/) | Supports explicit pause/resume nodes for durable human decisions. |
| [OpenAI Agents SDK — Orchestrating multiple agents](https://openai.github.io/openai-agents-python/multi_agent/) | Distinguishes model-led orchestration from code-led orchestration and supports a manager pattern when one role must retain control and apply shared guardrails. |
| [OpenAI Agents SDK — Running agents](https://openai.github.io/openai-agents-python/running_agents/) | Documents the model/tool loop and explicit turn limits, supporting bounded agent execution. |
| [Vercel AI SDK — Workflow patterns](https://ai-sdk.dev/docs/agents/workflows) | Describes sequential, routing, parallel, orchestrator–worker, and evaluator patterns as composable choices rather than one universal agent design. |
| [LangGraph — Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | Supports checkpointed graph state for failure recovery, inspection, and long-running human-in-the-loop work. |
| [LangGraph — Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) | Reinforces durable pause/resume and the need for idempotent side effects around resumed nodes. |

### 19.2 Multi-agent evidence

| Source | Finding used in this plan |
|---|---|
| [Towards a Science of Scaling Agent Systems](https://arxiv.org/abs/2512.08296) | Reports that multi-agent systems can help decomposable parallel work but can degrade sequential and tool-heavy tasks; motivates sparse specialists, parallel reads, and centralized verification. |
| [MAST: Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657) | Catalogues coordination and execution failures in multi-agent systems; motivates explicit ownership, controlled communication, and trace evaluation. |

### 19.3 Industrial architecture and safety boundaries

| Source | Finding used in this plan |
|---|---|
| [ISA-95 standard overview](https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard) | Provides the enterprise–control hierarchy used to keep AI orchestration at manufacturing-operations and business levels rather than direct device and safety control. |
| [NIST — Formalizing ISA-95 Level 3 Control Systems](https://nvlpubs.nist.gov/nistpubs/gcr/2019/NIST.GCR.19-022.pdf) | Supports explicit manufacturing-operations boundaries, information models, and coordination with lower-level controls. |
| [PROSA: Reference architecture for holonic manufacturing systems](https://doi.org/10.1016/S0166-3615(98)00102-X) | Motivates the separation of order, product, resource, and staff-adviser responsibilities. |
| [ADACOR: Adaptive holonic production control architecture](https://doi.org/10.1016/j.compind.2005.05.005) | Motivates hybrid centralized/decentralized control: global mission constraints with bounded local response. |
| [ISO 23247-2 — Digital twin framework for manufacturing](https://www.iso.org/standard/78743.html) | Supports structured observation of manufacturing entities and their changing state. |
| [NIST — Credibility Consideration for Digital Twins in Manufacturing](https://www.nist.gov/publications/credibility-consideration-digital-twins-manufacturing) | Motivates provenance, uncertainty, fitness-for-purpose, and credibility checks for operational state used in decisions. |
| [ISO 13849-1:2023](https://www.iso.org/standard/73481.html) | Reinforces that safety-related control functions require established deterministic design and validation rather than generative-AI authority. |
| [IEC 61508](https://webstore.iec.ch/en/publication/5515) | Supports a firm boundary between agentic business orchestration and functional-safety systems. |

### 19.4 AI risk and evaluation

| Source | Finding used in this plan |
|---|---|
| [NIST AI Risk Management Framework](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) | Supports continuous govern, map, measure, and manage activities rather than treating safety as a final checklist. |
| [NIST AI 600-1 — Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | Supports explicit treatment of confabulation, data integrity, human oversight, measurement, and incident risk. |
| [OpenAI — Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety) | Motivates structured boundaries between nodes, restricted tools, approvals, guardrails, and trace-based evaluations to reduce prompt-injection and unintended-action risk. |

### 19.5 Research-derived design principles

The sources above lead to these decisions:

1. Use workflows where the path and controls are known; use model agency only where uncertainty requires it.
2. Make the graph the durable source of lifecycle control.
3. Keep every reasoning loop short, budgeted, observable, and externally stoppable.
4. Use deterministic computation for feasibility and hard constraints.
5. Generate candidate plans from approved structures before asking AI to compare them.
6. Parallelize only independent read work on a consistent state snapshot.
7. Use one order-level supervisor instead of unrestricted peer handoffs.
8. Separate proposer, policy authority, executor, and verifier.
9. Wake on events rather than run continual background reasoning.
10. Permit dynamic plan changes only through validated, bounded graph patches.
11. Treat state provenance and freshness as part of every decision.
12. Keep generative AI outside machine and functional-safety control.
13. Evaluate repeated end-to-end outcomes, not just plausible text.
14. Expand autonomy only from measured evidence in progressively wider envelopes.

---

## 20. Investor talk track

### Opening

> “This is not nine chatbots sitting on top of an ERP. XELOR owns a customer outcome. Once this order is approved, it assembles a feasible cross-functional plan, takes the routine actions it is authorized to take, watches execution, and brings a person in only when a real business authority is needed.”

### During evidence collection

> “The AI is deciding what it needs to investigate, but it cannot invent factory facts. Every conclusion points to current evidence, and exact calculations remain under deterministic control.”

### During plan comparison

> “The AI is not free-writing a schedule. The system has generated feasible options; the AI is comparing their commercial and operational trade-offs, and an independent verifier is checking its evidence and policy compliance.”

### During execution

> “Every material action passes through fresh-state, feasibility, authority, and postcondition checks. The model proposes and coordinates; it does not directly rewrite the factory’s source of truth.”

### During disruption

> “The supplier delay changes the world, so the mission wakes. It preserves completed work, identifies the affected future steps, and replans only that part of the mission.”

### During approval

> “This is human-on-exception. XELOR has done the investigation and presents the best option, alternatives, evidence, and economic impact. The person contributes authority—not clerical coordination.”

### Closing

> “The difference from an ERP is not the data entry. It is that XELOR continuously connects the data to a goal, chooses and carries out governed actions, adapts when assumptions fail, and verifies the business outcome.”

---

## 21. Final architecture statement

The MVP should be built and demonstrated as a **Policy-Governed, Event-Driven Graph of Bounded Agentic Loops**.

It is a graph because manufacturing commitments require explicit dependencies, durable state, approvals, and auditability. It is agentic because the system investigates, chooses, acts, observes, and adapts in pursuit of an outcome. It is bounded because AI reasoning is invoked only at designated decision points with limited authority and stopping rules. It is safe because deterministic feasibility, policy gates, qualified human authority, and independent verification remain outside the model’s control.

That combination—not the number of agent names—is the defensible meaning of an **Agentic AI Operating System for manufacturing**.
