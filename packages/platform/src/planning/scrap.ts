/**
 * HOW MUCH TO START, GIVEN THAT SOME OF IT WILL BE LOST.
 *
 * One function, in one place, because this repository previously had two — and they did
 * not agree. Planning grossed a component up by `1 / (1 - s)`; Production marked it up by
 * `(1 + s)`. Both look like "add the scrap", and for small percentages they nearly are, so
 * the disagreement is invisible in a demo and permanent in a plant:
 *
 *   scrap 5%   plan 105.26   floor 105.00   0.25% apart
 *   scrap 20%  plan 125.00   floor 120.00   4.2%  apart
 *
 * Planning was right, which is why this file carries Planning's formula. If a step yields
 * 95 good parts from every 100 started, then 100 good parts requires 100 / 0.95 = 105.26
 * started. `100 x 1.05` gives 105, of which 5% is lost, leaving 99.75 — a quarter of a part
 * short, every time, for ever. The MRP plan buys the difference and the shop floor never
 * consumes it, so the gap turns into stock nobody ordered and nobody can explain.
 *
 * The rounding is deliberately left to the caller. Planning nets in whole buckets and
 * Production issues in the item's own precision, and a rounding rule imposed here would be
 * wrong for one of them.
 */

/**
 * Gross `qty` up so that `qty` survives a step losing `scrapPct` per cent.
 *
 * A scrap of 100% or more cannot be grossed up — no starting quantity survives a total
 * loss, and the arithmetic runs to infinity. Rather than return `Infinity` (which becomes
 * a `NaN` two multiplications later, in a different module, with no clue where it came
 * from) this treats it as no scrap and reports the refusal through `warning`. A BOM line
 * claiming 100% scrap is a data-entry error, and the caller is the one holding the item
 * code needed to say which line.
 */
export function grossUpForScrap(
  qty: number,
  scrapPct: number,
): { qty: number; factor: number; warning: string | null } {
  if (!Number.isFinite(scrapPct) || scrapPct <= 0) {
    return { qty, factor: 1, warning: null };
  }
  if (scrapPct >= 100) {
    return {
      qty,
      factor: 1,
      warning: `scrap of ${scrapPct}% is a total loss and cannot be grossed up; treated as no scrap`,
    };
  }
  const factor = 1 / (1 - scrapPct / 100);
  return { qty: qty * factor, factor, warning: null };
}

/** The multiplier alone, for callers that already hold the quantity. */
export function scrapFactor(scrapPct: number): number {
  return grossUpForScrap(1, scrapPct).factor;
}
