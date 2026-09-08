interface FactoryStateReplayPayload {
  sourceEventId: string;
  observedAt: string | Date;
  state: string;
  safetyState: string;
  activeProgram?: string | null;
  productionOrderRef?: string | null;
  materialRef?: string | null;
  cycleTimeSeconds?: string | number | null;
  goodCount?: number | null;
  rejectCount?: number | null;
  energyKwh?: string | number | null;
  alarmCode?: string | null;
  evidence?: unknown;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function finiteNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Canonical comparison form for process-independent telemetry idempotency checks. */
export function canonicalFactoryStateReplay(payload: FactoryStateReplayPayload): string {
  const observedAt = payload.observedAt instanceof Date
    ? payload.observedAt.toISOString()
    : new Date(payload.observedAt).toISOString();
  return stableJson({
    sourceEventId: payload.sourceEventId,
    observedAt,
    state: payload.state,
    safetyState: payload.safetyState.trim().toLowerCase(),
    activeProgram: payload.activeProgram ?? null,
    productionOrderRef: payload.productionOrderRef ?? null,
    materialRef: payload.materialRef ?? null,
    cycleTimeSeconds: finiteNumberOrNull(payload.cycleTimeSeconds),
    goodCount: payload.goodCount ?? null,
    rejectCount: payload.rejectCount ?? null,
    energyKwh: finiteNumberOrNull(payload.energyKwh),
    alarmCode: payload.alarmCode ?? null,
    evidence: payload.evidence ?? {},
  });
}
