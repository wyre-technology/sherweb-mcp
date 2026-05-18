/**
 * Health-check liveness probe helpers.
 *
 * `/health` and `/healthz` are shallow, unauthenticated liveness probes.
 * They must never depend on process-wide credentials: in gateway mode
 * credentials arrive per-request via headers, so a credential-gated probe
 * would 503 and cause Azure's liveness probe to SIGTERM-kill the container.
 */

/** JSON body returned by the liveness probe. */
export const HEALTH_RESPONSE = { status: "ok" } as const;

/** Returns true when the request path is a liveness-probe endpoint. */
export function isHealthPath(pathname: string): boolean {
  return pathname === "/health" || pathname === "/healthz";
}
