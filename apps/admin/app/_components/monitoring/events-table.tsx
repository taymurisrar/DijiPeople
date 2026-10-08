"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProDataTable } from "@/app/_components/crm/data-table";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import { formatPlatformDateTime } from "@/lib/platform-formatters";
import { formatPayload, titleCase } from "@/lib/error-log-console";
import { CopyReference, FilterSelect } from "./monitoring-ui";

/**
 * The platform event log — lifecycle activity (sign-ins, provisioning runs,
 * webhooks, emails), successful or not, kept apart from the error log.
 *
 * It was a hand-rolled table with no pagination, so only the newest 50 events
 * were ever reachable, behind a form that asked for tenant and customer UUIDs.
 * It now uses the shared table, pages on the server, and filters on what an
 * operator can choose. The id filters still work from a link (`?tenantId=`),
 * and show as a removable filter when present.
 */

export type PlatformEventRow = {
  id: string;
  eventCode: string;
  source: string;
  result: string;
  severity: string;
  environment: string;
  correlationId: string;
  entityType?: string | null;
  entityId?: string | null;
  tenantId?: string | null;
  customerAccountId?: string | null;
  occurredAt: string;
  metadata?: unknown;
};

/* The API's enums (`PlatformEventSource`, `PlatformEventResult`). */
const SOURCES = [
  "LANDING",
  "WEB_APP",
  "ADMIN",
  "API",
  "BACKGROUND",
  "STRIPE",
  "EMAIL",
  "INTEGRATION",
] as const;
const RESULTS = ["SUCCEEDED", "FAILED", "PENDING", "IGNORED"] as const;
const SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const;

const FILTER_KEYS = [
  "search",
  "source",
  "result",
  "severity",
  "from",
  "to",
  "tenantId",
  "customerAccountId",
  "correlationId",
  "eventCode",
] as const;

const RESULT_TONE: Record<string, string> = {
  FAILED: "bg-rose-50 text-rose-700 ring-rose-200",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  IGNORED: "bg-slate-100 text-slate-600 ring-slate-200",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export function EventsTable({
  items,
  total,
  page,
  pageSize,
}: {
  items: PlatformEventRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { defaults } = usePlatformDefaults();
  const [isPending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(
    searchParams.get("search") ?? "",
  );
  const value = (key: string) => searchParams.get(key) ?? "";
  const activeFilterCount = FILTER_KEYS.filter((key) => value(key)).length;

  function updateQuery(
    updates: Record<string, string | number | null>,
    { resetPage = true }: { resetPage?: boolean } = {},
  ) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, next] of Object.entries(updates)) {
      if (next === null || next === "") params.delete(key);
      else params.set(key, String(next));
    }
    if (resetPage) params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateQuery({ search: searchDraft.trim() || null });
  }

  const idFilters = (
    [
      ["tenantId", "Tenant"],
      ["customerAccountId", "Customer"],
      ["correlationId", "Correlation"],
      ["eventCode", "Event type"],
    ] as const
  ).filter(([key]) => value(key));

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <form
            className="relative min-w-[16rem] flex-1"
            onSubmit={submitSearch}
            role="search"
          >
            <label className="sr-only" htmlFor="event-log-search">
              Search events
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10"
              id="event-log-search"
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search event type, entity or correlation id"
              type="search"
              value={searchDraft}
            />
          </form>
          {activeFilterCount ? (
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              onClick={() => {
                setSearchDraft("");
                updateQuery(
                  Object.fromEntries(FILTER_KEYS.map((key) => [key, null])),
                );
              }}
              type="button"
            >
              <X aria-hidden className="h-4 w-4" />
              Clear filters ({activeFilterCount})
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <FilterSelect
            label="Source"
            onChange={(next) => updateQuery({ source: next })}
            options={SOURCES.map((item) => ({
              value: item,
              label: titleCase(item),
            }))}
            value={value("source")}
          />
          <FilterSelect
            label="Result"
            onChange={(next) => updateQuery({ result: next })}
            options={RESULTS.map((item) => ({
              value: item,
              label: titleCase(item),
            }))}
            value={value("result")}
          />
          <FilterSelect
            label="Severity"
            onChange={(next) => updateQuery({ severity: next })}
            options={SEVERITIES.map((item) => ({
              value: item,
              label: titleCase(item),
            }))}
            value={value("severity")}
          />
          <DateFilter
            label="From"
            onChange={(next) => updateQuery({ from: next })}
            value={value("from")}
          />
          <DateFilter
            label="To"
            onChange={(next) => updateQuery({ to: next })}
            value={value("to")}
          />
        </div>
        {idFilters.length ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {idFilters.map(([key, label]) => (
              <button
                aria-label={`Remove ${label} filter`}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 hover:bg-slate-100"
                key={key}
                onClick={() => updateQuery({ [key]: null })}
                type="button"
              >
                {label}: <span className="font-mono">{value(key)}</span>
                <X aria-hidden className="h-3 w-3" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ProDataTable
        compact
        emptyDescription={
          activeFilterCount
            ? "No event matches these filters."
            : "Events appear after landing, admin, API, billing or integration activity."
        }
        emptyTitle={
          activeFilterCount ? "No matching events" : "No events recorded"
        }
        loading={isPending}
        maxHeight="68vh"
        pagination={{
          page,
          pageSize,
          totalRecords: total,
          pageSizeOptions: [25, 50, 100],
          onPageChange: (next) =>
            updateQuery({ page: next }, { resetPage: false }),
          onPageSizeChange: (next) => updateQuery({ pageSize: next }),
        }}
        renderExpandedRow={(item) => {
          const metadata = formatPayload(item.metadata);
          return (
            <div className="grid gap-3 text-xs md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <dl className="space-y-2">
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-slate-500">
                    Environment
                  </dt>
                  <dd className="text-slate-800">
                    {titleCase(item.environment)}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-slate-500">
                    Tenant / customer
                  </dt>
                  <dd className="break-all font-mono text-slate-700">
                    {item.tenantId ?? "—"} / {item.customerAccountId ?? "—"}
                  </dd>
                </div>
              </dl>
              {metadata ? (
                <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                  {metadata}
                </pre>
              ) : (
                <p className="text-slate-500">No metadata was recorded.</p>
              )}
            </div>
          );
        }}
        rowKey={(item) => item.id}
        rows={items}
        stickyHeader
        stickyPagination
        columns={[
          {
            key: "occurredAt",
            header: "Occurred",
            width: 160,
            render: (item) => (
              <span className="whitespace-nowrap text-xs text-slate-700">
                {formatPlatformDateTime(item.occurredAt, defaults)}
              </span>
            ),
          },
          {
            key: "source",
            header: "Source",
            width: 120,
            render: (item) => (
              <span className="text-xs text-slate-800">
                {titleCase(item.source)}
              </span>
            ),
          },
          {
            key: "event",
            header: "Event",
            minWidth: 220,
            render: (item) => (
              <span className="text-sm font-medium text-slate-900">
                {titleCase(item.eventCode)}
              </span>
            ),
          },
          {
            key: "entity",
            header: "Entity",
            minWidth: 180,
            render: (item) =>
              item.entityType ? (
                <div className="min-w-0 max-w-[240px] text-xs">
                  <p className="truncate text-slate-800">{item.entityType}</p>
                  <p className="truncate font-mono text-slate-500">
                    {item.entityId ?? "—"}
                  </p>
                </div>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              ),
          },
          {
            key: "result",
            header: "Result",
            width: 110,
            render: (item) => (
              <span
                className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${RESULT_TONE[item.result] ?? RESULT_TONE.IGNORED}`}
              >
                {titleCase(item.result)}
              </span>
            ),
          },
          {
            key: "correlation",
            header: "Correlation",
            width: 200,
            render: (item) => (
              <CopyReference
                className="max-w-[190px]"
                value={item.correlationId}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}
