/**
 * Where identity comes from. One place, because a second copy of these URLs is how a
 * staging build ends up pointing at a production realm.
 */
export const authConfig = {
  issuer:
    process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8080",
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "indcore",
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "indcore-api",
  /** Where Keycloak sends the browser back. Must be an exact origin match at runtime. */
  redirectPath: "/callback",
  scope: "openid profile email",
} as const;

export function realmUrl(): string {
  return `${authConfig.issuer}/realms/${authConfig.realm}`;
}

export const endpoints = {
  authorize: () => `${realmUrl()}/protocol/openid-connect/auth`,
  token: () => `${realmUrl()}/protocol/openid-connect/token`,
  logout: () => `${realmUrl()}/protocol/openid-connect/logout`,
} as const;

/** Group name → the tenant it maps to, mirroring the API's TenantMiddleware. */
export const TENANT_LABELS: Readonly<Record<string, string>> = {
  trishul: "Trishul Precision Components",
  kaveri: "Kaveri ElectroFab Industries",
};
