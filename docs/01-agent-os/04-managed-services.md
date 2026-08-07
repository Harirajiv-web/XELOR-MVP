# RELAY Managed Services blueprint

**Status:** implemented as an honest MVP operating-model demonstration
**Snapshot:** 6 August 2026
**Product agent:** RELAY
**Runtime graph:** `managed-services.assurance-review@1`

## 1. Why RELAY exists

XELOR already has specialist agents that understand sales, supply, planning, production,
quality, maintenance, finance, people, platform governance and AI operations. That is the
technology and business capability. It is not, by itself, a managed service.

A managed service adds the people and operating process that keep XELOR useful after it is
connected: onboarding, monitoring, a service desk, incident coordination, change control,
customer updates, service reporting and continual improvement. RELAY is the single XELOR
agent accountable for coordinating that service.

The key ownership rule is:

> **RELAY owns the service clock, the handoff and the customer update. The specialist owns
> the technical diagnosis and repair. A human owns contractual commitments.**

This avoids creating a second version of Integration, AI Operations, customer product
support or factory maintenance inside Managed Services.

## 2. What was learned from the supplied managed-services deck

The reference deck separates a technology architecture from a service operating model. Its
service is shown as a repeatable lifecycle—design, transition, operate and improve—with a
customer portal, operations team, security capability, AI-assisted investigation, service
management and customer-success layer around the technology. It also makes the commercial
offer easy to understand: one accountable service, measurable outcomes, a pilot-to-scale
path and regular evidence-led reviews.

XELOR adopts that **layout logic**, not the deck's Cisco/network-specific scope. RELAY is
therefore an operating layer around XELOR's ERP, intelligence and agent runtime. It is not a
network NOC claim, a staffed 24×7 claim or an OEM contract.

## 3. External design basis

The blueprint follows established practices without claiming certification:

- [ISO/IEC 20000-1](https://www.iso.org/standard/70636.html) treats service management as a
  system covering planning, design, transition, delivery and continual improvement.
- [ITIL practice guidance](https://www.peoplecert.org/news-and-announcements/2024/ITIL-Official-eLearning-optimise-your-experience)
  separates incident, problem, request, monitoring and event, change, release, deployment,
  configuration, asset, supplier, service-level, relationship, information-security and
  continual-improvement practices. This separation informed RELAY's ownership map.
- [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) integrates cyber
  incident response with wider risk management. Accordingly, HEXA—not RELAY—owns security
  determination, evidence and statutory decisions.
- [Google SRE service-level guidance](https://sre.google/sre-book/service-level-objectives/)
  starts with user needs and measurable service indicators and objectives. RELAY reports a
  customer outcome instead of presenting an internal component metric as an SLA.
- [Google SRE risk guidance](https://sre.google/sre-book/embracing-risk/) uses error budgets
  to balance reliability and change. A production RELAY implementation should use the same
  principle for release decisions.
- [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/) provides a
  vendor-neutral basis for traces, metrics and logs. It is the recommended production
  telemetry contract; the MVP snapshot is not live telemetry.
- [Microsoft Cloud Adoption Framework operating-model guidance](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/plan/prepare-organization-for-cloud)
  emphasizes clear accountability and team alignment. That is why every responsibility
  below has one accountable owner.

## 4. Service lifecycle

```text
CUSTOMER OUTCOMES
       │
       ▼
┌────────────┐   ┌──────────────┐   ┌────────────┐   ┌────────────┐
│ 1. DESIGN  │ → │ 2. TRANSITION│ → │ 3. OPERATE │ → │ 4. IMPROVE │
│ Catalogue  │   │ Discovery    │   │ Monitor     │   │ Problems   │
│ SLO / SLA  │   │ Connect      │   │ Incidents   │   │ Reviews    │
│ Boundaries │   │ Runbooks     │   │ Changes     │   │ Capacity   │
│ Exit plan  │   │ Acceptance   │   │ Updates     │   │ Roadmap    │
└────────────┘   └──────────────┘   └────────────┘   └──────┬─────┘
       ▲                                                     │
       └──────────────── learned improvement ────────────────┘
```

### Design

RELAY's service architect turns a customer's needs into a service catalogue, coverage
hours, severity definitions, SLO/SLA schedule, responsibility matrix, continuity plan and
exit plan. A human approves price, legal terms and contractual commitments.

### Transition

RELAY's transition lead coordinates discovery, connector and data readiness, monitoring
coverage, contacts, runbooks, acceptance tests and hypercare. HEXA owns identity,
permissions and connectors; the appropriate specialist validates each business domain.
Go-live occurs only against written acceptance evidence.

### Operate

RELAY's service desk and operations lead triage events, coordinate incidents and requests,
maintain the customer change calendar, escalate to specialists and publish status updates.
The correct domain specialist diagnoses and repairs the issue.

### Improve

RELAY's service manager builds the monthly evidence pack, maintains the problem and
improvement registers, tracks repeat failure and capacity, and agrees an improvement plan
with the customer. Specialists implement domain changes; people approve scope and money.

## 5. Exact task ownership—no duplicated work

| Work                                                             | Accountable owner      | RELAY's role                                     | Explicit boundary                                         |
| ---------------------------------------------------------------- | ---------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Managed-service catalogue, support model and reviews             | RELAY                  | Own                                              | Does not replace MICA's product relationship              |
| Operational incident, severity, clock, escalation and update     | RELAY                  | Own                                              | Specialist owns diagnosis and repair                      |
| Customer change calendar, notice and service verification        | RELAY                  | Own                                              | Specialist designs and executes; controls still apply     |
| Service indicators, objectives and breach evidence               | RELAY                  | Own                                              | Contract and credits require an authorised person         |
| Cross-business mission                                           | ONYX                   | Supply service-impact evidence                   | RELAY does not coordinate business decisions              |
| Security incident and statutory determination                    | HEXA                   | Coordinate service impact and updates            | RELAY cannot declare a breach or reportability            |
| Connector mapping, retry, replay, DLQ and transport repair       | HEXA Integration       | Open/update service incident                     | RELAY never edits mappings or replays statutory traffic   |
| Provider, prompt, evaluation, guardrail and kill-switch incident | ONYX AI Operations     | Coordinate customer-facing impact                | RELAY cannot release the kill switch or promote prompts   |
| Manufactured-product case, complaint, warranty and AMC           | MICA                   | None unless XELOR service is affected            | No duplicate Managed Services incident                    |
| Factory asset, downtime, maintenance WO, PM and reliability      | KILN                   | None unless XELOR platform is affected           | Machine repair never becomes a platform incident          |
| Supplier/material, planning, production, quality, finance/people | SPAR, AXLE, KILN, RASP | Coordinate only when service outcome is affected | Business records remain with their system-of-record owner |
| SLA credit, contract or material customer promise                | Human                  | Assemble evidence                                | No agent signs or grants credit                           |

## 6. Team operating model

RELAY is the digital coordinator for a human managed-service team. A credible production
service needs named people; software does not replace these accountabilities.

| Human role                     | Main accountability                                       | Agent support                                                   |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------- |
| Service owner                  | Service design, scope, risk and executive accountability  | RELAY compiles evidence and exceptions                          |
| Service manager                | Customer relationship, SLA review and improvement plan    | RELAY prepares the review pack and action register              |
| Transition lead                | Discovery, onboarding, acceptance and hypercare           | RELAY tracks readiness and handoffs                             |
| Service desk / operations lead | Intake, triage, coordination and communication            | RELAY maintains clocks, routing and update cadence              |
| Technical domain owner         | Diagnosis, repair and change execution                    | Existing specialist agent supplies evidence and bounded actions |
| Security/control owner         | Security response, access, audit and regulatory decisions | HEXA preserves controls and evidence                            |
| Customer authorised approver   | Change, risk, commercial and contractual decisions        | Approval gates capture decision and reason                      |

Coverage should be sold only after staffing is real. Until then, the product must say
"illustrative operating model" rather than "24×7 managed service".

## 7. How a service incident flows

```text
Telemetry / user contact / XELOR signal
                 │
                 ▼
      RELAY creates one service incident
      classify → severity → impact → clock
                 │
          route by affected domain
     ┌───────────┼──────────────┬──────────────┐
     ▼           ▼              ▼              ▼
 HEXA/Integration  ONYX/AI   KILN/factory   other specialist
 diagnosis + action + evidence (technical ownership stays here)
     └───────────┼──────────────┴──────────────┘
                 ▼
      RELAY updates customer and timeline
                 ▼
      specialist supplies restoration proof
                 ▼
      RELAY verifies the service outcome
                 ▼
  close incident → problem/improvement if repeat
```

Major incidents require a named human incident commander, a fixed update cadence, an
executive escalation path and a later blameless review. Security runs HEXA's separate
security process in parallel; RELAY communicates only what the security owner authorises.

## 8. How a change flows

1. The specialist proposes a technical change with scope, risk, test and rollback.
2. RELAY checks the customer calendar, collisions, support coverage and notice period.
3. HEXA verifies access, segregation of duties and required approvals.
4. An authorised person approves when risk or policy requires it.
5. The specialist executes inside the approved window.
6. RELAY checks the customer-facing service outcome and publishes the result.
7. Failed or repeated changes create an incident/problem and an improvement action.

RELAY never uses change coordination to bypass a specialist's technical control or ONYX's
kill switch.

## 9. Agent workflow implemented in this MVP

```text
ONYX frames the service question
        ↓
RELAY reads registered service-assurance data
        ↓
RELAY separates outcome, incident, owner, update and improvement
        ↓
HEXA verifies evidence and responsibility boundaries
        ↓
HUMAN APPROVAL — publish or reject the service brief
        ↓ approved
RELAY publishes the bounded assurance brief
```

The graph is capped at 12 steps and 180 seconds. It contains no dispatch capability and
cannot change a connector, business record, AI control, service credit or contract. In the
larger controlled-action mission, RELAY can receive one approval-bound coordination work
item alongside the six specialist domain work items.

## 10. Implemented product surfaces

- `GET /api/v1/managed-services/overview`, protected by
  `managed_services.overview.read`.
- Managed Services module with Command Centre, Incidents & Escalation, Changes & Releases,
  Service Reviews and Responsibility Map screens.
- Shared platform definitions for lifecycle, responsibility boundaries and the demo
  snapshot, so API, Agent OS, UI and tests do not maintain conflicting copies.
- RELAY in the agent registry, catalogue, department map, permission registry and Agent OS
  runways.
- `managed-services.service-assurance.read`, a registered read-only capability available
  only to RELAY.
- `managed-services.assurance-review@1`, a verified and human-gated mission graph.
- RELAY participation in the full operating review and controlled-action mission.

## 11. Honest MVP boundary

The displayed incidents, service catalogue, changes, service review and performance values
are seeded examples identified by `illustrative_demo_operating_model`. They demonstrate the
operating model and UI. They are not evidence of:

- a staffed 24×7 service desk or NOC;
- a live customer ITSM tool;
- active OpenTelemetry ingestion or automated alert correlation;
- contractual SLO/SLA performance;
- automated emails, calls, pages or customer notices;
- autonomous technical repair.

This boundary must remain visible in the API and the UI until production evidence replaces
the seeded snapshot.

## 12. Production implementation sequence

### Phase A — service definition and pilot

Choose one pilot customer, 3–5 critical service outcomes, business-hours coverage and a
small named team. Sign the catalogue, SLO definitions, severity model, data access,
responsibility matrix and exit terms. Do not promise 24×7 before shifts, on-call and backup
roles exist.

### Phase B — service data model

Create tenant-scoped tables for service, service component, customer entitlement, SLO,
incident, incident event, request, problem, change, maintenance window, communication,
review and improvement. Apply RLS, immutable history, retention and audit before exposing
writes.

### Phase C — observability and ITSM adapters

Accept OpenTelemetry traces, metrics and logs through a provider-neutral ingestion
contract. Add adapters for the selected ITSM and paging tools through HEXA Integration.
Preserve external IDs and idempotency; never build provider-specific rules into RELAY.

### Phase D — governed automation

Start with read, correlate, recommend and draft. Then permit low-risk reversible actions
behind the same approval, permission, idempotency, audit, retry and kill-switch controls as
Agent OS. High-impact change, security, money and customer commitments stay human-gated.

### Phase E — prove and expand

Run restore exercises, paging drills, missed-SLO reviews, change-failure reviews and exit
tests. Expand coverage and services only after evidence shows the team can meet them.

## 13. Minimum acceptance tests for production

- Every incident has one RELAY coordinator and one technical owner.
- A technical owner cannot close the customer service outcome without restoration proof.
- RELAY cannot change AI autonomy, the kill switch, a security determination, a connector
  mapping, a factory work order or a product warranty case.
- Every customer update has an author, time, audience and incident/change reference.
- Service measures trace to raw observations and declared calculation windows.
- Cross-tenant data is denied by RLS and API authorization.
- Duplicate inbound ITSM and telemetry events are idempotent.
- Approval-bound actions cannot execute without an approved ancestor.
- The kill switch prevents new automated actions and leaves manual ERP operation available.
- Backup/restore, degraded mode, on-call escalation and customer exit are rehearsed.
