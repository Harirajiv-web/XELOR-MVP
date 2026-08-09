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
