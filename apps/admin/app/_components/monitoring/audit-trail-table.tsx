"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProDataTable } from "@/app/_components/crm/data-table";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import { formatPlatformDateTime } from "@/lib/platform-formatters";
import { diffAuditSnapshotFields } from "@/lib/audit-trail";

export type PlatformAuditLogEntry = {
  id: string;
  platformActorUserId: string | null;
  actorDisplayName: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  actionCanonical: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  requestId: string | null;
  traceId: string | null;
  sourceModule: string | null;
  createdAt: string;
  eventTime: string;
};

export type PlatformAuditLogMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PlatformAuditLogFilters = {
  actions: string[];
  entityTypes: string[];
  actors: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  }>;
};

type PlatformAuditLogDetail = PlatformAuditLogEntry & {
  scope: unknown;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
};

export function AuditTrailTable({
  entries,
  meta,
  filters,
}: {
  entries: PlatformAuditLogEntry[];
  meta: PlatformAuditLogMeta;
  filters: PlatformAuditLogFilters;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  const current = {
    action: searchParams.get("action") ?? "",
    entityType: searchParams.get("entityType") ?? "",
    entityId: searchParams.get("entityId") ?? "",
    actorUserId: searchParams.get("actorUserId") ?? "",
    traceId: searchParams.get("traceId") ?? "",
    search: searchParams.get("search") ?? "",
    fromDate: searchParams.get("fromDate") ?? "",
    toDate: searchParams.get("toDate") ?? "",
  };
  const activeFilterCount = Object.values(current).filter(Boolean).length;

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
    updateQuery(
      Object.fromEntries(Object.keys(current).map((key) => [key, null])),
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              className="h-10 w-64 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[var(--admin-primary)]"
              defaultValue={current.search}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  updateQuery({ search: event.currentTarget.value });
                }
              }}
              placeholder="Search action or entity type"
            />
            <button
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setShowFilters((value) => !value)}
              type="button"
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {activeFilterCount > 0 ? (
              <button
                className="h-10 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                onClick={clearFilters}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>
          <span className="text-xs text-slate-500">
            Showing {entries.length} of {meta.total} audit rows
          </span>
        </div>

        {showFilters ? (
          <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Action"
              value={current.action}
              options={filters.actions.map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => updateQuery({ action: value })}
            />
            <FilterSelect
              label="Entity type"
              value={current.entityType}
              options={filters.entityTypes.map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => updateQuery({ entityType: value })}
            />
            <FilterInput
              label="Entity ID"
              value={current.entityId}
              onChange={(value) => updateQuery({ entityId: value })}
            />
            <FilterSelect
              label="Actor"
              value={current.actorUserId}
              options={filters.actors.map((actor) => ({
                value: actor.id,
                label:
                  [actor.firstName, actor.lastName].filter(Boolean).join(" ") ||
                  actor.email,
              }))}
              onChange={(value) => updateQuery({ actorUserId: value })}
            />
            <FilterInput
              label="Trace / request ID"
              value={current.traceId}
              onChange={(value) => updateQuery({ traceId: value })}
            />
            <FilterInput
              label="From"
              value={current.fromDate}
              type="date"
              onChange={(value) => updateQuery({ fromDate: value })}
            />
            <FilterInput
              label="To"
              value={current.toDate}
              type="date"
              onChange={(value) => updateQuery({ toDate: value })}
            />
            <FilterSelect
              label="Page size"
              value={String(meta.pageSize)}
              includeAll={false}
              options={[20, 50, 100].map((value) => ({
                value: String(value),
                label: `${value} rows`,
              }))}
              onChange={(value) => updateQuery({ pageSize: value, page: 1 })}
            />
          </div>
        ) : null}

        <ProDataTable
          rows={entries}
          rowKey={(entry) => entry.id}
          compact
          stickyHeader
          maxHeight="70vh"
          emptyTitle="No audit rows match these filters"
          emptyDescription="Clear filters or widen the date range to review platform activity."
          pagination={{
            page: meta.page,
            pageSize: meta.pageSize,
            totalRecords: meta.total,
            onPageChange: (page) => updateQuery({ page }),
          }}
          stickyPagination
          renderExpandedRow={(entry) => (
            <AuditTrailDetailPanel key={entry.id} entry={entry} />
          )}
          columns={[
            {
              key: "createdAt",
              header: "When",
              width: 190,
              render: (entry) => <TimeCell value={entry.createdAt} />,
            },
            {
              key: "actor",
              header: "Actor",
              render: (entry) => (
                <div>
                  <p className="text-sm text-slate-800">
                    {entry.actorDisplayName}
                  </p>
                  {entry.actorRole ? (
                    <p className="text-xs text-slate-500">{entry.actorRole}</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: "action",
              header: "Action",
              render: (entry) => (
                <span className="text-sm text-slate-800">
                  {entry.actionLabel}
                </span>
              ),
            },
            {
              key: "entity",
              header: "Entity",
              render: (entry) => (
                <div>
                  <p className="text-sm text-slate-800">{entry.entityType}</p>
                  <p className="max-w-[220px] truncate font-mono text-xs text-slate-500">
                    {entry.entityId}
                  </p>
                </div>
              ),
            },
            {
              key: "trace",
              header: "Trace ID",
              render: (entry) => (
                <span className="font-mono text-xs text-slate-500">
                  {entry.traceId ?? "—"}
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * Fetched lazily on expand, the same shape `IncidentDetailPanel` in
 * `error-logs-table.tsx` already established for this app: the list response
 * carries no snapshot (BUG-3564 — a list row has no reason to ship every
 * row's before/after payload), the detail proxy route does.
 */
function AuditTrailDetailPanel({ entry }: { entry: PlatformAuditLogEntry }) {
  const { defaults } = usePlatformDefaults();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; detail: PlatformAuditLogDetail }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/platform/audit-logs/${encodeURIComponent(entry.id)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed (${response.status}).`);
        }
        return (await response.json()) as PlatformAuditLogDetail;
      })
      .then((detail) => {
        if (!cancelled) setState({ status: "ready", detail });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load audit detail.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Loading audit detail…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {state.message}
      </div>
    );
  }

  const { detail } = state;
  const diffs = diffAuditSnapshotFields(
    detail.beforeSnapshot,
    detail.afterSnapshot,
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Detail label="Actor" value={detail.actorDisplayName} />
        <Detail label="Actor email" value={detail.actorEmail ?? "Unknown"} />
        <Detail
          label="Source module"
          value={detail.sourceModule ?? "Unknown"}
        />
        <Detail
          label="Request / trace ID"
          value={detail.traceId ?? detail.requestId ?? "Unknown"}
          mono
        />
        <Detail
          label="Recorded"
          value={formatPlatformDateTime(detail.createdAt, defaults)}
        />
        <Detail label="Action" value={detail.action} mono />
        <Detail label="Entity type" value={detail.entityType} />
        <Detail label="Entity ID" value={detail.entityId} mono />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          What changed
        </p>
        {diffs.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            No before/after snapshot was recorded for this action.
          </p>
        ) : (
          <table className="mt-2 w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="w-1/4 pb-1 font-semibold">Field</th>
                <th className="w-3/8 pb-1 font-semibold">Before</th>
                <th className="w-3/8 pb-1 font-semibold">After</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((diff) => (
                <tr key={diff.field} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 align-top font-mono text-slate-600">
                    {diff.field}
                  </td>
                  <td className="break-all py-1.5 pr-2 align-top text-rose-700">
                    {formatDiffValue(diff.before)}
                  </td>
                  <td className="break-all py-1.5 align-top text-emerald-700">
                    {formatDiffValue(diff.after)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatDiffValue(value: unknown) {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function TimeCell({ value }: { value: string }) {
  const { defaults } = usePlatformDefaults();
  return (
    <span className="text-xs text-slate-600">
      {formatPlatformDateTime(value, defaults)}
    </span>
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

function FilterInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
