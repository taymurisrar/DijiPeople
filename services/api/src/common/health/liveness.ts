/**
 * Liveness: "is this process up and able to answer HTTP?" and nothing else.
 *
 * This module imports nothing on purpose. A liveness answer that depends on the
 * database, a cache, another service or the configuration layer turns a fault in
 * that dependency into a restart of a healthy process.
 *
 * `/api` and `/api/health` are NOT liveness. They report entitlement
 * enforcement, which reads `PlatformSetting` from the database whenever its
 * 30 second cache has expired (`TenantEntitlementService.effectiveMode`). The
 * read is wrapped so a fault never fails the route: measured locally with the
 * database refusing connections, `/api` still answered 200 in 61 ms. What it does
 * not bound is a database that HANGS instead of refusing: that read then waits
 * for the pool connection timeout (15 s by default), which was not measured and
 * could exceed a platform health-check timeout. So those routes are
 * database-tolerant, not database-independent. They stay as they are because the
 * deployment smoke test reads enforcement from them; a restart decision must use
 * this route instead (ITEM-0236).
 *
 * Readiness, which does probe the database, is `/api/health/ready`.
 */
export type LivenessReport = {
  status: 'ok';
  timestamp: string;
};

export function livenessReport(
  now: () => Date = () => new Date(),
): LivenessReport {
  return { status: 'ok', timestamp: now().toISOString() };
}
