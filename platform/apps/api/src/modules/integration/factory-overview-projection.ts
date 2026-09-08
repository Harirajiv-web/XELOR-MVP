export type FactoryOverviewView = "integration" | "production" | "planning";

function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

/** Command reload evidence deliberately omits the reusable approval identifier. */
export function projectFactoryCommandEvidence(command: unknown): Record<string, unknown> | null {
  const row = recordOf(command);
  if (!row) return null;
  return {
    commandKey: row.commandKey,
    capability: row.capability,
    status: row.status,
    simulated: row.simulated,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    result: row.result,
  };
}

/**
 * Stable, deliberately enumerated DTO for XELOR and the Production workroom screen.
 * Keeping this separate from the combined overview prevents a future internal field from
 * becoming integration data by accident.
 */
export function projectFactoryOperationsView(
  overview: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const operations = recordOf(overview.operations);
  if (!operations) {
    throw new Error("Factory Operations projection is missing from the Factory overview.");
  }
  return {
    schemaVersion: operations.schemaVersion,
    demo: operations.demo,
    customer: operations.customer,
    source: operations.source,
    freshness: operations.freshness,
    summary: operations.summary,
    machines: operations.machines,
    atRiskJobs: operations.atRiskJobs,
    replanProposals: operations.replanProposals,
  };
}

/**
 * Department views are deliberately projections, not aliases of the full Factory Connect
 * evidence surface. Keep these object literals explicit: adding a field to `overview()` must
 * never silently disclose it to every department.
 */
export function projectFactoryOverview(
  overview: Readonly<Record<string, unknown>>,
  view: FactoryOverviewView,
): Record<string, unknown> {
  const metadata = {
    generatedAt: overview.generatedAt,
    boundary: overview.boundary,
  };

  switch (view) {
    case "integration":
      return {
        ...metadata,
        gateways: overview.gateways,
        commands: overview.commands,
        summary: overview.summary,
      };
    case "production":
      return {
        ...metadata,
        gateways: overview.gateways,
        assets: overview.assets,
        operations: overview.operations,
        summary: overview.summary,
        mission: overview.mission,
      };
    case "planning":
      return {
        ...metadata,
        dwell: overview.dwell,
        summary: overview.summary,
        mission: overview.mission,
      };
  }
}
