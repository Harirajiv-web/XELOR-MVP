export interface ManagedServiceLifecycleStage {
  key: "design" | "transition" | "operate" | "improve";
  name: string;
  accountable: string;
  purpose: string;
  outputs: readonly string[];
}

export interface ManagedServiceResponsibility {
  key: string;
  accountable: string;
  responsibility: string;
  handoff: string;
  boundary: string;
}

export interface ManagedServiceSnapshot {
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
  incidents: readonly {
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
  }[];
  changes: readonly {
    number: string;
    title: string;
    technicalOwner: string;
    risk: "low" | "medium" | "high";
    state: "scheduled" | "awaiting_approval" | "completed";
    window: string;
    serviceCheck: string;
  }[];
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

export interface ManagedServiceEnvelope {
  data: ManagedServiceSnapshot;
}

export const managedServicesApi = {
  overviewPath: "/managed-services/overview",
} as const;
