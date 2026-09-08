import { AppError, Errors, isUuidV7 } from "@ind-core/platform";

/** Verified Keycloak group → tenant mapping for the canonical MVP worlds. */
export const GROUP_TENANT: Readonly<Record<string, string>> = {
  trishul: "0192a8c0-0000-7000-8000-000000000001",
  kaveri: "0192a8c0-0000-7000-8000-000000000002",
};

/**
 * Resolve exactly one tenant from verified groups. Duplicate aliases for the same tenant
 * are harmless; membership in two different tenants is ambiguous and fails closed.
 */
export function tenantIdFromVerifiedGroups(groups: readonly unknown[]): string {
  const tenantIds = new Set(
    groups.flatMap((group) => {
      if (typeof group !== "string") return [];
      const tenantId = GROUP_TENANT[group.replace(/^\//, "")];
      return tenantId ? [tenantId] : [];
    }),
  );
  if (tenantIds.size === 0) throw Errors.tenantMissing();
  if (tenantIds.size > 1) {
    throw new AppError(
      "TENANT_AMBIGUOUS",
      403,
      "The verified identity maps to more than one tenant; select a single tenant before continuing.",
    );
  }
  const tenantId = [...tenantIds][0];
  if (!tenantId || !isUuidV7(tenantId)) throw Errors.tenantMissing();
  return tenantId;
}
