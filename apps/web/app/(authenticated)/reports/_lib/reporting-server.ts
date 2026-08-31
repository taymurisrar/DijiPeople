import { apiRequestJson } from "@/lib/server-api";
import type { TenantResolvedSettingsResponse } from "../../settings/types";
import type {
  AnalyticsRecordsResult,
  AnalyticsResult,
  NamedLookupRecord,
  RecentReportView,
  ReportCatalog,
  ReportLibrary,
  ReportRunResult,
  SavedView,
} from "./reporting-types";
import type {
  AnalyticsQueryBody,
  AnalyticsRecordsBody,
  RunReportBody,
} from "./analytics-request";
import type { ResolvedScopeFilter } from "./analytics-surfaces";
import type { ReportSchedule } from "./reporting-browser";

/*
 * Server-side reads for the reporting workspace.
 *
 * Every one of these goes through `lib/server-api.ts` — the cookie auth, the
 * `X-DijiPeople-App` header, the refresh-on-401 and the error normalisation all
 * live there, and `apps/web/AGENTS.md` forbids fetching the API directly.
 *
 * The `.catch(() => null)` on the optional reads is deliberate and narrow.
 * A missing department lookup should cost the page a *filter dropdown*, not the
 * whole report; a failed analytics query should not be swallowed, because a
 * silently empty chart is indistinguishable from an honest zero. So the
 * optional things degrade and the load-bearing things throw into `error.tsx`.
 */

export type ReportingFormatting = {
  timezone: string;
  currency: string;
  locale: string;
  dateFormat: string;
};

const FALLBACK_FORMATTING: ReportingFormatting = {
  timezone: "UTC",
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/dd/yyyy",
};

/**
 * The tenant's regional settings, for the period maths and the currency code.
 *
 * Falls back rather than throwing: a reporting screen that cannot be rendered
 * because the settings row is missing is a worse outcome than one rendered in
 * UTC with a note. `system` overrides `organization` here in the same order the
 * rest of the app resolves it.
 */
export async function getReportingFormatting(): Promise<ReportingFormatting> {
  const resolved = await apiRequestJson<TenantResolvedSettingsResponse>(
    "/tenant-settings/resolved",
  ).catch(() => null);

  if (!resolved) return FALLBACK_FORMATTING;

  return {
    timezone:
      resolved.system?.defaultTimezone ||
      resolved.organization?.timezone ||
      FALLBACK_FORMATTING.timezone,
    currency:
      resolved.system?.defaultCurrency ||
      resolved.organization?.currency ||
      FALLBACK_FORMATTING.currency,
    locale: resolved.system?.locale || FALLBACK_FORMATTING.locale,
    dateFormat:
      resolved.system?.dateFormat ||
      resolved.organization?.dateFormat ||
      FALLBACK_FORMATTING.dateFormat,
  };
}

export function fetchReportCatalog(): Promise<ReportCatalog> {
  return apiRequestJson<ReportCatalog>("/reporting/catalog");
}

export function runAnalyticsQuery(
  body: AnalyticsQueryBody,
): Promise<AnalyticsResult> {
  return apiRequestJson<AnalyticsResult>("/reporting/analytics/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runAnalyticsRecords(
  body: AnalyticsRecordsBody,
): Promise<AnalyticsRecordsResult> {
  return apiRequestJson<AnalyticsRecordsResult>("/reporting/analytics/records", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchReportLibrary(): Promise<ReportLibrary> {
  return apiRequestJson<ReportLibrary>("/reporting/reports");
}

export function executeReport(body: RunReportBody): Promise<ReportRunResult> {
  return apiRequestJson<ReportRunResult>("/reporting/reports/execute", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchFavorites(): Promise<string[]> {
  return apiRequestJson<string[]>("/reporting/favorites").catch(() => []);
}

export function fetchRecents(): Promise<RecentReportView[]> {
  return apiRequestJson<RecentReportView[]>("/reporting/recents").catch(() => []);
}

export function fetchSavedViews(surfaceKey: string): Promise<SavedView[]> {
  return apiRequestJson<SavedView[]>(
    `/reporting/saved-views?surfaceKey=${encodeURIComponent(surfaceKey)}`,
  ).catch(() => []);
}

export type ScopeFilterOptions = Record<
  string,
  readonly { value: string; label: string }[]
>;

/**
 * Options for the scope dropdowns, keyed by URL parameter.
 *
 * Only the filters the surface actually resolved are fetched, and a lookup that
 * fails contributes an empty list — which the filter bar then does not render,
 * because a Department dropdown with no departments in it is a control that
 * cannot do anything.
 *
 * The option **value is the name, not the id**: `<source>.department` resolves
 * to the Prisma path `department.name`, so an id-valued filter matches no rows
 * and reports it as an honest zero. That is the single easiest thing to get
 * wrong here and the reason this is a function rather than six inline fetches.
 */
export async function fetchScopeFilterOptions(
  scopeFilters: readonly ResolvedScopeFilter[],
): Promise<ScopeFilterOptions> {
  const entries = await Promise.all(
    scopeFilters.map(async (binding) => {
      if (binding.staticOptions) {
        return [binding.param, binding.staticOptions] as const;
      }

      if (!binding.lookupPath) return [binding.param, []] as const;

      const rows = await apiRequestJson<NamedLookupRecord[]>(
        binding.lookupPath,
      ).catch(() => [] as NamedLookupRecord[]);

      const options = (Array.isArray(rows) ? rows : [])
        .filter((row) => typeof row?.name === "string" && row.name.trim())
        .map((row) => ({ value: row.name, label: row.name }));

      return [binding.param, dedupeByValue(options)] as const;
    }),
  );

  return Object.fromEntries(entries);
}

function dedupeByValue(
  options: readonly { value: string; label: string }[],
): { value: string; label: string }[] {
  const seen = new Set<string>();
  const unique: { value: string; label: string }[] = [];

  for (const option of options) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    unique.push(option);
  }

  return unique;
}

/**
 * The schedules in this workspace.
 *
 * `GET /reporting/schedules` requires `reports.schedule.manage`, so a caller
 * without it gets a 403 rather than an empty list — which is why this returns
 * `null` on failure instead of `[]`. The two are different screens: "you cannot
 * manage schedules" and "there are no schedules" must not look the same.
 */
export async function fetchReportSchedules(): Promise<ReportSchedule[] | null> {
  return apiRequestJson<ReportSchedule[]>("/reporting/schedules").catch(
    () => null,
  );
}

export type ReportDeliveryCapability = {
  canDeliver: boolean;
  providerType: string | null;
};

/**
 * Whether this workspace can actually email a scheduled report.
 *
 * Failure resolves to `canDeliver: true` on purpose. This drives a warning
 * banner, and a banner that appears whenever an unrelated request fails would
 * tell people their email is broken every time the network hiccups — which
 * teaches them to ignore it, and the one time it is right they will.
 */
export async function fetchReportDeliveryCapability(): Promise<ReportDeliveryCapability> {
  return apiRequestJson<ReportDeliveryCapability>(
    "/reporting/schedules/delivery-capability",
  ).catch(() => ({ canDeliver: true, providerType: null }));
}
