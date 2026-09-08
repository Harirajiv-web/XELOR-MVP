/** Keycloak access tokens commonly put the client in `azp` while `aud` names APIs. */
export function tokenTargetsClient(
  claims: Readonly<Record<string, unknown>>,
  expectedClientId: string,
): boolean {
  const audience = typeof claims.aud === "string"
    ? [claims.aud]
    : Array.isArray(claims.aud)
      ? claims.aud.filter((value): value is string => typeof value === "string")
      : [];
  return audience.includes(expectedClientId) || claims.azp === expectedClientId;
}
