export function oeePercent(value: number | null): string {
  return value === null ? "Not evidenced" : `${value.toFixed(2)}%`;
}

export function oeeFormulaLabel(input: {
  availabilityPct: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
}): string {
  if (
    input.availabilityPct === null ||
    input.performancePct === null ||
    input.qualityPct === null ||
    input.oeePct === null
  ) {
    return "A × P × Q = not fully evidenced";
  }
  return `(${input.availabilityPct.toFixed(2)}% × ${input.performancePct.toFixed(2)}% × ${input.qualityPct.toFixed(2)}%) = ${input.oeePct.toFixed(2)}%`;
}

export function cycleTimeLabel(
  actualCycleSeconds: number | null,
  idealCycleSeconds: number | null,
): string {
  if (actualCycleSeconds === null || idealCycleSeconds === null) return "Cycle comparison not evidenced";
  const delta = actualCycleSeconds - idealCycleSeconds;
  if (delta === 0) return `${actualCycleSeconds}s actual = ${idealCycleSeconds}s ideal`;
  return `${actualCycleSeconds}s actual · ${idealCycleSeconds}s ideal · ${Math.abs(delta)}s ${delta > 0 ? "slower" : "faster"}`;
}

export function workroomScenarioAction(
  state: string | null | undefined,
): "breakdown" | "recover" {
  return state === "faulted" ? "recover" : "breakdown";
}
