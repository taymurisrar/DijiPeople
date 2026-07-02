"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { DataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";

export type PlatformErrorEvent = {
  referenceNumber: string;
  timestamp: string;
  severity: string;
  sourceApp: string;
  tenant: { id: string; name: string; slug: string } | null;
  user:
    | {
        id: string;
        email: string;
        fullName: string;
        role?: string | null;
        source?: "platform-admin" | "tenant-user";
      }
    | null;
  route: string | null;
  method: string | null;
  category: string;
  message: string;
  status: string;
  statusCode: number;
  environment: string;
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
}: {
  logs: PlatformErrorEvent[];
  meta: PlatformErrorLogsMeta;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copiedReference, setCopiedReference] = useState<string | null>(null);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, router]);

  const filterValues = useMemo(
    () => ({
      search: searchParams.get("search") ?? "",
      severity: searchParams.get("severity") ?? "",
      sourceApp: searchParams.get("sourceApp") ?? "",
      environment: searchParams.get("environment") ?? "",
      tenantId: searchParams.get("tenantId") ?? "",
      userId: searchParams.get("userId") ?? "",
      category: searchParams.get("category") ?? "",
      route: searchParams.get("route") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    }),
    [searchParams],
  );

  function updateQuery(updates: Record<string, string | number | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    if (!("page" in updates)) params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  function sortBy(column: string) {
    const nextDirection =
      meta.sortBy === column && meta.sortDirection === "desc" ? "asc" : "desc";
    updateQuery({ sortBy: column, sortDirection: nextDirection, page: 1 });
  }

  async function copyReference(reference: string) {
    await navigator.clipboard.writeText(reference);
    setCopiedReference(reference);
    window.setTimeout(() => setCopiedReference(null), 1500);
  }

  function exportCsv() {
    const csv = toCsv(logs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dijipeople-error-logs-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 border-b border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <FilterInput
            label="Global search"
            onChange={(value) => updateQuery({ search: value })}
            placeholder="Reference, route, user, tenant, message"
            value={filterValues.search}
          />
          <FilterInput
            label="Tenant ID"
            onChange={(value) => updateQuery({ tenantId: value })}
            placeholder="platform or tenant UUID"
            value={filterValues.tenantId}
          />
          <FilterInput
            label="User ID"
            onChange={(value) => updateQuery({ userId: value })}
            placeholder="Tenant or platform user ID"
            value={filterValues.userId}
          />
          <FilterInput
            label="Route / endpoint"
            onChange={(value) => updateQuery({ route: value })}
            placeholder="/api/..."
            value={filterValues.route}
          />
          <FilterSelect
            label="Severity"
            onChange={(value) => updateQuery({ severity: value })}
            options={["ERROR", "WARNING", "INFO"]}
            value={filterValues.severity}
          />
          <FilterSelect
            label="Source app"
            onChange={(value) => updateQuery({ sourceApp: value })}
            options={["admin", "web", "api"]}
            value={filterValues.sourceApp}
          />
          <FilterSelect
            label="Environment"
            onChange={(value) => updateQuery({ environment: value })}
            options={["production", "staging", "development", "test"]}
            value={filterValues.environment}
          />
          <FilterInput
            label="Category"
            onChange={(value) => updateQuery({ category: value })}
            placeholder="VALIDATION_FAILED"
            value={filterValues.category}
          />
          <FilterInput
            label="From"
            onChange={(value) => updateQuery({ from: value })}
            type="datetime-local"
            value={filterValues.from}
          />
          <FilterInput
            label="To"
            onChange={(value) => updateQuery({ to: value })}
            type="datetime-local"
            value={filterValues.to}
          />
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Page size
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              onChange={(event) =>
                updateQuery({ pageSize: event.target.value, page: 1 })
              }
              value={String(meta.pageSize)}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Showing {logs.length} of {meta.total} sanitized error events.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={() => router.refresh()}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={() => setAutoRefresh((current) => !current)}
              type="button"
            >
              Auto-refresh {autoRefresh ? "on" : "off"}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={exportCsv}
              type="button"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <DataTable
        rows={logs}
        rowKey={(log) => log.referenceNumber}
        compact
        stickyHeader
        maxHeight="70vh"
        emptyTitle="No error events match these filters"
        emptyDescription="Clear filters or widen the date range to review platform diagnostics."
        pagination={{
          page: meta.page,
          pageSize: meta.pageSize,
          totalRecords: meta.total,
          onPageChange: (page) => updateQuery({ page }),
        }}
        renderExpandedRow={(log) => (
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Reference" value={log.referenceNumber} mono />
            <Detail label="Timestamp" value={formatTimestamp(log.timestamp)} />
            <Detail label="HTTP status" value={String(log.statusCode)} />
            <Detail label="Environment" value={log.environment} />
            <Detail
              label="Tenant"
              value={log.tenant?.name ?? "Platform / unknown"}
            />
            <Detail label="Tenant ID" value={getTenantId(log)} mono />
            <Detail
              label="User"
              value={
                log.user
                  ? `${log.user.email}${log.user.role ? ` (${log.user.role})` : ""}`
                  : "Unknown"
              }
            />
            <Detail label="User ID" value={log.user?.id ?? "Unknown"} mono />
            <Detail
              label="Route"
              value={`${log.method ?? ""} ${log.route ?? "Unknown"}`}
              mono
            />
            <Detail label="Category" value={log.category} mono />
            <div className="md:col-span-2">
              <Detail label="Message" value={log.message} />
            </div>
            <a
              className="font-semibold text-slate-700 hover:text-slate-950"
              href={`/api/error-logs/${encodeURIComponent(log.referenceNumber)}/download`}
            >
              Download sanitized diagnostics
            </a>
          </div>
        )}
        columns={[
          {
            key: "reference",
            header: "Reference",
            minWidth: 220,
            render: (log) => (
              <button
                className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-slate-800"
                onClick={() => copyReference(log.referenceNumber)}
                title="Copy reference ID"
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedReference === log.referenceNumber
                  ? "Copied"
                  : log.referenceNumber}
              </button>
            ),
          },
          {
            key: "timestamp",
            header: (
              <SortButton label="Timestamp" onClick={() => sortBy("timestamp")} />
            ),
            minWidth: 180,
            render: (log) => formatTimestamp(log.timestamp),
          },
          {
            key: "severity",
            header: (
              <SortButton label="Severity" onClick={() => sortBy("severity")} />
            ),
            render: (log) => <TenantStatusBadge value={log.severity} />,
          },
          {
            key: "source",
            header: "Source",
            render: (log) => log.sourceApp,
          },
          {
            key: "tenant",
            header: "Tenant",
            minWidth: 180,
            render: (log) => log.tenant?.name ?? "Platform",
          },
          {
            key: "tenantId",
            header: "Tenant ID",
            minWidth: 220,
            render: (log) => (
              <span className="font-mono text-xs">{getTenantId(log)}</span>
            ),
          },
          {
            key: "user",
            header: "User",
            minWidth: 220,
            render: (log) => log.user?.email ?? "Unknown",
          },
          {
            key: "route",
            header: "Route",
            minWidth: 220,
            render: (log) => (
              <span className="font-mono text-xs">
                {log.method ? `${log.method} ` : ""}
                {log.route ?? "Unknown"}
              </span>
            ),
          },
          {
            key: "category",
            header: "Category",
            minWidth: 180,
            render: (log) => log.category,
          },
          {
            key: "message",
            header: "Message",
            minWidth: 280,
            render: (log) => log.message,
          },
          { key: "status", header: "Status", render: (log) => log.status },
        ]}
      />
    </div>
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
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <input
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
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
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
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
      <p className={mono ? "mt-1 font-mono text-xs" : "mt-1"}>{value}</p>
    </div>
  );
}

function getTenantId(log: PlatformErrorEvent) {
  return log.tenant?.id ?? "platform";
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function toCsv(logs: PlatformErrorEvent[]) {
  const rows = logs.map((log) => [
    log.referenceNumber,
    log.timestamp,
    log.severity,
    log.sourceApp,
    log.environment,
    getTenantId(log),
    log.tenant?.name ?? "",
    log.user?.id ?? "",
    log.user?.email ?? "",
    log.method ?? "",
    log.route ?? "",
    String(log.statusCode),
    log.category,
    log.message,
  ]);
  return [
    [
      "Reference",
      "Timestamp",
      "Severity",
      "Source App",
      "Environment",
      "Tenant ID",
      "Tenant Name",
      "User ID",
      "User Email",
      "Method",
      "Route",
      "Status Code",
      "Category",
      "Message",
    ],
    ...rows,
  ]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
