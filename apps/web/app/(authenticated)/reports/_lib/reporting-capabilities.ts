import { apiRequest } from "@/lib/server-api";

/*
 * Export and scheduling: one place that decides whether they exist yet.
 *
 * Those two capabilities are being built in a parallel stream and their
 * endpoints are not in the `/reporting` contract this work package was written
 * against — `ReportSchedule`, `ReportRun`, `ReportExportFormat` and the export
 * and schedule services are all present in `services/api`, but
 * `reporting.controller.ts` exposes no route to any of them.
 *
 * The rule this file exists to enforce is that **no control is rendered that
 * cannot work**. A greyed-out "Export" that 404s, or a Scheduled page listing
 * nothing because the endpoint is absent, are both worse than the honest
 * statement that the capability is not available yet: the first looks like a
 * bug in the user's tenant and the second looks like they have no schedules.
 *
 * So availability is *probed*, not assumed and not configured. A GET against
 * the endpoint is made once per server process per TTL; a 404 means the route
 * does not exist, and anything else — including a 403, which means the route
 * exists and this caller may not use it — means it does.
 *
 * ── Turning them on ───────────────────────────────────────────────────────
 *
 * A capability is offered only when **both** halves are true:
 *
 * 1. `CONTRACT_CONFIRMED[key]` is `true` — someone has checked this app's
 *    request shape against the endpoint's actual DTO; and
 * 2. the probe finds the route.
 *
 * The first half is not ceremony. The API validates with
 * `forbidNonWhitelisted: true`, so a body with one field the DTO does not
 * declare is a 400 — which means a control wired to a guessed request shape is
 * a *dead control that looks alive*, the precise thing this module exists to
 * prevent. A probe can tell that a route exists; it cannot tell that we are
 * calling it correctly.
 *
 * So, to turn them on:
 *
 * - Compare `ExportMenu`'s request body with the export endpoint's DTO and
 *   `scheduled/page.tsx`'s expectations with the schedule endpoint's response,
 *   correcting either if they differ.
 * - If the routes landed on different paths, change the `path` strings in
 *   `CAPABILITY_PROBES` below.
 * - Set the relevant entry of `CONTRACT_CONFIRMED` to `true`.
 *
 * That is the whole change; every call site reads this module and
 * `ReportingCapabilities` is the only shape any component sees.
 *
 * `FORCED_CAPABILITIES` short-circuits both halves, for a demo or to hide a
 * route that exists but is not ready.
 */

export type ReportingCapabilityKey = "export" | "schedule";

export type ReportingCapabilities = Record<ReportingCapabilityKey, boolean>;

/**
 * Set an entry to `true` or `false` to override the probe. `null` probes.
 *
 * Deliberately a constant rather than an environment variable: a new env var
 * has to be registered in `packages/config` validation, `turbo.json`
 * `globalEnv`, `render.yaml` and `docs/environment-variables.md`, which is a
 * lot of surface for a switch that becomes dead the week the endpoints land.
 */
const FORCED_CAPABILITIES: Partial<Record<ReportingCapabilityKey, boolean>> = {};

/**
 * Has this app's request shape been checked against the endpoint's DTO?
 *
 * Both were `false` while the endpoints did not exist. They landed during this
 * work package, and both shapes have since been read field by field:
 *
 * - **export** — `CreateReportExportDto`: `targetKey` (required),
 *   `format` (required, `CSV | XLSX | PDF`), and optional `preset`, `from`,
 *   `to`, `filters`. `ExportMenu` sends exactly those and nothing else. Note it
 *   takes a **targetKey**, so an analytics surface has no export — the
 *   orchestrator runs `runAll`, which refuses a `srf:` target.
 * - **schedule** — `CreateReportScheduleDto` for writes, and the shape
 *   `ReportScheduleService.present()` returns for reads.
 *   `UpdateReportScheduleDto` is a **full replace**, which is why the pause
 *   toggle round-trips every field.
 *
 * Flip one back to `false` if its endpoint is withdrawn, and re-read the DTO
 * before flipping it on again.
 */
const CONTRACT_CONFIRMED: Record<ReportingCapabilityKey, boolean> = {
  export: true,
  schedule: true,
};

/**
 * Where each capability is expected to live.
 *
 * `method` is GET for both because a HEAD against a Nest route that only
 * declares GET returns 404 in some configurations, which would report a live
 * endpoint as missing. A list endpoint with no side effects is the safe probe.
 */
const CAPABILITY_PROBES: Record<
  ReportingCapabilityKey,
  { path: string; method: "GET" }
> = {
  export: { path: "/reporting/exports", method: "GET" },
  schedule: { path: "/reporting/schedules", method: "GET" },
};

/**
 * How long a probe result is trusted.
 *
 * Short enough that the controls appear within a minute of the endpoints
 * shipping, long enough that a reporting page render does not add two extra
 * round trips to the API every time.
 */
const PROBE_TTL_MS = 60_000;

const NO_CAPABILITIES: ReportingCapabilities = { export: false, schedule: false };

type ProbeCacheEntry = { available: boolean; checkedAt: number };

const probeCache = new Map<ReportingCapabilityKey, ProbeCacheEntry>();

/**
 * Whether the reporting export and schedule endpoints are live.
 *
 * Never throws. A probe that fails for any reason at all reports the capability
 * as unavailable, because "we could not tell" and "it is not there" have the
 * same correct rendering: do not offer the control.
 */
export async function getReportingCapabilities(): Promise<ReportingCapabilities> {
  const keys = Object.keys(CAPABILITY_PROBES) as ReportingCapabilityKey[];

  const results = await Promise.all(
    keys.map(async (key) => [key, await isCapabilityAvailable(key)] as const),
  );

  return results.reduce<ReportingCapabilities>(
    (accumulator, [key, available]) => ({ ...accumulator, [key]: available }),
    { ...NO_CAPABILITIES },
  );
}

async function isCapabilityAvailable(
  key: ReportingCapabilityKey,
): Promise<boolean> {
  const forced = FORCED_CAPABILITIES[key];
  if (typeof forced === "boolean") return forced;

  /*
   * Checked before the probe, and deliberately not cached: while this is false
   * the endpoint is never called at all, so a page render costs nothing and the
   * "not built yet" copy is reached without a round trip.
   */
  if (!CONTRACT_CONFIRMED[key]) return false;

  const cached = probeCache.get(key);
  if (cached && Date.now() - cached.checkedAt < PROBE_TTL_MS) {
    return cached.available;
  }

  const probe = CAPABILITY_PROBES[key];
  let available = false;

  try {
    const response = await apiRequest(probe.path, {
      method: probe.method,
      timeoutMs: 5_000,
    });

    /*
     * 404 and 501 mean the route is not there. Everything else means it is —
     * a 403 in particular is a *positive* answer: the endpoint exists and
     * refused this caller, which is the API doing its job. Rendering the
     * control and letting the API refuse is correct; hiding it because one
     * user lacks the permission would hide it from everyone.
     */
    available = response.status !== 404 && response.status !== 501;
  } catch {
    /* Network failure, timeout, unconfigured base URL: treat as absent. */
    available = false;
  }

  probeCache.set(key, { available, checkedAt: Date.now() });
  return available;
}

/**
 * What to tell someone who reached a capability's page before it exists.
 *
 * Exported so the copy is written once and cannot drift between the page and
 * the navigation.
 */
export const CAPABILITY_UNAVAILABLE_COPY: Record<
  ReportingCapabilityKey,
  { title: string; description: string }
> = {
  export: {
    title: "Exporting is not available yet",
    description:
      "Report exports are still being built. When the export service is live this control appears on every report and analytics surface with no change to your workspace.",
  },
  schedule: {
    title: "Scheduled reports are not available yet",
    description:
      "Scheduled delivery is still being built. Nothing is scheduled and nothing is being emailed - this page will list your schedules once the service is live.",
  },
};
