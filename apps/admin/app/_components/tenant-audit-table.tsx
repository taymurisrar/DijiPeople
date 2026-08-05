"use client";

import { ProDataTable } from "@/app/_components/crm/data-table";
import { formatDate } from "@/lib/formatters";
import { useState } from "react";

export type TenantAuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  sourceModule: string | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  createdAt: string;
  actorUser: { id: string; fullName: string; email: string } | null;
};

export function TenantAuditTable({ events }: { events: TenantAuditEvent[] }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = events.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  return (
    <ProDataTable
      rows={rows}
      rowKey={(event) => event.id}
      emptyTitle="No audit events"
      emptyDescription="Tenant administration events will appear here."
      pagination={{
        page: currentPage,
        pageSize,
        totalRecords: events.length,
        onPageChange: setPage,
      }}
      renderExpandedRow={(event) => (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
          {JSON.stringify(
            { before: event.beforeSnapshot, after: event.afterSnapshot },
            null,
            2,
          )}
        </pre>
      )}
      columns={[
        {
          key: "actor",
          header: "Actor",
          render: (event) =>
            event.actorUser?.fullName ||
            event.actorUser?.email ||
            "System / webhook",
        },
        {
          key: "action",
          header: "Action",
          render: (event) => (
            <span className="font-semibold text-slate-950">
              {event.action.replaceAll("_", " ")}
            </span>
          ),
        },
        {
          key: "target",
          header: "Target",
          render: (event) => `${event.entityType} ${event.entityId}`,
        },
        {
          key: "timestamp",
          header: "Timestamp",
          render: (event) => formatDate(event.createdAt),
        },
        {
          key: "source",
          header: "Source",
          render: (event) => event.sourceModule ?? "system",
        },
        {
          key: "severity",
          header: "Status",
          render: () => "Recorded",
        },
      ]}
    />
  );
}
