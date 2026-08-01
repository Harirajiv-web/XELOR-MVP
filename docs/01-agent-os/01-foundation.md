# Agent OS — Phase 1: Foundation

Phase 1 adds a governed execution layer above the ERP kernel. It does not replace domain
services, grant models database access, or activate an external model provider.

## Runtime contract

- Every mission executes a registered, versioned and bounded graph.
- Every node has a typed kind and a persistent status.
- Independent ready nodes execute as one parallel wave.
- Every wave creates an append-only checkpoint.
- Consequential transitions pause on an attributable human approval.
- Agent capabilities call existing Nest services and repeat the requesting user's RBAC
  check internally.
- Agents cannot call a capability outside their registered prefix and allow-list.
- The AI Operations tenant-wide or feature switch and the shared AI governance switch both
  stop the runtime at the same chokepoint.
- Events and checkpoints record structured evidence, never private chain-of-thought.
- The deterministic provider is the honest default until a model is configured.

## Registered agents

ONYX (supervisor), HEXA (governance), MICA (commercial), SPAR (supply), AXLE (planning),
KILN (operations) and RASP (finance and people) are runtime identities with explicit
delegation and capability boundaries.

## Phase 1 mission

`foundation.cross-functional-readiness@1` demonstrates:

1. ONYX mission intake.
2. MICA sales-order and SPAR stock reads in parallel.
3. Independent specialist assessments.
4. Evidence collection.
5. HEXA verification.
6. A durable human-approval pause.
7. ONYX synthesis after approval.

The ERP reads are live and tenant-scoped. Language reasoning is deterministic and is
labelled as such in the catalogue response.

## HTTP surface

All routes are under `/api/v1/agent-os`.

- `GET /catalogue`
- `GET /runs`
- `GET /runs/:runId`
- `POST /runs` (requires `Idempotency-Key`)
- `POST /runs/:runId/resume`
- `POST /runs/:runId/cancel`
- `GET /approvals`
- `POST /approvals/:approvalId/decide`

## Provider disclosure

The catalogue reports:

> Orchestration and ERP capability calls are live; agent language reasoning is
> deterministic until a model provider is configured.

This sentence should remain visible in any Phase 1 demonstration.
