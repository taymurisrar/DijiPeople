import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { readAnalyticsFilters } from "@/app/components/filters";
import { sortableFieldKeys } from "../_lib/analytics-surfaces";
import { SectionCard } from "@/app/components/ui/section-card";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { ReportLibraryBrowser } from "../_components/report-library-browser";
import { ReportRunnerView } from "../_components/report-runner-view";
import {
  buildRunReportBody,
  DEFAULT_RECORD_PAGE_SIZE,
  readPositiveInteger,
} from "../_lib/analytics-request";
import { getReportingCapabilities } from "../_lib/reporting-capabilities";
import {
  executeReport,
  fetchFavorites,
  fetchReportCatalog,
  fetchReportLibrary,
  getReportingFormatting,
} from "../_lib/reporting-server";

/*
 * The report library, and the runner for whatever is opened from it.
 *
 * One route rather than two, because `?target=std:headcount` is what a report
 * *is* — the API addresses standard and custom reports by one `targetKey`
 * string, and giving them separate URLs here would mean inventing a second
 * addressing scheme that has to be kept in step with the first.
 *
 * Opening a report records a recent view, server-side, as a fire-and-forget on
 * the API's side of the call. That is why the runner is a page load rather than
 * a client fetch: a recent view should record when someone actually opened the
 * report, not when a component happened to mount.
 */

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportLibraryPage({ searchParams }: PageProps) {
  const [resolved, user] = await Promise.all([
    searchParams
      ? searchParams
      : Promise.resolve({} as Record<string, string | string[] | undefined>),
    requireSessionUser("/reports/library"),
  ]);

  if (!hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.REPORTS_READ])) {
    return (
      <AccessDeniedState
        actionHref="/reports"
        actionLabel="Back to the reporting overview"
        description="Your role does not include access to the reporting workspace."
        title="The report library is unavailable for your account."
      />
    );
  }

  const single = (key: string) => {
    const raw = resolved[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  const targetKey = single("target");

  if (!targetKey) {
    const [library, favorites] = await Promise.all([
      fetchReportLibrary().catch(() => null),
      fetchFavorites(),
    ]);

    return (
      <SectionCard
        description="Every report you can run, standard and custom. Each runs against your own access, so the same report shows different rows to different people."
        title="Report library"
      >
        <ReportLibraryBrowser
          canCreate={hasAnyPermission(user.permissionKeys, [
            PERMISSION_KEYS.REPORTS_BUILDER_USE,
            PERMISSION_KEYS.REPORTS_DEFINITIONS_MANAGE,
          ])}
          entries={[...(library?.standard ?? []), ...(library?.custom ?? [])]}
          favorites={favorites}
          libraryAvailable={library !== null}
        />
      </SectionCard>
    );
  }

  const filterState = readAnalyticsFilters(
    resolved as Record<string, string | string[] | undefined>,
  );

  const [orderField, orderDirection] = parseOrderBy(single("orderBy"));

  const body = buildRunReportBody({
    targetKey,
    period: {
      preset: filterState.preset,
      from: filterState.from,
      to: filterState.to,
    },
    page: readPositiveInteger(resolved.page, 1),
    pageSize: readPositiveInteger(resolved.pageSize, DEFAULT_RECORD_PAGE_SIZE),
    sortField: orderField,
    sortDirection: orderDirection,
  });

  const [result, formatting, capabilities, catalog] = await Promise.all([
    executeReport(body),
    getReportingFormatting(),
    getReportingCapabilities(),
    fetchReportCatalog().catch(() => []),
  ]);

  /*
   * The run response's columns say what they are but not whether the engine
   * will sort on them, so the sortable set comes from the catalog entry for the
   * report's own source. A sort header the API silently ignores is a control
   * that appears to work and does not.
   */
  const source = catalog.find(
    (candidate) => candidate.key === result.sourceKey,
  );
  const sortableKeys = source ? sortableFieldKeys(source) : [];

  return (
    <ReportRunnerView
      backHref="/reports/library"
      backLabel="Back to the report library"
      currencyCode={formatting.currency}
      canManageSchedules={hasAnyPermission(user.permissionKeys, [
        PERMISSION_KEYS.REPORTS_SCHEDULE_MANAGE,
      ])}
      exportAvailable={capabilities.export}
      /*
       * Only the three period keys `CreateReportExportDto` declares. Passing
       * the whole run body would carry `targetKey`, `page`, `pageSize`,
       * `sortField` and `recordView` into a DTO that declares none of them,
       * and `forbidNonWhitelisted` turns each one into a 400.
       */
      exportPeriod={{
        preset: body.preset,
        from: body.from,
        to: body.to,
      }}
      result={result}
      scheduleAvailable={capabilities.schedule}
      sortableKeys={sortableKeys}
      timezone={formatting.timezone}
    />
  );
}

/** `DataTable` server mode writes `orderBy=<field> <direction>`. */
function parseOrderBy(
  raw: string | undefined,
): [string | null, "asc" | "desc" | null] {
  if (!raw) return [null, null];
  const [field, direction] = raw.split(/\s+/);
  if (!field) return [null, null];
  return [field, direction === "asc" ? "asc" : "desc"];
}
