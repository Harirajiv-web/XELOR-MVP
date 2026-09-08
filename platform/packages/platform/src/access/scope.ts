/**
 * ROW SCOPING AND FIELD MASKING (ADMINISTRATION §9.4, §11).
 *
 * A permission answers "may this person read work orders?". A scope answers "*which*
 * work orders?", and a field mask answers "how much of each one?". Skipping either turns
 * a shop-floor operator into somebody who can read every plant's costs — with a perfectly
 * correct permission grid on the screen.
 *
 * Two rules that look like defaults and are load-bearing:
 *
 *  - **No scope row means NO ACCESS, not all access.** A user granted `read` on work
 *    orders with no plant assigned sees nothing. The opposite default — unscoped means
 *    unrestricted — is the single most common way a scoping model leaks, because it makes
 *    forgetting to configure something indistinguishable from deciding not to.
 *
 *  - **Masking is applied on the way OUT, to whole rows.** A masked field never reaches
 *    the client. Hiding it in the UI leaves it in the JSON, and the JSON is one browser
 *    devtools tab away from the person it was hidden from.
 */

export type ScopeDimension = "company" | "branch" | "warehouse" | "cost_center" | "department" | "plant";

export interface ScopeGrant {
  dimension: ScopeDimension;
  /** The id the user is scoped to within that dimension. */
  valueId: string;
  /** Restrict this scope to one doctype; null means it applies to every doctype. */
  applyToDocType?: string | null;
  isDefault?: boolean;
}

export interface ResolvedScope {
  dimension: ScopeDimension;
  /** The ids a query must be restricted to. Empty means "no access". */
  valueIds: string[];
}

export interface ScopeResult {
  /** Empty when the user has no scope at all — the caller MUST return nothing. */
  scopes: ResolvedScope[];
  unrestricted: boolean;
  reason: string;
}

/**
 * Resolve the scopes that apply to one doctype.
 *
 * `unrestricted` is only ever true when it was granted explicitly by a role carrying the
 * unrestricted flag — never as a consequence of missing configuration.
 */
export function scopeFor(
  docType: string,
  grants: readonly ScopeGrant[],
  opts: { hasUnrestrictedRole?: boolean } = {},
): ScopeResult {
  if (opts.hasUnrestrictedRole) {
    return {
      scopes: [],
      unrestricted: true,
      reason: "This user holds a role granted unrestricted row access, so no scope predicate is applied.",
    };
  }

  const applicable = grants.filter((g) => !g.applyToDocType || g.applyToDocType === docType);
  if (applicable.length === 0) {
    return {
      scopes: [],
      unrestricted: false,
      reason: `No row scope is assigned for ${docType}. Nothing is visible — an unassigned scope means no access, not all access.`,
    };
  }

  const byDim = new Map<ScopeDimension, Set<string>>();
  for (const g of applicable) {
    if (!byDim.has(g.dimension)) byDim.set(g.dimension, new Set());
    byDim.get(g.dimension)!.add(g.valueId);
  }

  const scopes = [...byDim.entries()]
    .map(([dimension, ids]) => ({ dimension, valueIds: [...ids].sort() }))
    .sort((a, b) => a.dimension.localeCompare(b.dimension));

  return {
    scopes,
    unrestricted: false,
    reason: scopes
      .map((s) => `${s.dimension}: ${s.valueIds.length} value(s)`)
      .join("; "),
  };
}

/**
 * Whether one row passes the resolved scope.
 *
 * Dimensions are ANDed and values within a dimension are ORed: a user scoped to two plants
 * and one cost centre sees rows in either plant AND that cost centre. ORing the dimensions
 * instead would let a single plant grant reach every cost centre in it, which is the
 * opposite of what the second dimension was added for.
 */
export function rowInScope(row: Partial<Record<ScopeDimension, string | null | undefined>>, result: ScopeResult): boolean {
  if (result.unrestricted) return true;
  if (result.scopes.length === 0) return false;
  return result.scopes.every((s) => {
    const v = row[s.dimension];
    return typeof v === "string" && s.valueIds.includes(v);
  });
}

export function describeScope(docType: string, result: ScopeResult): string {
  if (result.unrestricted) return `Every ${docType} row — this user's role grants unrestricted row access.`;
  if (result.scopes.length === 0) return `No ${docType} rows — this user has no row scope assigned.`;
  return `${docType} rows where ${result.scopes.map((s) => `${s.dimension} is one of ${s.valueIds.length}`).join(" and ")}.`;
}
