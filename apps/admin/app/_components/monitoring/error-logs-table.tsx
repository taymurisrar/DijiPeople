"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProDataTable } from "@/app/_components/crm/data-table";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import { formatPlatformDateTime } from "@/lib/platform-formatters";
import {
  ERROR_LOG_FILTER_KEYS,
  INCIDENT_PARAM,
  PERIOD_OPTIONS,
  SEVERITY_OPTIONS,
  STATUS_FILTER_OPTIONS,
  describePeriod,
  formatRequest,
  formatSourceApp,
  summarizeMessage,
  titleCase,
} from "@/lib/error-log-console";
import { IncidentDrawer } from "./incident-drawer";
import {
  CopyReference,
  FilterSelect,
  SeverityBadge,
  SupportStatusBadge,
} from "./monitoring-ui";

/**
 * The error-log console: what is failing, for whom, and whether anyone is on
 * it.
 *
 * WHAT WAS HERE. Five metric cards, two of which filtered on values no row has
 * ever stored (`severity=CRITICAL`, `sourceApp=WEB`), so pressing them always
 * emptied the table; a "More filters" panel that asked for tenant and user
 * UUIDs and offered a "staging" environment that does not exist; an Export
 * that exported only the visible page; a view selector duplicating the status
 * filter; rows that expanded in place into three stacked panels; a
 * "Diagnostics" download pointed at the tenant-scoped endpoint, which refuses
 * every platform user; and a "Create support case" button that sent the trace
 * id where the API wants the row id, so it 404ed every time.
 *
 * NOW. Every control is a server-side filter carried in the URL. The filter
 * options come from the data (`/platform/logs/events/facets`), so none can be
 * chosen that returns nothing by construction. Metrics count the scope and
 * each one is also the filter it names. A row opens a detail drawer, itself
 * addressed by `?ref=`, so an incident can be linked to directly.
 */

export type PlatformErrorEvent = {
  referenceNumber: string;
  /* The row id; the support-case API keys incidents by it, not the trace id. */
  incidentId?: string;
  timestamp: string;
  severity: string;
  severityGroup?: string;
  sourceApp: string;
  tenant: { id: string; name: string; slug: string } | null;
  user: {
    id: string;
    email: string;
    fullName: string;
    role?: string | null;
    source?: "platform-admin" | "tenant-user";
  } | null;
  route: string | null;
  method: string | null;
  module: string | null;
  category: string;
  message: string;
  status: string;
  assignedTo: string | null;
  assignedToUser: SupportOwnerOption | null;
  internalNote: string | null;
  customerUpdate: string | null;
  resolvedAt: string | null;
  updatedAt: string;
  statusCode: number;
  environment: string;
  // TASK-0032 WP-06: incidents are deduplicated by fingerprint, so one row
  // stands for every occurrence between these two times.
  fingerprint: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
};

export type SupportOwnerOption = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

export type PlatformErrorLogMetrics = {
  total: number;
  critical: number;
  /* Optional so an API older than this screen degrades to "—", not a crash. */
  warning?: number;
  open: number;
  resolved: number;
  investigating?: number;
  criticalOpen?: number;
};

export type PlatformErrorLogsMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sortBy: string;
  sortDirection: "asc" | "desc";
};

type FacetValue = { value: string; count: number };

export type ErrorLogFacets = {
  sourceApps: FacetValue[];
  environments: FacetValue[];
  modules: FacetValue[];
  tenants: Array<{ id: string; name: string; count: number }>;
  platformCount: number;
};

type Filters = Record<(typeof ERROR_LOG_FILTER_KEYS)[number], string>;

export function ErrorLogsTable({
  logs,
  meta,
  metrics,
  facets,
  assignees,
  canManage,
  canonicalQuery = null,
}: {
  logs: PlatformErrorEvent[];
  meta: PlatformErrorLogsMeta;
  metrics: PlatformErrorLogMetrics;
  facets: ErrorLogFacets | null;
  assignees: SupportOwnerOption[];
  canManage: boolean;
  /*
   * Set when the page rewrote an old `viewId` link into filters. The list was
   * already fetched with them; this only brings the address bar (and so the
   * filter controls) into line, without another server round trip.
   */
  canonicalQuery?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (canonicalQuery === null) return;
    window.history.replaceState(
      null,
      "",
      canonicalQuery ? `${pathname}?${canonicalQuery}` : pathname,
    );
  }, [canonicalQuery, pathname]);
  const { defaults } = usePlatformDefaults();
  /*
   * Navigation is a server round trip. The transition keeps the current rows
   * on screen and marks the table as loading, instead of the page appearing
   * to ignore a click for as long as the API takes.
   */
  const [isPending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(
    searchParams.get("search") ?? "",
  );

  const filters = Object.fromEntries(
    ERROR_LOG_FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? ""]),
  ) as Filters;
  const activeFilterCount = ERROR_LOG_FILTER_KEYS.filter(
    (key) => filters[key] && !(key === "period" && filters[key] === "all"),
  ).length;
  const openReference = searchParams.get(INCIDENT_PARAM);
  const periodLabel = describePeriod(filters);

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  function updateQuery(
    updates: Record<string, string | number | null>,
    { resetPage = true }: { resetPage?: boolean } = {},
  ) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, String(value));
    }
    if (resetPage) params.delete("page");
    navigate(params);
  }

  function clearFilters() {
    setSearchDraft("");
    updateQuery(
      Object.fromEntries(ERROR_LOG_FILTER_KEYS.map((key) => [key, null])),
    );
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateQuery({ search: searchDraft.trim() || null });
  }

  function setOpenReference(reference: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (reference) params.set(INCIDENT_PARAM, reference);
    else params.delete(INCIDENT_PARAM);
    const query = params.toString();
    /*
     * The drawer is part of the URL, so Back closes it and a link opens it —
     * but through native history rather than `router.push`, which would re-run
     * the list query on the server just to open a panel. Next keeps
     * `useSearchParams` in sync with `history.pushState`.
     */
    window.history.pushState(
      null,
      "",
      query ? `${pathname}?${query}` : pathname,
    );
  }

  /*
   * Selecting a preset clears any explicit dates an old link carried, so the
   * window the select shows is the window the list was filtered by.
   */
  function setPeriod(value: string) {
    updateQuery({ period: value || null, from: null, to: null });
  }

  const periodOptions =
    !filters.period && (filters.from || filters.to)
      ? [{ value: "", label: "Selected dates" }, ...PERIOD_OPTIONS]
      : PERIOD_OPTIONS;

  return (
    <div className="space-y-4">
      <section
        aria-label={`Summary, ${periodLabel}`}
        className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5"
      >
        <MetricCard
          active={!filters.severity && !filters.status}
          caption={periodLabel}
          label="Errors"
          onClick={() => updateQuery({ severity: null, status: null })}
          tone="neutral"
          value={metrics.total}
        />
        <MetricCard
          active={filters.severity === "critical"}
          caption="Error, fatal and critical"
          label="Critical"
          onClick={() =>
            updateQuery({
              severity: filters.severity === "critical" ? null : "critical",
            })
          }
          tone="danger"
          value={metrics.critical}
        />
        <MetricCard
          active={filters.severity === "warning"}
          caption="Recoverable failures"
          label="Warning"
          onClick={() =>
            updateQuery({
              severity: filters.severity === "warning" ? null : "warning",
            })
          }
          tone="warning"
          value={metrics.warning}
        />
        <MetricCard
          active={filters.status === "UNRESOLVED"}
          caption="Not resolved or set aside"
          label="Unresolved"
          onClick={() =>
            updateQuery({
              status: filters.status === "UNRESOLVED" ? null : "UNRESOLVED",
            })
          }
          tone="warning"
          value={metrics.open}
        />
        <MetricCard
          active={filters.status === "RESOLVED"}
          caption="Closed by support"
          label="Resolved"
          onClick={() =>
            updateQuery({
              status: filters.status === "RESOLVED" ? null : "RESOLVED",
            })
          }
          tone="calm"
          value={metrics.resolved}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-200 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <form
              className="relative min-w-[16rem] flex-1"
              onSubmit={submitSearch}
              role="search"
            >
              <label className="sr-only" htmlFor="error-log-search">
                Search error logs
              </label>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10"
                id="error-log-search"
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search message, reference, error code, route or customer"
                type="search"
                value={searchDraft}
              />
            </form>
            <FilterSelect
              className="w-44"
              includeAll={false}
              label="Period"
              onChange={setPeriod}
              options={periodOptions}
              value={
                filters.period || (filters.from || filters.to ? "" : "all")
              }
            />
            <div className="flex items-center gap-1">
              <button
                aria-label="Refresh"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={() => startTransition(() => router.refresh())}
                title="Reload with the current filters"
                type="button"
              >
                <RefreshCw
                  aria-hidden
                  className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
              {activeFilterCount ? (
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  onClick={clearFilters}
                  type="button"
                >
                  <X aria-hidden className="h-4 w-4" />
                  Clear filters ({activeFilterCount})
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <FilterSelect
              label="Severity"
              onChange={(value) => updateQuery({ severity: value })}
              options={withCurrent(SEVERITY_OPTIONS, filters.severity)}
              value={filters.severity}
            />
            <FilterSelect
              label="Status"
              onChange={(value) => updateQuery({ status: value })}
              options={withCurrent(STATUS_FILTER_OPTIONS, filters.status)}
              value={filters.status}
            />
            <FilterSelect
              disabled={!facets}
              label="Application"
              onChange={(value) => updateQuery({ sourceApp: value })}
              options={withCurrent(
                (facets?.sourceApps ?? []).map((item) => ({
                  value: item.value,
                  label: formatSourceApp(item.value),
                })),
                filters.sourceApp,
              )}
              value={filters.sourceApp}
            />
            <FilterSelect
              disabled={!facets}
              label="Environment"
              onChange={(value) => updateQuery({ environment: value })}
              options={withCurrent(
                (facets?.environments ?? []).map((item) => ({
                  value: item.value,
                  label: titleCase(item.value),
                })),
                filters.environment,
              )}
              value={filters.environment}
            />
            <FilterSelect
              disabled={!facets}
              label="Module"
              onChange={(value) => updateQuery({ module: value })}
              options={withCurrent(
                (facets?.modules ?? []).map((item) => ({
                  value: item.value,
                  label: item.value,
                })),
                filters.module,
              )}
              value={filters.module}
            />
            <FilterSelect
              disabled={!facets}
              label="Tenant"
              onChange={(value) => updateQuery({ tenantId: value })}
              options={withCurrent(
                [
                  ...(facets?.platformCount
                    ? [{ value: "platform", label: "Platform (no tenant)" }]
                    : []),
                  ...(facets?.tenants ?? []).map((tenant) => ({
                    value: tenant.id,
                    label: tenant.name,
                  })),
                ],
                filters.tenantId,
                "Selected tenant",
              )}
              value={filters.tenantId}
            />
          </div>
          {!facets ? (
            <p className="text-xs text-amber-700" role="status">
              Filter options could not be loaded. Search and the period,
              severity and status filters still work.
            </p>
          ) : null}
        </div>

        <ProDataTable
          compact
          emptyDescription={
            activeFilterCount
              ? "Nothing failed that matches these filters. Widen the period or clear a filter."
              : "No failures have been captured. Errors from the tenant app, platform admin and API appear here as they happen."
          }
          emptyTitle={
            activeFilterCount
              ? "No errors match these filters"
              : "No errors recorded"
          }
          getRowClassName={(log) =>
            log.referenceNumber === openReference ? "bg-blue-50/60" : undefined
          }
          loading={isPending}
          loadingRowCount={Math.min(meta.pageSize, 10)}
          maxHeight="68vh"
          onRowClick={(log) => setOpenReference(log.referenceNumber)}
          onSortChange={(sort) =>
            updateQuery({ sortBy: sort.field, sortDirection: sort.direction })
          }
          pagination={{
            page: meta.page,
            pageSize: meta.pageSize,
            totalRecords: meta.total,
            pageSizeOptions: [25, 50, 100],
            onPageChange: (page) => updateQuery({ page }, { resetPage: false }),
            onPageSizeChange: (pageSize) => updateQuery({ pageSize }),
          }}
          rowKey={(log) => log.referenceNumber}
          rows={logs}
          sort={{ field: meta.sortBy, direction: meta.sortDirection }}
          stickyHeader
          stickyPagination
          columns={[
            {
              key: "lastSeen",
              header: "Last seen",
              sortable: true,
              width: 150,
              minWidth: 150,
              render: (log) => (
                <span className="whitespace-nowrap text-xs text-slate-700">
                  {formatPlatformDateTime(
                    log.lastSeenAt ?? log.timestamp,
                    defaults,
                  )}
                </span>
              ),
            },
            {
              key: "severity",
              header: "Severity",
              sortable: true,
              width: 92,
              minWidth: 92,
              render: (log) => (
                <SeverityBadge
                  group={log.severityGroup}
                  severity={log.severity}
                />
              ),
            },
            {
              key: "sourceApp",
              header: "Source",
              sortable: true,
              width: 120,
              minWidth: 120,
              render: (log) => (
                <div className="min-w-0 text-xs">
                  <p className="truncate font-medium text-slate-800">
                    {formatSourceApp(log.sourceApp)}
                  </p>
                  <p className="truncate text-slate-500">
                    {titleCase(log.environment)}
                  </p>
                </div>
              ),
            },
            {
              key: "module",
              header: "Module / action",
              sortable: true,
              width: 210,
              minWidth: 180,
              render: (log) => {
                const request = formatRequest(log.method, log.route);
                return (
                  <div className="min-w-0 max-w-[230px] text-xs">
                    <p className="truncate font-medium text-slate-800">
                      {log.module ?? "—"}
                    </p>
                    <p
                      className="truncate font-mono text-[11px] text-slate-500"
                      title={request}
                    >
                      {request || log.category}
                    </p>
                  </div>
                );
              },
            },
            {
              key: "tenant",
              header: "Tenant / user",
              width: 190,
              minWidth: 170,
              render: (log) => (
                <div className="min-w-0 max-w-[210px] text-xs">
                  <p className="truncate font-medium text-slate-800">
                    {log.tenant?.name ?? "Platform"}
                  </p>
                  <p className="truncate text-slate-500">
                    {log.user?.email ?? "No signed-in user"}
                  </p>
                </div>
              ),
            },
            {
              key: "message",
              header: "Message",
              minWidth: 260,
              render: (log) => {
                const summary = summarizeMessage(log.message);
                return (
                  <div className="flex min-w-0 max-w-[460px] items-center gap-2">
                    <span
                      className="truncate text-sm text-slate-900"
                      title={summary}
                    >
                      {summary}
                    </span>
                    {log.occurrenceCount > 1 ? (
                      <span
                        className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600"
                        title={`Occurred ${log.occurrenceCount} times since ${formatPlatformDateTime(log.firstSeenAt, defaults)}`}
                      >
                        ×{log.occurrenceCount.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                );
              },
            },
            {
              key: "reference",
              header: "Reference",
              width: 170,
              minWidth: 150,
              render: (log) => (
                <CopyReference
                  className="max-w-[160px]"
                  value={log.referenceNumber}
                />
              ),
            },
            {
              key: "status",
              header: "Status",
              width: 150,
              minWidth: 130,
              render: (log) => <SupportStatusBadge value={log.status} />,
            },
          ]}
        />
      </section>

      {openReference ? (
        <IncidentDrawer
          assignees={assignees}
          canManage={canManage}
          key={openReference}
          onClose={() => setOpenReference(null)}
          onUpdated={() => startTransition(() => router.refresh())}
          reference={openReference}
        />
      ) : null}
    </div>
  );
}

/**
 * Keeps a value that arrived in the URL selectable even when the option list
 * does not contain it — an old link, or a tenant beyond the facet cap — so the
 * select shows the filter that is actually applied rather than "All".
 */
function withCurrent(
  options: ReadonlyArray<{ value: string; label: string }>,
  current: string,
  fallbackLabel?: string,
) {
  if (!current || options.some((option) => option.value === current)) {
    return options;
  }
  return [...options, { value: current, label: fallbackLabel ?? current }];
}

/**
 * One count, and the filter it stands for. A button, because every card
 * narrows the table; `active` marks the one in force, in text as well as
 * colour.
 */
function MetricCard({
  label,
  value,
  caption,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | undefined;
  caption: string;
  tone: "neutral" | "danger" | "warning" | "calm";
  active: boolean;
  onClick: () => void;
}) {
  const accent = {
    neutral: "bg-slate-400",
    danger: "bg-rose-500",
    warning: "bg-amber-500",
    calm: "bg-emerald-500",
  }[tone];
  return (
    <button
      aria-pressed={active}
      className={`relative overflow-hidden rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 ${
        active
          ? "border-[var(--admin-primary)] ring-1 ring-[var(--admin-primary)]"
          : "border-slate-200"
      }`}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {active ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--admin-primary)]">
            Filtering
          </span>
        ) : null}
      </span>
      <span className="mt-1 block text-2xl font-semibold tabular-nums text-slate-950">
        {typeof value === "number" ? value.toLocaleString() : "—"}
      </span>
      <span className="block truncate text-[11px] text-slate-500">
        {caption}
      </span>
    </button>
  );
}
