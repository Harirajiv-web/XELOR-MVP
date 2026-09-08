/**
 * FORECAST CONSUMPTION (PLANNING §11.2).
 *
 * A factory has two kinds of independent demand for the same item: what sales actually
 * sold, and what the forecast says they will sell. Adding them is the classic MRP error —
 * it plans the same pump twice and the plant builds inventory it was never asked for.
 *
 * The rule is `demand(t) = max(Forecast(t), Orders(t))`: real orders CONSUME the forecast
 * they were predicted by, and only the unconsumed remainder still counts as demand. The
 * consumption window exists because an order rarely lands in the bucket its forecast sat
 * in — a customer who orders for W32 against a W31 forecast has consumed that forecast,
 * and a system that cannot see one bucket backwards double-counts them.
 */

export interface DemandBucket {
  bucket: string;
  forecastQty: number;
  orderQty: number;
}

export interface ConsumedBucket extends DemandBucket {
  /** Forecast absorbed by real orders in this bucket, after the window redistribution. */
  consumedQty: number;
  /** Forecast left over — the part still driving demand on its own. */
  remainingForecast: number;
  /** What MPS and MRP actually consume: max(F, O) after redistribution. */
  netDemand: number;
  /** Orders that found no forecast anywhere in their window. */
  unforecastOrderQty: number;
}

export interface ConsumptionWindow {
  /** Buckets an order may reach backwards to consume forecast. Default 1. */
  backward: number;
  /** Buckets it may reach forwards. Default 1. */
  forward: number;
}

export const DEFAULT_CONSUMPTION_WINDOW: ConsumptionWindow = { backward: 1, forward: 1 };

/**
 * Redistribute order quantities against forecast across the window, then report the
 * per-bucket demand MRP should net against.
 *
 * The order of consumption is deliberate and matches the spec: own bucket first, then
 * backward, then forward. An order consumes the forecast nearest to it in time, and a
 * stale forecast behind it before an optimistic one ahead of it.
 */
export function consumeForecast(
  buckets: readonly DemandBucket[],
  window: ConsumptionWindow = DEFAULT_CONSUMPTION_WINDOW,
): ConsumedBucket[] {
  const remaining = buckets.map((b) => Math.max(0, b.forecastQty));
  const consumedInBucket = buckets.map(() => 0);
  const unforecast = buckets.map(() => 0);

  buckets.forEach((b, i) => {
    let hungry = Math.max(0, b.orderQty);
    if (hungry === 0) return;

    // Own bucket, then backward one at a time, then forward one at a time.
    const reach: number[] = [i];
    for (let d = 1; d <= window.backward; d += 1) reach.push(i - d);
    for (let d = 1; d <= window.forward; d += 1) reach.push(i + d);

    for (const j of reach) {
      if (hungry <= 0) break;
      if (j < 0 || j >= buckets.length) continue;
      const take = Math.min(hungry, remaining[j]!);
      if (take <= 0) continue;
      remaining[j]! -= take;
      consumedInBucket[j]! += take;
      hungry -= take;
    }
    unforecast[i] = round3(hungry);
  });

  return buckets.map((b, i) => {
    // The spec is explicit: after redistribution the demand fed forward is still the
    // per-bucket max(F, O). Consumption bookkeeping explains that number; it does not
    // replace it.
    const netDemand = Math.max(Math.max(0, b.forecastQty), Math.max(0, b.orderQty));
    return {
      ...b,
      consumedQty: round3(consumedInBucket[i]!),
      remainingForecast: round3(remaining[i]!),
      netDemand: round3(netDemand),
      unforecastOrderQty: unforecast[i]!,
    };
  });
}

/**
 * How much of the forecast the orders actually justified, across the horizon.
 *
 * Reported as a plain fraction rather than an accuracy score: it is a conversation opener
 * with the sales team, not a grade. A forecast consumed at 40% is not "60% wrong" — some
 * of it may simply not have been ordered yet.
 */
export function consumptionSummary(rows: readonly ConsumedBucket[]): {
  forecastTotal: number;
  orderTotal: number;
  consumedTotal: number;
  unforecastTotal: number;
  consumedFraction: number | null;
  note: string;
} {
  const forecastTotal = round3(rows.reduce((a, r) => a + Math.max(0, r.forecastQty), 0));
  const orderTotal = round3(rows.reduce((a, r) => a + Math.max(0, r.orderQty), 0));
  const consumedTotal = round3(rows.reduce((a, r) => a + r.consumedQty, 0));
  const unforecastTotal = round3(rows.reduce((a, r) => a + r.unforecastOrderQty, 0));
  const consumedFraction = forecastTotal > 0 ? Math.round((consumedTotal / forecastTotal) * 1000) / 1000 : null;

  const note =
    unforecastTotal > 0
      ? `${fmt(unforecastTotal)} of orders had no forecast behind them — demand is arriving that the plan did not anticipate.`
      : forecastTotal > 0 && consumedTotal === 0
        ? "No forecast has been consumed yet — every bucket is still running on the forecast alone."
        : "Orders and forecast are reconciling within the consumption window.";

  return { forecastTotal, orderTotal, consumedTotal, unforecastTotal, consumedFraction, note };
}

function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round3(n));
}
