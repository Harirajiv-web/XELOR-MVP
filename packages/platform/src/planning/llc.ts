/**
 * LOW-LEVEL CODE (PLANNING §11.1, validation V-05).
 *
 * MRP nets each item exactly once, at the deepest level it appears in any bill of
 * materials. Without that rule an item used both as a direct component of the pump and as
 * a component of the impeller gets planned twice — once before its impeller demand is
 * known — and the second pass contradicts the first. The low-level code is what makes
 * "process items in ascending level" a correct instruction rather than a hopeful one.
 *
 * A cycle in the BOM is not a planning problem to be worked around; it is a data error
 * that makes the explosion infinite. This rejects it and NAMES THE CYCLE, because a
 * planner told "circular BOM detected" and nothing else has to bisect the product
 * structure by hand to find it.
 */

export interface BomEdge {
  parentItemId: string;
  componentItemId: string;
}

export class CircularBomError extends Error {
  readonly cycle: readonly string[];
  constructor(cycle: readonly string[]) {
    super(`circular BOM: ${cycle.join(" → ")}`);
    this.name = "CircularBomError";
    this.cycle = cycle;
  }
}

/**
 * Kahn's algorithm over the parent→component graph. Returns parents before the components
 * they consume, which is the order the level assignment below depends on.
 */
export function topologicalOrder(itemIds: readonly string[], edges: readonly BomEdge[]): string[] {
  const nodes = new Set<string>(itemIds);
  for (const e of edges) {
    nodes.add(e.parentItemId);
    nodes.add(e.componentItemId);
  }

  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of nodes) {
    children.set(n, []);
    indegree.set(n, 0);
  }
  // Deduplicate: the same component can appear on two lines of one BOM (two different
  // operations consume it). That is one edge for ordering purposes, not two.
  const seen = new Set<string>();
  for (const e of edges) {
    const key = `${e.parentItemId}>${e.componentItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    children.get(e.parentItemId)!.push(e.componentItemId);
    indegree.set(e.componentItemId, (indegree.get(e.componentItemId) ?? 0) + 1);
  }

  // Sorted seeding makes the output deterministic, which matters: a planning run that
  // reorders its own output between two identical inputs cannot be diffed.
  const queue = [...nodes].filter((n) => (indegree.get(n) ?? 0) === 0).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    order.push(n);
    for (const c of children.get(n)!.slice().sort()) {
      const d = (indegree.get(c) ?? 0) - 1;
      indegree.set(c, d);
      if (d === 0) queue.push(c);
    }
  }

  if (order.length !== nodes.size) {
    throw new CircularBomError(findCycle(nodes, children));
  }
  return order;
}

/** Depth-first walk over what Kahn could not drain — the residue is exactly the cycles. */
function findCycle(nodes: Set<string>, children: Map<string, string[]>): string[] {
  const state = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 on stack, 2 done
  const stack: string[] = [];
  for (const n of nodes) state.set(n, 0);

  const walk = (n: string): string[] | null => {
    state.set(n, 1);
    stack.push(n);
    for (const c of children.get(n) ?? []) {
      if (state.get(c) === 1) {
        // Close the loop so the message reads A → B → C → A rather than a bare set.
        const at = stack.indexOf(c);
        return [...stack.slice(at), c];
      }
      if (state.get(c) === 0) {
        const found = walk(c);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(n, 2);
    return null;
  };

  for (const n of [...nodes].sort()) {
    if (state.get(n) === 0) {
      const found = walk(n);
      if (found) return found;
    }
  }
  return [...nodes].sort();
}

/**
 * The level each item must be planned at: 0 for an item nothing consumes, otherwise one
 * deeper than the deepest parent that consumes it.
 */
export function computeLowLevelCodes(itemIds: readonly string[], edges: readonly BomEdge[]): Map<string, number> {
  const order = topologicalOrder(itemIds, edges);
  const llc = new Map<string, number>();
  for (const n of order) llc.set(n, 0);

  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!children.has(e.parentItemId)) children.set(e.parentItemId, []);
    children.get(e.parentItemId)!.push(e.componentItemId);
  }

  for (const parent of order) {
    for (const c of children.get(parent) ?? []) {
      llc.set(c, Math.max(llc.get(c) ?? 0, (llc.get(parent) ?? 0) + 1));
    }
  }
  return llc;
}

/** Every item that consumes `itemId`, directly or indirectly — the where-used closure. */
export function whereUsed(itemId: string, edges: readonly BomEdge[]): string[] {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (!parents.has(e.componentItemId)) parents.set(e.componentItemId, []);
    parents.get(e.componentItemId)!.push(e.parentItemId);
  }
  const out = new Set<string>();
  const queue = [itemId];
  while (queue.length > 0) {
    for (const p of parents.get(queue.shift()!) ?? []) {
      if (out.has(p)) continue;
      out.add(p);
      queue.push(p);
    }
  }
  return [...out].sort();
}
