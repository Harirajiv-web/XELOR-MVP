/**
 * RELAY MANAGED SERVICES — the operating contract around ONYX.
 *
 * RELAY owns the service clock, the customer communication and the proof that a service
 * outcome was restored. It does not take technical ownership away from the domain that
 * owns the failing record. This distinction is the whole reason the agent exists:
 * Integration can repair a connector while RELAY owns the incident, SLA and update cadence;
 * AI Operations can investigate a provider while RELAY keeps the customer informed.
 *
 * The MVP data below is an explicitly labelled demonstration operating model. It lets the
 * product, API, Agent OS and documentation share one non-duplicated statement of the
 * lifecycle and responsibility split before live telemetry and an ITSM connector exist.
 */

export type ManagedServiceLifecycleKey =
  "design" | "transition" | "operate" | "improve";

export interface ManagedServiceLifecycleStage {
  key: ManagedServiceLifecycleKey;
  name: string;
  accountable: string;
  purpose: string;
  outputs: readonly string[];
}

export interface ManagedServiceResponsibility {
  key: string;
  accountable:
    | "RELAY"
    | "ONYX"
    | "HEXA"
    | "MICA"
    | "SPAR"
    | "AXLE"
    | "KILN"
    | "RASP"
    | "ACHILES"
    | "HUMAN";
  responsibility: string;
  handoff: string;
  boundary: string;
}

export const MANAGED_SERVICE_LIFECYCLE: readonly ManagedServiceLifecycleStage[] =
  [
    {
      key: "design",
      name: "Design",
      accountable: "RELAY service architect",
      purpose:
        "Turn the customer's operating needs into a supportable service with named outcomes and boundaries.",
      outputs: [
        "service catalogue",
        "support hours and severity model",
        "SLO and SLA schedule",
        "responsibility matrix",
        "continuity and exit plan",
      ],
    },
    {
      key: "transition",
      name: "Transition",
      accountable: "RELAY transition lead",
      purpose:
        "Move a connected customer into managed operation without treating go-live as the end of the work.",
      outputs: [
        "discovery and readiness record",
        "monitoring coverage",
        "runbooks and escalation contacts",
        "acceptance evidence",
        "hypercare plan",
      ],
    },
    {
      key: "operate",
      name: "Operate",
      accountable: "RELAY service desk and operations lead",
      purpose:
        "Watch service outcomes, coordinate incidents, control changes and keep the customer informed.",
      outputs: [
        "event triage",
        "incident and major-incident record",
        "request fulfilment",
        "change calendar",
        "customer status updates",
      ],
    },
    {
      key: "improve",
      name: "Improve",
      accountable: "RELAY service manager",
      purpose:
        "Use service evidence to remove repeat failure and agree the next improvement with the customer.",
      outputs: [
        "problem record",
        "root-cause follow-up",
        "monthly service review",
        "service improvement register",
        "capacity and roadmap actions",
      ],
    },
  ] as const;

/**
 * One accountable owner per responsibility. Consumers may assist, but only the named owner
 * can close the record. The tests assert the keys stay unique so a future module cannot
 * quietly recreate a second incident desk or second change calendar.
 */
export const MANAGED_SERVICE_RESPONSIBILITIES: readonly ManagedServiceResponsibility[] =
  [
    {
      key: "platform-health-detection",
      accountable: "ACHILES",
      responsibility:
        "Privately check ONYX platform availability, latency and evidence freshness every hour and retain the tenant-isolated result history.",
      handoff:
        "Supplies failed-check evidence to RELAY for incident coordination and to the relevant technical owner for diagnosis and repair.",
      boundary:
        "Cannot diagnose root cause, restart a service, change ERP data, open a customer conversation or close an incident.",
    },
    {
      key: "service-relationship",
      accountable: "RELAY",
      responsibility:
        "Own the managed-service catalogue, support model, SLA, service reviews and customer operating relationship.",
      handoff:
        "Requests specialist evidence from the relevant domain and reports the joined service outcome.",
      boundary:
        "Does not own the customer's commercial product relationship or MICA's warranty and product-support records.",
    },
    {
      key: "service-incident",
      accountable: "RELAY",
      responsibility:
        "Own operational incident coordination, severity, SLA clocks, escalation, timeline and customer updates.",
      handoff:
        "Consumes ACHILES availability evidence and routes technical diagnosis and remediation to the owner of the affected service component.",
      boundary:
        "Does not declare a technical fix complete until the specialist supplies evidence and RELAY verifies the service outcome.",
    },
    {
      key: "service-change",
      accountable: "RELAY",
      responsibility:
        "Own the customer change calendar, collision check, maintenance notice, readiness and post-change verification.",
      handoff:
        "The technical owner designs and executes its own change; HEXA or a human approves where policy requires it.",
      boundary:
        "Cannot override segregation of duties, the AI kill switch or a domain approval gate.",
    },
    {
      key: "service-level",
      accountable: "RELAY",
      responsibility:
        "Measure user-facing service indicators, objectives, breaches, exclusions and improvement actions.",
      handoff:
        "Consumes telemetry and business-impact evidence; supplies monthly evidence to the customer and RASP for commercial review.",
      boundary:
        "Reports measured outcomes and never converts an internal component metric into a customer SLA without an agreed contract.",
    },
    {
      key: "cross-business-mission",
      accountable: "ONYX",
      responsibility:
        "Coordinate evidence-backed business decisions across specialist agents.",
      handoff:
        "RELAY may raise a service-impact signal; ONYX decides whether it needs a bounded cross-functional mission.",
      boundary:
        "ONYX does not own incident clocks, customer status notices or the service review.",
    },
    {
      key: "security-governance",
      accountable: "HEXA",
      responsibility:
        "Own identity, authorization, security incident determination, statutory clocks and audit evidence.",
      handoff:
        "RELAY coordinates the operational service incident and customer communication around HEXA's security process.",
      boundary:
        "RELAY cannot make breach, reportability or compliance determinations.",
    },
    {
      key: "integration-remediation",
      accountable: "HEXA",
      responsibility:
        "Own connector configuration, message trace, circuit breaker, retries, dead letters and external transport recovery.",
      handoff:
        "RELAY opens or updates the service incident when connection health affects an agreed service outcome.",
      boundary:
        "RELAY never replays a statutory message or edits a connector mapping.",
    },
    {
      key: "ai-platform-incident",
      accountable: "ONYX",
      responsibility:
        "Own model-provider, prompt, evaluation, guardrail, AI cost and AI-specific incident investigation.",
      handoff:
        "RELAY handles customer-facing impact and SLA; AI Operations handles the AI evidence and safe degraded mode.",
      boundary:
        "RELAY cannot release the kill switch, promote a prompt or change an autonomy policy.",
    },
    {
      key: "product-customer-support",
      accountable: "MICA",
      responsibility:
        "Own customer product tickets, warranty, AMC, complaints, spares and product-service communication.",
      handoff:
        "RELAY owns only tickets about ONYX's managed technology service; product complaints remain MICA records.",
      boundary:
        "No duplicate ticket is created in Managed Services when the case concerns a manufactured product or installed base.",
    },
    {
      key: "factory-asset-maintenance",
      accountable: "KILN",
      responsibility:
        "Own factory assets, maintenance requests, maintenance work orders, downtime, PM and reliability measures.",
      handoff:
        "RELAY may coordinate ONYX platform availability but never converts a machine breakdown into a platform incident.",
      boundary:
        "Physical equipment restoration and production handback remain KILN decisions.",
    },
    {
      key: "commercial-service-credit",
      accountable: "HUMAN",
      responsibility:
        "Approve contractual SLA credits, material customer commitments and changes to the managed-service scope.",
      handoff:
        "RELAY assembles the evidence; RASP validates the financial consequence; an authorised person decides.",
      boundary:
        "No agent grants a service credit, signs a contract or commits an unapproved delivery date.",
    },
  ] as const;

export interface ManagedServiceIncidentDemo {
  number: string;
  severity: "P1" | "P2" | "P3" | "P4";
  title: string;
  affectedService: string;
  status: "investigating" | "monitoring" | "resolved";
  coordinator: "RELAY";
  technicalOwner: string;
  nextUpdate: string;
  elapsed: string;
  customerImpact: string;
  evidence: readonly string[];
}

export interface ManagedServiceChangeDemo {
  number: string;
  title: string;
  technicalOwner: string;
  risk: "low" | "medium" | "high";
  state: "scheduled" | "awaiting_approval" | "completed";
  window: string;
  serviceCheck: string;
}

export interface ManagedServiceDemoSnapshot {
  asOf: string;
  evidenceMode: "illustrative_demo_operating_model";
  boundary: string;
  headline: {
    servicesHealthy: number;
    servicesAtRisk: number;
    openIncidents: number;
    sloAttainment: number;
    changesThisWeek: number;
  };
  serviceCatalogue: readonly {
    service: string;
    outcome: string;
    coverage: string;
    owner: string;
    objective: string;
    status: "healthy" | "at_risk";
  }[];
  lifecycle: readonly ManagedServiceLifecycleStage[];
  incidents: readonly ManagedServiceIncidentDemo[];
  changes: readonly ManagedServiceChangeDemo[];
  reviews: readonly {
    period: string;
    customer: string;
    serviceManager: string;
    status: string;
    evidence: readonly string[];
    improvement: string;
  }[];
  responsibilities: readonly ManagedServiceResponsibility[];
}

export function managedServiceDemoSnapshot(): ManagedServiceDemoSnapshot {
  const incidents: readonly ManagedServiceIncidentDemo[] = [
    {
      number: "MS-INC-2026-0041",
      severity: "P2",
      title: "ERP connector queue is behind its freshness objective",
      affectedService: "Integration assurance",
      status: "monitoring",
      coordinator: "RELAY",
      technicalOwner: "HEXA · Integration",
      nextUpdate: "16:30 IST",
      elapsed: "38 min",
      customerImpact:
        "Read views remain available; new ERP updates may appear up to 14 minutes late.",
      evidence: [
        "circuit remains closed",
        "dead-letter queue unchanged",
        "worker throughput recovering",
        "customer update issued",
      ],
    },
    {
      number: "MS-INC-2026-0040",
      severity: "P3",
      title: "Cloud model provider latency increased",
      affectedService: "AI assistance",
      status: "investigating",
      coordinator: "RELAY",
      technicalOwner: "ONYX · AI Operations",
      nextUpdate: "17:00 IST",
      elapsed: "21 min",
      customerImpact:
        "Deterministic ERP workflows are unaffected; model-assisted wording may fall back to the local baseline.",
      evidence: [
        "provider p95 above route target",
        "fallback path available",
        "no guardrail failure",
        "no business write blocked",
      ],
    },
  ];

  return {
    asOf: "2026-08-05T16:12:00+05:30",
    evidenceMode: "illustrative_demo_operating_model",
    boundary:
      "This is a seeded MVP operating model for demonstrating RELAY's responsibilities. It is not proof that a staffed 24×7 service desk, live telemetry backend or contractual SLA is operating today.",
    headline: {
      servicesHealthy: 4,
      servicesAtRisk: 2,
      openIncidents: incidents.length,
      sloAttainment: 98.7,
      changesThisWeek: 3,
    },
    serviceCatalogue: [
      {
        service: "ONYX application",
        outcome: "Authorised users can complete core ERP journeys.",
        coverage: "P1 response 24×7 · standard requests business hours",
        owner: "RELAY + application engineering",
        objective: "99.9% monthly availability",
        status: "healthy",
      },
      {
        service: "Integration assurance",
        outcome:
          "Connected-system data remains fresh, traceable and recoverable.",
        coverage: "24×7 event monitoring",
        owner: "RELAY + HEXA Integration",
        objective: "95% of priority feeds within freshness target",
        status: "at_risk",
      },
      {
        service: "Agent operations",
        outcome:
          "Governed missions run inside permissions, approvals and the kill-switch boundary.",
        coverage: "24×7 control monitoring",
        owner: "RELAY + ONYX",
        objective: "100% of effects approval-linked and attributable",
        status: "healthy",
      },
      {
        service: "Data protection",
        outcome:
          "Tenant fences, audit evidence and recovery controls remain verifiable.",
        coverage: "continuous controls · scheduled restore proof",
        owner: "RELAY + HEXA Governance",
        objective: "Zero cross-tenant exposure; quarterly restore proof",
        status: "healthy",
      },
      {
        service: "AI assistance",
        outcome:
          "Approved model-assisted features remain available or degrade safely.",
        coverage: "provider monitoring during service hours",
        owner: "RELAY + ONYX AI Operations",
        objective: "Safe fallback on provider failure",
        status: "at_risk",
      },
      {
        service: "Release assurance",
        outcome:
          "Changes are assessed, approved, communicated and verified after release.",
        coverage: "agreed maintenance windows",
        owner: "RELAY + technical owner",
        objective: "100% material changes linked to evidence",
        status: "healthy",
      },
    ],
    lifecycle: MANAGED_SERVICE_LIFECYCLE,
    incidents,
    changes: [
      {
        number: "MS-CHG-2026-019",
        title: "Connector retry-policy tuning",
        technicalOwner: "HEXA · Integration",
        risk: "medium",
        state: "awaiting_approval",
        window: "06 Aug · 22:00–22:30 IST",
        serviceCheck: "Freshness, duplicate and dead-letter checks",
      },
      {
        number: "MS-CHG-2026-018",
        title: "Agent mission telemetry labels",
        technicalOwner: "ONYX · Agent OS",
        risk: "low",
        state: "scheduled",
        window: "07 Aug · 20:00–20:20 IST",
        serviceCheck: "Trace continuity and dashboard readback",
      },
      {
        number: "MS-CHG-2026-017",
        title: "Database index for service dashboard",
        technicalOwner: "HEXA · Platform",
        risk: "low",
        state: "completed",
        window: "04 Aug · 21:00–21:18 IST",
        serviceCheck: "Query latency improved; error rate unchanged",
      },
    ],
    reviews: [
      {
        period: "July 2026",
        customer: "Northstar Process Systems",
        serviceManager: "RELAY service manager",
        status: "Ready for customer review",
        evidence: [
          "SLO scorecard",
          "incident and request trend",
          "change success",
          "open risks",
          "capacity view",
          "improvement register",
        ],
        improvement:
          "Reduce connector recovery time by tuning retry classification and adding a freshness-based alert.",
      },
    ],
    responsibilities: MANAGED_SERVICE_RESPONSIBILITIES,
  };
}
