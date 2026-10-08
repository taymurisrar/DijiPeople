/**
 * Pure helpers for the Platform Admin error-log console
 * (`/settings/monitoring/error-logs`).
 *
 * Kept out of the components because `apps/admin`'s jest runs with no jsdom:
 * which URL parameters reach the API, how an old link is rewritten, and how a
 * stored value is presented are the rules most likely to break silently, and
 * a `.ts` file with no React in it is directly testable.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The parameters the console owns, in the URL and on the API.
 *
 * Every one of them is a working, server-side filter. The previous screen
 * also forwarded `userId`, `category`, `route`, `method` and `correlationId`
 * from a panel of free-text inputs that asked an operator for UUIDs; search
 * covers the reference, error code and route, and the tenant is chosen by
 * name, so those inputs are gone. The API still accepts them for old links.
 */
export const ERROR_LOG_URL_KEYS = [
  "page",
  "pageSize",
  "sortBy",
  "sortDirection",
  "search",
  "severity",
  "status",
  "sourceApp",
  "environment",
  "module",
  "tenantId",
  "period",
  "from",
  "to",
] as const;

/** Keys forwarded verbatim from an old link, though no control sets them. */
const LEGACY_PASSTHROUGH_KEYS = [
  "reference",
  "correlationId",
  "userId",
  "category",
  "route",
  "method",
] as const;

/** Filter keys, i.e. the URL keys that are not paging or sorting. */
export const ERROR_LOG_FILTER_KEYS = [
  "search",
  "severity",
  "status",
  "sourceApp",
  "environment",
  "module",
  "tenantId",
  "period",
  "from",
  "to",
] as const;

export type ErrorLogFilterKey = (typeof ERROR_LOG_FILTER_KEYS)[number];

/** The query parameter that names the incident open in the detail drawer. */
export const INCIDENT_PARAM = "ref";

export const PERIOD_OPTIONS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
] as const;

export const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
] as const;

/**
 * `UNRESOLVED` is every working state at once — the API's open predicate —
 * and is what an operator usually means; the individual statuses follow it.
 */
export const STATUS_FILTER_OPTIONS = [
  { value: "UNRESOLVED", label: "Unresolved" },
  { value: "NEW", label: "New" },
  { value: "INVESTIGATING", label: "Investigating" },
  { value: "WAITING_ON_CUSTOMER", label: "Waiting on customer" },
  { value: "FIX_IN_PROGRESS", label: "Fix in progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "NOT_AN_INCIDENT", label: "Not an incident" },
] as const;

/** The statuses a person can set from the drawer — the API's own list. */
export const SUPPORT_STATUS_OPTIONS = STATUS_FILTER_OPTIONS.filter(
  (option) => option.value !== "UNRESOLVED",
);

export const SUPPORT_TEAMS = [
  "Customer Support",
  "Engineering",
  "Billing Support",
  "Platform Operations",
] as const;

function single(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/**
 * The query string forwarded to `GET /platform/logs/events`.
 *
 * Only declared keys pass: the API validates with `forbidNonWhitelisted`, so
 * forwarding an unrelated URL parameter (the drawer's `ref`, say) would turn
 * the whole page into a 400.
 */
export function buildErrorLogApiQuery(searchParams: SearchParams) {
  const params = new URLSearchParams();
  for (const key of [...ERROR_LOG_URL_KEYS, ...LEGACY_PASSTHROUGH_KEYS]) {
    const value = single(searchParams[key]);
    if (!value) continue;
    // `all` is the absence of a window, not a value the API filters on.
    if (key === "period" && value === "all") continue;
    params.set(key, value);
  }
  if (!params.has("pageSize")) params.set("pageSize", "25");
  return params.toString();
}

/**
 * Rewrites a link written for the old view selector (`?viewId=open`) into the
 * filters this console shows, or returns null when there is nothing to rewrite.
 *
 * Applying the view invisibly would leave the filter bar reading "All" over a
 * filtered list — the exact disagreement between a control and its result the
 * monitoring screens have been fixed for repeatedly (BUG-1750, BUG-2495).
 * The operations dashboard still links here with `viewId=open`.
 */
export function canonicalizeLegacyView(
  searchParams: SearchParams,
): string | null {
  const viewId = single(searchParams.viewId);
  const viewKey = single(searchParams.viewKey);
  const view = viewId || viewKey;
  if (!view) return null;

  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(searchParams)) {
    if (key === "viewId" || key === "viewKey") continue;
    const value = single(raw);
    if (value) params.set(key, value);
  }
  const mapping: Record<string, [string, string]> = {
    critical: ["severity", "critical"],
    open: ["status", "UNRESOLVED"],
    new: ["status", "NEW"],
    investigating: ["status", "INVESTIGATING"],
    resolved: ["status", "RESOLVED"],
  };
  const target = mapping[view];
  if (target && !params.has(target[0])) params.set(target[0], target[1]);
  return params.toString();
}

export type SeverityGroup = "critical" | "warning" | "info" | "other";

/**
 * The display group for a stored severity. The API sends `severityGroup`; this
 * is the fallback for an older response, using the same lists.
 */
export function severityGroupOf(
  severity: string | null | undefined,
  provided?: string | null,
): SeverityGroup {
  if (
    provided === "critical" ||
    provided === "warning" ||
    provided === "info" ||
    provided === "other"
  ) {
    return provided;
  }
  const value = (severity ?? "").toLowerCase();
  if (["error", "fatal", "critical"].includes(value)) return "critical";
  if (["warning", "warn"].includes(value)) return "warning";
  if (value === "info") return "info";
  return "other";
}

export const SEVERITY_LABEL: Record<SeverityGroup, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
  other: "Other",
};

const SOURCE_LABEL: Record<string, string> = {
  web: "Tenant app",
  admin: "Platform admin",
  api: "API",
};

/** `web` is the tenant product; saying "Web" next to "Admin" read as a pair. */
export function formatSourceApp(value: string | null | undefined) {
  if (!value) return "Unknown";
  return SOURCE_LABEL[value.toLowerCase()] ?? titleCase(value);
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * One line of message for a table cell.
 *
 * A message can carry a whole stack when a client reported one; the cell shows
 * the first line only, bounded, and the drawer shows the rest.
 */
export function summarizeMessage(
  message: string | null | undefined,
  max = 140,
) {
  const firstLine = (message ?? "").split(/\r?\n/, 1)[0]!.trim();
  if (!firstLine) return "No message recorded";
  return firstLine.length > max
    ? `${firstLine.slice(0, max - 1).trimEnd()}…`
    : firstLine;
}

/**
 * The request a row describes: `POST /api/payroll/runs`. The query string is
 * dropped from the cell — it is in the drawer, and it is where ids and search
 * terms live.
 */
export function formatRequest(
  method: string | null | undefined,
  route: string | null | undefined,
) {
  const path = (route ?? "").split("?", 1)[0] ?? "";
  if (!method && !path) return "";
  if (!path) return method ?? "";
  return method && method !== "CLIENT" ? `${method} ${path}` : path;
}

/** The label of the active period, for the metric captions. */
export function describePeriod(searchParams: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const option = PERIOD_OPTIONS.find(
    (item) => item.value === searchParams.period,
  );
  if (option && option.value !== "all") return option.label.toLowerCase();
  if (searchParams.from || searchParams.to) return "selected dates";
  return "all time";
}

/**
 * Pretty-prints a diagnostic payload for the drawer, or null when there is
 * nothing to show — an empty object is "nothing" here, not a block reading
 * `{}` that an operator has to read to learn it is empty.
 */
export function formatPayload(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return null;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}
