"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { EmailDeliveryLog } from "@/lib/notifications-api";
import { formatDateTime, StatusBadge, stringifyJson } from "./notification-ui";

export function EmailDeliveryLogsTable({
  logs,
}: {
  logs: EmailDeliveryLog[];
}) {
  const [selected, setSelected] = useState<EmailDeliveryLog | null>(null);
  const columns = useMemo<DataTableColumn<EmailDeliveryLog>[]>(
    () => [
      {
        key: "requestedAt",
        header: "Requested",
        sortable: true,
        sortAccessor: (log) => new Date(log.requestedAt),
        render: (log) => formatDateTime(log.requestedAt),
      },
      {
        key: "recipient",
        header: "Recipient",
        searchable: true,
        render: (log) => log.recipient,
      },
      {
        key: "eventCode",
        header: "Event",
        searchable: true,
        filterable: true,
        filterType: "text",
        render: (log) => (
          <span className="font-mono text-xs">{log.eventCode}</span>
        ),
      },
      {
        key: "subject",
        header: "Subject",
        searchable: true,
        render: (log) => log.subject,
      },
      {
        key: "providerType",
        header: "Provider",
        filterable: true,
        filterType: "select",
        filterOptions: [
          "CONSOLE",
          "DEV",
          "SMTP",
          "SES",
          "SENDGRID",
          "MAILGUN",
          "POSTMARK",
          "CUSTOM",
        ].map((value) => ({ label: value, value })),
        filterAccessor: (log) => log.providerType ?? "",
        render: (log) => log.providerType ?? "None",
      },
      {
        key: "status",
        header: "Status",
        filterable: true,
        filterType: "select",
        filterOptions: [
          "PENDING",
          "PROCESSING",
          "SENT",
          "DELIVERED",
          "FAILED",
          "SKIPPED",
          "DRY_RUN",
        ].map((value) => ({ label: value, value })),
        filterAccessor: (log) => log.status,
        render: (log) => <StatusBadge status={log.status} />,
      },
      {
        key: "processedAt",
        header: "Processed",
        sortable: true,
        sortAccessor: (log) => (log.processedAt ? new Date(log.processedAt) : null),
        render: (log) => formatDateTime(log.processedAt),
      },
      {
        key: "error",
        header: "Error",
        searchable: true,
        searchAccessor: (log) => log.errorMessage,
        render: (log) =>
          log.errorMessage ? (
            <button
              className="max-w-[220px] truncate text-left text-sm font-medium text-red-700 hover:underline"
              onClick={() => setSelected(log)}
              type="button"
            >
              {log.errorMessage}
            </button>
          ) : (
            <button
              className="text-sm font-medium text-accent hover:text-accent-strong"
              onClick={() => setSelected(log)}
              type="button"
            >
              Details
            </button>
          ),
      },
    ],
    [],
  );

  return (
    <div className="grid gap-4">
      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            description="Delivery attempts will appear here after template previews, dry runs, and sends are executed by the backend."
            title="No delivery logs"
          />
        }
        getRowKey={(log) => log.id}
        initialSort={{ columnKey: "requestedAt", direction: "desc" }}
        rows={logs}
        searchPlaceholder="Search recipient, event, subject, or error"
      />
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
          <section className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-[24px] border border-border bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Delivery Log Details
                </h3>
                <p className="mt-1 text-sm text-muted">{selected.id}</p>
              </div>
              <button
                className="rounded-full border border-border px-3 py-1 text-sm font-semibold"
                onClick={() => setSelected(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
              <Detail label="Recipient" value={selected.recipient} />
              <Detail label="Event" value={selected.eventCode} />
              <Detail label="Provider" value={selected.providerType ?? "None"} />
              <Detail label="Provider Message ID" value={selected.providerMessageId ?? "None"} />
              <Detail label="Requested" value={formatDateTime(selected.requestedAt)} />
              <Detail label="Processed" value={formatDateTime(selected.processedAt)} />
              <Detail label="Delivered" value={formatDateTime(selected.deliveredAt)} />
              <Detail label="Failed" value={formatDateTime(selected.failedAt)} />
            </dl>
            {selected.errorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {selected.errorMessage}
              </div>
            ) : null}
            <pre className="mt-5 max-h-72 overflow-auto rounded-2xl border border-border bg-slate-50 p-4 text-xs text-muted">
              {stringifyJson(selected.metadata)}
            </pre>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-slate-50 p-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  );
}
