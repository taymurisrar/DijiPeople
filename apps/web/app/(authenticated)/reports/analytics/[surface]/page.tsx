import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import {
  readAnalyticsFilters,
  suggestedGranularity,
  type AnalyticsScopeFilter,
} from "@/app/components/filters";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { AnalyticsSurfaceView } from "../../_components/analytics-surface-view";
import {
  buildBucketFilter,
  buildScopeFilters,
  getSurfaceDefinition,
  resolveSurface,
  sortableFieldKeys,
  supportsBucketDrilldown,
} from "../../_lib/analytics-surfaces";
import {
  buildAnalyticsQueryBody,
  buildAnalyticsRecordsBody,
  DEFAULT_RECORD_PAGE_SIZE,
  readPositiveInteger,
} from "../../_lib/analytics-request";
import {
  fetchReportCatalog,
  fetchSavedViews,
  fetchScopeFilterOptions,
  getReportingFormatting,
  runAnalyticsQuery,
  runAnalyticsRecords,
} from "../../_lib/reporting-server";
import type { ReportFilterInput } from "../../_lib/reporting-types";

/*
 * One analytics surface, loaded on the server.
 *
 * The whole page is a function of the URL. Every filter, the period, the
 * comparison, the source, the breakdown, the drill-down bucket, the sort and
 * the page are query parameters; nothing is component state and nothing is
 * fetched in the browser. That is what makes a view bookmarkable, shareable and
 * reproducible — and it is also what makes the back button work, which is the
 * thing readers actually notice.
 *
 * The period is *not* resolved here. It is sent as a preset and resolved by the
 * API in the tenant's timezone, and the resolved dates come back in the
 * response and are what the screen prints. Resolving it in two places is how a
 * chart legend ends up naming a different fortnight from the numbers under it.
 */

type PageProps = {
  params: Promise<{ surface: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnalyticsSurfacePage({
  params,
  searchParams,
}: PageProps) {
  const [{ surface }, resolvedSearchParams, user] = await Promise.all([
    params,
    searchParams
      ? searchParams
      : Promise.resolve({} as Record<string, string | string[] | undefined>),
    requireSessionUser("/reports"),
  ]);

  const definition = getSurfaceDefinition(surface);
  if (!definition) notFound();

  if (!hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.REPORTS_READ])) {
    return (
      <AccessDeniedState
        actionHref="/reports"
        actionLabel="Back to the reporting overview"
        description="Your role does not include access to the reporting workspace. Reporting access is granted separately from the modules it reports on."
        title="Analytics is unavailable for your account."
      />
    );
  }

  const [catalog, formatting] = await Promise.all([
    fetchReportCatalog(),
    getReportingFormatting(),
  ]);

  const single = (key: string) => {
    const raw = resolvedSearchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  const plan = resolveSurface(definition, catalog, {
    source: single("src"),
    groupBy: single("groupBy"),
    trend: single("trend"),
  });

  if (!plan) {
    return (
      <AccessDeniedState
        actionHref="/reports"
        actionLabel="Back to the reporting overview"
        description={`None of the data behind ${definition.label} is available to your role, or the modules it reports on are not enabled for this workspace.`}
        title={`${definition.label} analytics is unavailable.`}
      />
    );
  }

  const filterState = readAnalyticsFilters(
    resolvedSearchParams as Record<string, string | string[] | undefined>,
  );

  const scopeFilterInputs = buildScopeFilters(filterState, plan.scopeFilters);

  const breakdownFieldDefinition = plan.source.fields.find(
    (field) => field.key === plan.breakdownField,
  );
  const canDrillDown = supportsBucketDrilldown(breakdownFieldDefinition);

  const bucketLabel = single("bucket");
  const bucketKey = single("bucketKey");

  const bucketFilter: ReportFilterInput | null =
    canDrillDown && bucketLabel
      ? buildBucketFilter(breakdownFieldDefinition, {
          key: bucketKey ?? bucketLabel,
          label: bucketLabel,
        })
      : null;

  const period = {
    preset: filterState.preset ?? "last_30_days",
    from: filterState.from,
    to: filterState.to,
    comparison: filterState.compare,
  };

  const granularity = single("granularity");

  const queryBody = buildAnalyticsQueryBody({
    sourceKey: plan.source.key,
    period,
    filters: scopeFilterInputs,
    metricKeys: plan.metricKeys,
    breakdown: plan.breakdownField,
    trendMetricKey: plan.trendMetricKey,
    granularity,
  });

  /*
   * The record table carries the drill-down filter as well as the scope
   * filters; the charts do not. That is the point of a drill-down: the bars
   * keep showing every group so the reader can see where they are, while the
   * rows below show only the group they clicked.
   */
  const [orderField, orderDirection] = parseOrderBy(single("orderBy"));

  const recordsBody = buildAnalyticsRecordsBody({
    sourceKey: plan.source.key,
    period,
    filters: bucketFilter
      ? [...scopeFilterInputs, bucketFilter]
      : scopeFilterInputs,
    fields: plan.drillFieldKeys,
    page: readPositiveInteger(resolvedSearchParams.page, 1),
    pageSize: readPositiveInteger(
      resolvedSearchParams.pageSize,
      DEFAULT_RECORD_PAGE_SIZE,
    ),
    sortField: orderField,
    sortDirection: orderDirection,
  });

  const [result, records, savedViews, scopeOptions] = await Promise.all([
    runAnalyticsQuery(queryBody),
    /*
     * The record table degrades on its own rather than taking the charts with
     * it. A drill-down filter the engine rejects — a stale `bucket` from a
     * dimension that has since changed, say — should cost the reader the table
     * and tell them why, not the whole page.
     */
    runAnalyticsRecords(recordsBody).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : "Unknown failure",
    })),
    fetchSavedViews(plan.source.key),
    fetchScopeFilterOptions(plan.scopeFilters),
  ]);

  const recordsFailed = records !== null && "error" in records;

  /* Only offer a filter that has something in it to choose. */
  const barScopeFilters: AnalyticsScopeFilter[] = plan.scopeFilters
    .map((binding) => ({
      key: binding.param,
      label: binding.label,
      options: scopeOptions[binding.param] ?? [],
    }))
    .filter((filter) => filter.options.length > 0);

  const sortableKeys = sortableFieldKeys(plan.source);

  return (
    <AnalyticsSurfaceView
      activeBucketLabel={bucketFilter ? (bucketLabel ?? null) : null}
      activeGranularity={granularity ?? ""}
      activeSourceKey={plan.source.key}
      activeTrendKey={plan.trendMetricKey}
      breakdownField={plan.breakdownField}
      breakdownOptions={plan.breakdownOptions}
      canDrillDown={canDrillDown}
      canManageSavedViews={hasAnyPermission(user.permissionKeys, [
        PERMISSION_KEYS.REPORTS_SAVED_VIEWS_MANAGE,
      ])}
      currencyCode={formatting.currency}
      description={definition.description}
      emptyDescription={definition.emptyDescription}
      emptyTitle={definition.emptyTitle}
      records={recordsFailed ? null : records}
      recordsUnavailableReason={
        recordsFailed
          ? `${(records as { error: string }).error} The charts above are unaffected; clearing the drill-down usually resolves it.`
          : null
      }
      recordNoun={RECORD_NOUNS[plan.source.key] ?? "record"}
      resolvedScopeFilters={plan.scopeFilters}
      result={result}
      savedViews={savedViews}
      scopeFilters={barScopeFilters}
      sortableKeys={sortableKeys}
      sourceOptions={plan.availableSources}
      suggestedGranularity={suggestedGranularity({
        from: result.period.from,
        to: result.period.to,
      })}
      timezone={formatting.timezone}
      title={`${definition.label} analytics`}
      trendOptions={plan.trendOptions}
      versusDashboard={definition.versusDashboard}
    />
  );
}

/**
 * `DataTable` in server mode writes `orderBy=<field> <direction>`.
 *
 * Reading it here rather than inventing a second convention means the shared
 * table's sort headers work on this page with no adapter, and a sorted view is
 * as linkable as a filtered one.
 */
function parseOrderBy(
  raw: string | undefined,
): [string | null, "asc" | "desc" | null] {
  if (!raw) return [null, null];

  const [field, direction] = raw.split(/\s+/);
  if (!field) return [null, null];

  return [field, direction === "asc" ? "asc" : "desc"];
}

/** What the drill-down link opens, per source, so no link is named "Open". */
const RECORD_NOUNS: Record<string, string> = {
  workforce: "employee",
  workforce_history: "employee",
  attendance: "attendance day",
  leave_requests: "leave request",
  leave_consumption: "leave record",
  leave_balances: "leave balance",
  recruitment_openings: "job opening",
  recruitment_candidates: "candidate",
  recruitment_applications: "application",
  recruitment_stage_transitions: "stage change",
  desktop_activity: "activity day",
  desktop_devices: "device",
};
