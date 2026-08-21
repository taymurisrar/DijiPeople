"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Clock3,
  Copy,
  Download,
  LifeBuoy,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProDataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import { formatPlatformDateTime } from "@/lib/platform-formatters";

const SUPPORT_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "INVESTIGATING", label: "Investigating" },
  { value: "WAITING_ON_CUSTOMER", label: "Waiting on customer" },
  { value: "FIX_IN_PROGRESS", label: "Fix in progress" },
  { value: "RESOLVED", label: "Resolved" },
] as const;
const SUPPORT_TEAMS = [
  "Customer Support",
  "Engineering",
  "Billing Support",
  "Platform Operations",
] as const;

export type PlatformErrorEvent = {
  referenceNumber: string;
  timestamp: string;
  severity: string;
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
};

export type SupportOwnerOption = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};
const SUPPORT_OWNER_ROLES = new Set([
  "SUPER_ADMIN",
  "PLATFORM_OWNER",
  "PLATFORM_ADMIN",
  "MEMBER",
  "SUPPORT_MANAGER",
  "SUPPORT_AGENT",
  "MONITORING_OPERATOR",
]);
export type PlatformErrorLogMetrics = {
  total: number;
  critical: number;
  webApp: number;
  open: number;
  resolved: number;
};

export type PlatformErrorLogsMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sortBy: string;
  sortDirection: "asc" | "desc";
};

export function ErrorLogsTable({
  logs,
  meta,
  metrics,
  assignees,
}: {
  logs: PlatformErrorEvent[];
  meta: PlatformErrorLogsMeta;
  metrics: PlatformErrorLogMetrics;
  assignees: SupportOwnerOption[];
}) {
  const router = useRouter();
  const { defaults } = usePlatformDefaults();
  const searchParams = useSearchParams();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedReference, setCopiedReference] = useState<string | null>(null);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, router]);

  const filters = useMemo(
    () => ({
      search: searchParams.get("search") ?? "",
      severity: searchParams.get("severity") ?? "",
      status: searchParams.get("status") ?? "",
      sourceApp: searchParams.get("sourceApp") ?? "",
      environment: searchParams.get("environment") ?? "",
      tenantId: searchParams.get("tenantId") ?? "",
      userId: searchParams.get("userId") ?? "",
      category: searchParams.get("category") ?? "",
      route: searchParams.get("route") ?? "",
      method: searchParams.get("method") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    }),
    [searchParams],
  );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const datePreset = getDatePreset(filters.from, filters.to);
  /*
   * Every count on this page is over a window, and the window is a filter the
   * reader may have changed. Saying "12,005" without saying "since forever" is
   * how a firehose gets mistaken for a work queue.
   */
  const windowLabel =
    datePreset === "24h"
      ? "last 24 hours"
      : datePreset === "7d"
        ? "last 7 days"
        : datePreset === "30d"
          ? "last 30 days"
          : datePreset === "custom"
            ? "selected dates"
            : "all time";

  function updateQuery(updates: Record<string, string | number | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, String(value));
    }
    if (!("page" in updates)) params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  function clearFilters() {
    const updates = Object.fromEntries(
      Object.keys(filters).map((key) => [key, null]),
    );
    updateQuery(updates);
  }

  function applyDatePreset(hours: number | null) {
    updateQuery({
      from: hours
        ? new Date(Date.now() - hours * 60 * 60 * 1_000).toISOString()
        : null,
      to: null,
    });
  }

  function sortBy(column: string) {
    const direction =
      meta.sortBy === column && meta.sortDirection === "desc" ? "asc" : "desc";
    updateQuery({ sortBy: column, sortDirection: direction, page: 1 });
  }

  async function copyReference(reference: string) {
    await navigator.clipboard.writeText(reference);
    setCopiedReference(reference);
    window.setTimeout(() => setCopiedReference(null), 1500);
  }

  function exportCsv() {
    const blob = new Blob([toCsv(logs)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dijipeople-error-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/*
        Five numbers that say what they count, and that you can act on.

        What was here: "Matching incidents 12,005", "Error severity 488", "Web
        app incidents 524", "Open investigations 12,005", "Resolved incidents
        0". Three separate problems in one row.

        "Error severity" is not a quantity — it counted criticals and was
        labelled with the name of a column. "Open investigations" equalled the
        total, because every sanitized incident starts NEW and nothing had ever
        been triaged, so the same figure appeared twice under two names and
        neither said which one was the queue. And none of them was clickable, so
        seeing that 488 were critical left an operator to go and rebuild that
        filter by hand.

        Each card is now a filter, each one states the window it counted over,
        and the one that is currently applied is marked. A metric you cannot act
        on is decoration; a metric with no scope is a number.
      */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          active={activeFilterCount === 0}
          icon={LifeBuoy}
          label="Incidents in view"
          onClick={clearFilters}
          scope={windowLabel}
          tone="blue"
          value={metrics.total}
        />
        <SummaryCard
          active={filters.severity === "CRITICAL"}
          icon={AlertTriangle}
          label="Critical"
          onClick={() =>
            updateQuery({
              severity: filters.severity === "CRITICAL" ? null : "CRITICAL",
            })
          }
          scope={windowLabel}
          tone="rose"
          value={metrics.critical}
        />
        <SummaryCard
          active={filters.sourceApp === "WEB"}
          icon={Globe}
          label="From the web app"
          onClick={() =>
            updateQuery({
              sourceApp: filters.sourceApp === "WEB" ? null : "WEB",
            })
          }
          scope={windowLabel}
          tone="amber"
          value={metrics.webApp}
        />
        <SummaryCard
          active={filters.status === "NEW"}
          icon={Clock3}
          label="Not yet triaged"
          onClick={() =>
            updateQuery({ status: filters.status === "NEW" ? null : "NEW" })
          }
          scope={windowLabel}
          tone="amber"
          value={metrics.open}
        />
        <SummaryCard
          active={filters.status === "RESOLVED"}
          icon={CheckCircle2}
          label="Resolved"
          onClick={() =>
            updateQuery({
              status: filters.status === "RESOLVED" ? null : "RESOLVED",
            })
          }
          scope={windowLabel}
          tone="emerald"
          value={metrics.resolved}
        />
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <form
              className="relative min-w-0 flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                updateQuery({
                  search: new FormData(event.currentTarget).get(
                    "search",
                  ) as string,
                });
              }}
            >
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                name="search"
                type="search"
                defaultValue={filters.search}
                placeholder="Search reference, customer, user, route, or message"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--admin-primary)] focus:bg-white focus:ring-4 focus:ring-blue-100/50"
              />
            </form>

            <div
              className="inline-flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1"
              role="group"
              aria-label="Severity filter"
            >
              {[
                ["", "All severity"],
                ["ERROR", "Critical"],
                ["WARNING", "Warning"],
                ["INFO", "Info"],
              ].map(([value, label]) => (
                <SegmentButton
                  key={label}
                  selected={filters.severity === value}
                  onClick={() => updateQuery({ severity: value || null })}
                >
                  {label}
                </SegmentButton>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${showAdvanced ? "border-[var(--admin-primary)] bg-[var(--admin-surface-tint)] text-[var(--admin-primary)]" : "border-slate-200 bg-white text-slate-700"}`}
            >
              <SlidersHorizontal className="h-4 w-4" /> More filters
              {activeFilterCount ? (
                <span className="rounded-full bg-[var(--admin-primary)] px-2 py-0.5 text-[10px] text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
            {activeFilterCount ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              >
                <X className="h-4 w-4" /> Clear
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Source
              </span>
              <div
                className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
                role="group"
                aria-label="Application source"
              >
                {[
                  ["", "All"],
                  ["web", "Web app"],
                  ["api", "API"],
                  ["admin", "Admin"],
                ].map(([value, label]) => (
                  <SegmentButton
                    compact
                    key={label}
                    selected={filters.sourceApp === value}
                    onClick={() => updateQuery({ sourceApp: value || null })}
                  >
                    {label}
                  </SegmentButton>
                ))}
              </div>
              <span className="ml-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Window
              </span>
              <div
                className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
                role="group"
                aria-label="Time window"
              >
                <SegmentButton
                  compact
                  selected={datePreset === "all"}
                  onClick={() => applyDatePreset(null)}
                >
                  All
                </SegmentButton>
                <SegmentButton
                  compact
                  selected={datePreset === "24h"}
                  onClick={() => applyDatePreset(24)}
                >
                  24h
                </SegmentButton>
                <SegmentButton
                  compact
                  selected={datePreset === "7d"}
                  onClick={() => applyDatePreset(24 * 7)}
                >
                  7d
                </SegmentButton>
                <SegmentButton
                  compact
                  selected={datePreset === "30d"}
                  onClick={() => applyDatePreset(24 * 30)}
                >
                  30d
                </SegmentButton>
              </div>
            </div>

            <div
              className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
              role="group"
              aria-label="Log actions"
            >
              <ActionButton onClick={() => router.refresh()} icon={RefreshCw}>
                Refresh
              </ActionButton>
              <ActionButton
                active={autoRefresh}
                onClick={() => setAutoRefresh((current) => !current)}
                icon={Clock3}
              >
                Auto {autoRefresh ? "on" : "off"}
              </ActionButton>
              <ActionButton onClick={exportCsv} icon={Download}>
                Export
              </ActionButton>
            </div>
          </div>

          {showAdvanced ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
              <FilterSelect
                label="Support status"
                value={filters.status}
                options={SUPPORT_STATUSES.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                onChange={(value) => updateQuery({ status: value || null })}
              />
              <FilterInput
                label="Tenant ID"
                value={filters.tenantId}
                placeholder="Platform or tenant UUID"
                onChange={(value) => updateQuery({ tenantId: value })}
              />
              <FilterInput
                label="User ID"
                value={filters.userId}
                placeholder="Tenant or platform user ID"
                onChange={(value) => updateQuery({ userId: value })}
              />
              <FilterInput
                label="Route / endpoint"
                value={filters.route}
                placeholder="/api/..."
                onChange={(value) => updateQuery({ route: value })}
              />
              <FilterInput
                label="Category"
                value={filters.category}
                placeholder="VALIDATION_FAILED"
                onChange={(value) => updateQuery({ category: value })}
              />
              <FilterSelect
                label="Environment"
                value={filters.environment}
                options={["production", "staging", "development", "test"].map(
                  (value) => ({ value, label: titleCase(value) }),
                )}
                onChange={(value) =>
                  updateQuery({ environment: value || null })
                }
              />
              <FilterInput
                label="From"
                value={toLocalDateTime(filters.from)}
                type="datetime-local"
                onChange={(value) =>
                  updateQuery({
                    from: value ? new Date(value).toISOString() : null,
                  })
                }
              />
              <FilterInput
                label="To"
                value={toLocalDateTime(filters.to)}
                type="datetime-local"
                onChange={(value) =>
                  updateQuery({
                    to: value ? new Date(value).toISOString() : null,
                  })
                }
              />
              <FilterSelect
                label="Page size"
                value={String(meta.pageSize)}
                includeAll={false}
                options={[10, 25, 50, 100].map((value) => ({
                  value: String(value),
                  label: `${value} rows`,
                }))}
                onChange={(value) => updateQuery({ pageSize: value, page: 1 })}
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-500">
          <span>
            Showing {logs.length} of {meta.total} sanitized incidents
          </span>
          <span>
            Expand a row to investigate, assign, resolve, and prepare a customer
            update.
          </span>
        </div>

        <ProDataTable
          rows={logs}
          rowKey={(log) => log.referenceNumber}
          compact
          stickyHeader
          maxHeight="70vh"
          emptyTitle="No incidents match these filters"
          emptyDescription="Clear filters or widen the time window to review platform diagnostics."
          pagination={{
            page: meta.page,
            pageSize: meta.pageSize,
            totalRecords: meta.total,
            onPageChange: (page) => updateQuery({ page }),
          }}
          stickyPagination
          renderExpandedRow={(log) => (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-2 xl:grid-cols-4">
                <Detail label="Reference" value={log.referenceNumber} mono />
                <Detail
                  label="Timestamp"
                  value={formatPlatformDateTime(log.timestamp, defaults)}
                />
                <Detail
                  label="Environment"
                  value={titleCase(log.environment)}
                />
                <Detail
                  label="HTTP"
                  value={`${log.method ?? "CLIENT"} · ${log.statusCode}`}
                />
                <Detail
                  label="Tenant"
                  value={log.tenant?.name ?? "Platform / unknown"}
                />
                <Detail label="Tenant ID" value={getTenantId(log)} mono />
                <Detail label="User" value={log.user?.email ?? "Unknown"} />
                <Detail
                  label="User ID"
                  value={log.user?.id ?? "Unknown"}
                  mono
                />
                <Detail label="Route" value={log.route ?? "Unknown"} mono />
                <Detail label="Category" value={log.category} mono />
                <div className="md:col-span-2">
                  <Detail label="Sanitized message" value={log.message} />
                </div>
              </div>
              <SupportCaseEditor log={log} assignees={assignees} />
            </div>
          )}
          columns={[
            {
              key: "reference",
              header: "Reference",
              width: 205,
              minWidth: 205,
              maxWidth: 205,
              render: (log) => (
                <button
                  className="inline-flex max-w-[190px] items-center gap-2 font-mono text-xs font-semibold text-slate-800"
                  onClick={() => copyReference(log.referenceNumber)}
                  title="Copy reference ID"
                  type="button"
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {copiedReference === log.referenceNumber
                      ? "Copied"
                      : log.referenceNumber}
                  </span>
                </button>
              ),
            },
            {
              key: "timestamp",
              header: (
                <SortButton
                  label="Timestamp"
                  onClick={() => sortBy("timestamp")}
                />
              ),
              width: 170,
              minWidth: 170,
              maxWidth: 170,
              render: (log) => formatPlatformDateTime(log.timestamp, defaults),
            },
            {
              key: "severity",
              header: (
                <SortButton
                  label="Severity"
                  onClick={() => sortBy("severity")}
                />
              ),
              width: 115,
              minWidth: 115,
              render: (log) => <TenantStatusBadge value={log.severity} />,
            },
            {
              key: "source",
              header: "Source",
              width: 105,
              minWidth: 105,
              render: (log) => (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {titleCase(log.sourceApp)}
                </span>
              ),
            },
            {
              key: "customer",
              header: "Customer / user",
              width: 230,
              minWidth: 230,
              maxWidth: 230,
              render: (log) => (
                <div className="max-w-[210px]">
                  <p className="truncate font-medium text-slate-900">
                    {log.tenant?.name ?? "Platform"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {log.user?.email ?? "Unknown user"}
                  </p>
                </div>
              ),
            },
            {
              key: "route",
              header: "Route",
              width: 220,
              minWidth: 220,
              maxWidth: 220,
              render: (log) => (
                <span className="block max-w-[200px] truncate font-mono text-xs">
                  {log.method ? `${log.method} ` : ""}
                  {log.route ?? "Unknown"}
                </span>
              ),
            },
            {
              key: "status",
              header: "Support status",
              width: 165,
              minWidth: 165,
              render: (log) => <SupportStatusBadge value={log.status} />,
            },
          ]}
        />
      </section>
    </div>
  );
}

function SupportCaseEditor({
  log,
  assignees,
}: {
  log: PlatformErrorEvent;
  assignees: SupportOwnerOption[];
}) {
  const router = useRouter();
  const { defaults } = usePlatformDefaults();
  const [status, setStatus] = useState(log.status);
  const [assignment, setAssignment] = useState(
    log.assignedToUser?.id ??
      (SUPPORT_TEAMS.includes(log.assignedTo as (typeof SUPPORT_TEAMS)[number])
        ? `team:${log.assignedTo}`
        : ""),
  );
  const [internalNote, setInternalNote] = useState(log.internalNote ?? "");
  const [customerUpdate, setCustomerUpdate] = useState(
    log.customerUpdate ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [supportCase, setSupportCase] = useState<{
    id: string;
    caseNumber: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/platform/logs/events/${encodeURIComponent(log.referenceNumber)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supportStatus: status,
            assignedToUserId: assignment.startsWith("team:") ? "" : assignment,
            assignedTeam: assignment.startsWith("team:")
              ? assignment.slice(5)
              : "",
            internalNote,
            customerUpdate,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(
          payload?.message ?? "Unable to update the support incident.",
        );
        return;
      }
      setMessage("Support incident updated.");
      router.refresh();
    });
  }

  function createSupportCase() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/support-cases/from-incident/${encodeURIComponent(log.referenceNumber)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(
          payload?.message ??
            "Unable to create a support case from this incident.",
        );
        return;
      }
      setSupportCase({ id: payload.id, caseNumber: payload.caseNumber });
      setMessage(`Support case ${payload.caseNumber} created and linked.`);
    });
  }

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-blue-800">
            <LifeBuoy className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Support workflow</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Track investigation progress and keep a customer-safe update beside
            the sanitized diagnostic record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {supportCase ? (
            <a
              href={`/support/cases/${supportCase.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
            >
              <LifeBuoy className="h-3.5 w-3.5" /> Open {supportCase.caseNumber}
            </a>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={createSupportCase}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              <LifeBuoy className="h-3.5 w-3.5" /> Create support case
            </button>
          )}
          <a
            href={`/api/error-logs/${encodeURIComponent(log.referenceNumber)}/download`}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800"
          >
            <Download className="h-3.5 w-3.5" /> Diagnostics
          </a>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div
          className="inline-flex min-w-max rounded-xl border border-blue-200 bg-white p-1"
          role="group"
          aria-label="Support status"
        >
          {SUPPORT_STATUSES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${status === option.value ? "bg-[var(--admin-primary)] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Assigned to
          <select
            value={assignment}
            onChange={(event) => setAssignment(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-[var(--admin-primary)]"
          >
            <option value="">Unassigned</option>
            <optgroup label="Support teams">
              {SUPPORT_TEAMS.map((team) => (
                <option key={team} value={`team:${team}`}>
                  {team}
                </option>
              ))}
            </optgroup>
            <optgroup label="Platform admins and members">
              {assignees
                .filter((owner) => SUPPORT_OWNER_ROLES.has(owner.role))
                .map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.fullName} / {titleCase(owner.role)}
                  </option>
                ))}
            </optgroup>
          </select>
          <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">
            Choose a support owner or team
          </span>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Internal note
          <textarea
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
            placeholder="Investigation notes (internal only)"
            rows={3}
            className="mt-1.5 w-full resize-y rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[var(--admin-primary)]"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 lg:col-span-2">
          Customer update
          <textarea
            value={customerUpdate}
            onChange={(event) => setCustomerUpdate(event.target.value)}
            placeholder="Customer-safe progress or resolution update"
            rows={3}
            className="mt-1.5 w-full resize-y rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[var(--admin-primary)]"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p
          className={`text-xs ${message?.startsWith("Unable") ? "text-rose-700" : "text-emerald-700"}`}
        >
          {message ??
            `Last updated ${formatPlatformDateTime(log.updatedAt, defaults)}`}
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isPending ? "Saving..." : "Save support update"}
        </button>
      </div>
    </section>
  );
}

function SegmentButton({
  children,
  selected,
  onClick,
  compact = false,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`shrink-0 rounded-lg font-semibold transition ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-xs"} ${selected ? "bg-white text-[var(--admin-primary)] shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  icon: Icon,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  icon: typeof RefreshCw;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-[var(--admin-surface-tint)] text-[var(--admin-primary)]" : "text-slate-600 hover:bg-slate-50"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/**
 * One metric, and the filter it stands for.
 *
 * A button rather than an article: every card here answers a question by
 * narrowing the table, and the previous version made the reader retype the
 * filter it had just told them about. `active` marks the one in force so the
 * row doubles as a statement of what is currently being shown, and `scope` is
 * mandatory — a count with no window is a number, not a metric.
 */
function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
  scope,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof LifeBuoy;
  tone: "blue" | "rose" | "amber" | "emerald";
  scope: string;
  active?: boolean;
  onClick: () => void;
}) {
  const styles = {
    blue: "bg-blue-50 text-blue-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <button
      aria-pressed={active}
      className={`flex items-center justify-between rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300 ${
        active ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold text-slate-950">
          {value.toLocaleString()}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {active ? `Filtering · ${scope}` : scope}
        </p>
      </div>
      <span className={`ml-3 shrink-0 rounded-xl p-2.5 ${styles[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
    </button>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <input
        key={`${label}-${value}`}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[var(--admin-primary)]"
        onBlur={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onChange(event.currentTarget.value);
        }}
        placeholder={placeholder}
        type={type}
        defaultValue={value}
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  includeAll = true,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  includeAll?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[var(--admin-primary)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {includeAll ? <option value="">All</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SupportStatusBadge({ value }: { value: string }) {
  const style =
    value === "RESOLVED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : value === "NEW"
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : value === "WAITING_ON_CUSTOMER"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-blue-50 text-blue-700 ring-blue-200";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${style}`}
    >
      {titleCase(value)}
    </span>
  );
}

function SortButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="font-medium" onClick={onClick} type="button">
      {label}
    </button>
  );
}
function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={
          mono ? "mt-1 break-all font-mono text-xs" : "mt-1 text-slate-800"
        }
      >
        {value}
      </p>
    </div>
  );
}
function getTenantId(log: PlatformErrorEvent) {
  return log.tenant?.id ?? "platform";
}
function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function toLocalDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function getDatePreset(from: string, to: string) {
  if (!from && !to) return "all";
  if (!from || to) return "custom";
  const hours = (Date.now() - new Date(from).getTime()) / 3_600_000;
  if (Math.abs(hours - 24) < 0.25) return "24h";
  if (Math.abs(hours - 24 * 7) < 0.25) return "7d";
  if (Math.abs(hours - 24 * 30) < 0.25) return "30d";
  return "custom";
}

function toCsv(logs: PlatformErrorEvent[]) {
  const rows = logs.map((log) => [
    log.referenceNumber,
    log.timestamp,
    log.severity,
    log.sourceApp,
    log.environment,
    log.status,
    getTenantId(log),
    log.tenant?.name ?? "",
    log.user?.id ?? "",
    log.user?.email ?? "",
    log.method ?? "",
    log.route ?? "",
    String(log.statusCode),
    log.category,
    log.message,
    log.assignedTo ?? "",
    log.customerUpdate ?? "",
  ]);
  return [
    [
      "Reference",
      "Timestamp",
      "Severity",
      "Source App",
      "Environment",
      "Support Status",
      "Tenant ID",
      "Tenant Name",
      "User ID",
      "User Email",
      "Method",
      "Route",
      "Status Code",
      "Category",
      "Message",
      "Assigned To",
      "Customer Update",
    ],
    ...rows,
  ]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}
function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
