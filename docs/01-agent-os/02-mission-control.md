# Agent OS — Phase 2: Mission control

Phase 2 turns the Phase 1 execution foundation into a visible operating surface. ONYX is
no longer a static architecture diagram: the web application reads the live Agent OS
catalogue, starts bounded missions, follows durable node state and exposes attributable
human decisions.

## Nine-agent command graph

`operations.full-command-review@2` connects every registered agent:

1. ONYX frames and delegates the mission.
2. HEXA, MICA, SPAR, AXLE, KILN, RASP, RELAY and ACHILES execute eight independent
   tenant-scoped reads in one parallel wave.
3. Each specialist creates a structured assessment from its own evidence.
4. ONYX joins the eight assessments.
5. HEXA verifies capability registration, tenant boundaries, evidence coverage and the
   absence of side effects.
6. The graph pauses at a durable human-approval gate.
7. ONYX publishes the command brief only after approval.

The eight live capability boundaries are:

- `general.companies.read` — HEXA
- `sales.orders.read` — MICA
- `inventory.on-hand.read` — SPAR
- `planning.planned-orders.read` — AXLE
- `production.orders.read` — KILN
- `accounts.vouchers.read` — RASP
- `managed-services.service-assurance.read` — RELAY
- `platform-health.status.read` — ACHILES

All eight call registered services and re-check the requesting user's permission. ACHILES
contributes private availability evidence and has no action-dispatch capability.

## Mission Control

`/agentos/command` provides:

- a catalogue-backed nine-agent topology;
- current agent and node status;
- a mission composer with a registered graph selection;
- bounded-step, checkpoint and evidence counters;
- capability and assessment inspection;
- approval and rejection controls;
- cancellation for active missions;
- durable recent-run history; and
- explicit provider disclosure.

The ONYX gateway reads `/api/v1/agent-os/catalogue` before claiming that agents are
connected. Clicking the ONYX hub opens Mission Control directly.

## Provider disclosure

The orchestration, permissions, ERP reads, persistence, checkpoints and approval gates are
live. Language reasoning remains deterministic until a model provider is configured. The
UI states this directly and does not imply that an external model API is active.

## Verification

The browser test `pnpm --filter @ind-core/web e2e:agent-os` signs in through the demo
identity, enters the ONYX gateway, asserts that ONYX and all eight specialists are connected, opens
Mission Control and checks the live approval-gated mission.
