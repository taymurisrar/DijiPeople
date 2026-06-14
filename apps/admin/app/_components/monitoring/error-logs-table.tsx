"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";

export type PlatformErrorEvent = {
  referenceNumber: string;
  timestamp: string;
  severity: string;
  sourceApp: string;
  tenant: { id: string; name: string; slug: string } | null;
  user: { id: string; email: string; fullName: string } | null;
  route: string | null;
  method: string | null;
  category: string;
  message: string;
  status: string;
  statusCode: number;
  environment: string;
};

export function ErrorLogsTable({ logs }: { logs: PlatformErrorEvent[] }) {
  const [reference, setReference] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [environment, setEnvironment] = useState("");

  const rows = useMemo(
    () =>
      logs.filter(
        (log) =>
          (!reference ||
            log.referenceNumber.toLowerCase().includes(reference.toLowerCase())) &&
          (!severity || log.severity === severity) &&
          (!source || log.sourceApp === source) &&
          (!environment || log.environment === environment),
      ),
    [environment, logs, reference, severity, source],
  );

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          onChange={(event) => setReference(event.target.value)}
          placeholder="Search reference number"
          value={reference}
        />
        <FilterSelect label="All severities" onChange={setSeverity} values={unique(logs.map((log) => log.severity))} />
        <FilterSelect label="All source apps" onChange={setSource} values={unique(logs.map((log) => log.sourceApp))} />
        <FilterSelect label="All environments" onChange={setEnvironment} values={unique(logs.map((log) => log.environment))} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(log) => log.referenceNumber}
        compact
        emptyTitle="No monitoring events"
        emptyDescription="Persisted API and web app errors will appear here with a searchable reference number."
        renderExpandedRow={(log) => (
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Reference" value={log.referenceNumber} mono />
            <Detail label="HTTP status" value={String(log.statusCode)} />
            <Detail label="Tenant" value={log.tenant?.name ?? "Platform / unknown"} />
            <Detail label="User" value={log.user?.email ?? "Unknown"} />
            <Detail label="Route" value={`${log.method ?? ""} ${log.route ?? "Unknown"}`} mono />
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
          { key: "reference", header: "Reference number", minWidth: 180, render: (log) => <span className="font-mono text-xs font-semibold">{log.referenceNumber}</span> },
          { key: "timestamp", header: "Timestamp", render: (log) => new Date(log.timestamp).toLocaleString() },
          { key: "severity", header: "Severity", render: (log) => <TenantStatusBadge value={log.severity} /> },
          { key: "source", header: "Source app", render: (log) => log.sourceApp },
          { key: "tenant", header: "Tenant", render: (log) => log.tenant?.name ?? "Platform" },
          { key: "user", header: "User", render: (log) => log.user?.email ?? "Unknown" },
          { key: "route", header: "Route / endpoint", minWidth: 180, render: (log) => <span className="font-mono text-xs">{log.route ?? "Unknown"}</span> },
          { key: "category", header: "Category", render: (log) => log.category },
          { key: "message", header: "Message summary", minWidth: 240, render: (log) => log.message },
          { key: "status", header: "Status", render: (log) => log.status },
          { key: "environment", header: "Environment", render: (log) => log.environment },
        ]}
      />
    </div>
  );
}

function FilterSelect({ label, values, onChange }: { label: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" onChange={(event) => onChange(event.target.value)}>
      <option value="">{label}</option>
      {values.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={mono ? "mt-1 font-mono text-xs" : "mt-1"}>{value}</p></div>;
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}
