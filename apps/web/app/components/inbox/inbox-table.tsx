"use client";

import { Archive, Check, ExternalLink, Eye, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import type { InboxNotification, InboxResponse } from "./inbox-types";

type InboxTableProps = {
  response: InboxResponse;
};

export function InboxTable({ response }: InboxTableProps) {
  const router = useRouter();
  const [items, setItems] = useState(response.items);
  const [notice, setNotice] = useState<string | null>(null);

  const openNotification = useCallback(async (id: string) => {
    setNotice(null);
    const result = await requestJson<{
      state: "OK" | "ACCESS_DENIED" | "RECORD_NOT_FOUND" | "SUPERSEDED" | "EXPIRED";
      navigationTarget: string | null;
    }>(`/api/inbox/${id}/open`, { method: "POST", body: "{}" });

    if (result.state === "OK" && result.navigationTarget) {
      router.push(result.navigationTarget);
      return;
    }

    setNotice(readableOpenState(result.state));
  }, [router]);

  const updateStatus = useCallback(async (id: string, status: string) => {
    await requestJson(`/api/inbox/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }, []);

  const columns = useMemo<DataTableColumn<InboxNotification>[]>(
    () => [
      {
        key: "title",
        header: "Notification",
        sortable: true,
        searchable: true,
        searchAccessor: (row) => `${row.title} ${row.summary ?? ""}`,
        sortAccessor: (row) => row.title,
        render: (row) => (
          <div className="max-w-md">
            <p className="font-semibold text-foreground">{row.title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted">
              {row.summary ?? row.body ?? "No additional summary."}
            </p>
          </div>
        ),
      },
      {
        key: "module",
        header: "Module",
        filterable: true,
        filterType: "select",
        filterOptions: moduleOptions,
        filterAccessor: (row) => row.moduleKey,
        render: (row) => <StatusPill tone="neutral">{label(row.moduleKey)}</StatusPill>,
      },
      {
        key: "category",
        header: "Category",
        filterable: true,
        render: (row) => label(row.category),
      },
      {
        key: "priority",
        header: "Priority",
        sortable: true,
        sortAccessor: (row) => row.priority,
        render: (row) => <StatusPill tone={row.priority <= 2 ? "warning" : "neutral"}>{row.priority}</StatusPill>,
      },
      {
        key: "status",
        header: "Status",
        filterable: true,
        filterType: "select",
        filterOptions: statusOptions,
        filterAccessor: (row) => row.status,
        render: (row) => <StatusPill tone={row.status === "UNREAD" ? "info" : "neutral"}>{label(row.status)}</StatusPill>,
      },
      {
        key: "createdAtUtc",
        header: "Created",
        sortable: true,
        sortAccessor: (row) => new Date(row.createdAtUtc),
        render: (row) => formatDateTime(row.createdAtUtc),
      },
      {
        key: "record",
        header: "Related record",
        searchable: true,
        searchAccessor: (row) => row.relatedRecordNumber ?? row.relatedEntityId ?? "",
        /*
         * BUG-2017 — this rendered the bare `relatedEntityId` UUID with no
         * label and no link, the one unfinished cell on an otherwise
         * correctly-rendered row. `relatedRecordNumber` (a denormalised,
         * human-readable identifier) and `targetUrl` (the direct navigation
         * target) already exist on the notification — `targetUrl` is the
         * same field `notification-bell.tsx` already links with — so no new
         * API call or route resolver was needed, only using what the
         * notification already carried.
         */
        render: (row) => relatedRecordCell(row),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="Details" onClick={() => router.push(`/inbox/${row.id}`)}>
              <Eye className="h-4 w-4" />
            </IconButton>
            <IconButton label="Open record" onClick={() => void openNotification(row.id)}>
              <ExternalLink className="h-4 w-4" />
            </IconButton>
            <IconButton label="Mark read" onClick={() => void updateStatus(row.id, "READ")}>
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton label="Dismiss" onClick={() => void updateStatus(row.id, "DISMISSED")}>
              <X className="h-4 w-4" />
            </IconButton>
            <IconButton label="Archive" onClick={() => void updateStatus(row.id, "ARCHIVED")}>
              <Archive className="h-4 w-4" />
            </IconButton>
          </div>
        ),
      },
    ],
    [openNotification, router, updateStatus],
  );

  return (
    <div className="space-y-4">
      {notice ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </div>
      ) : null}
      <DataTable
        columns={columns}
        emptyState={<EmptyState title="Inbox is clear" description="New notifications and work queue items will appear here." />}
        entityLogicalName="notifications"
        getRowKey={(row) => row.id}
        rows={items}
        searchPlaceholder="Search inbox"
        pagination={response}
      />
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted transition hover:border-accent/30 hover:text-accent"
    >
      {children}
    </button>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Request failed.");
  return data as T;
}

function label(value: string | null) {
  return value ? value.replace(/[_-]/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "None";
}

/**
 * BUG-2017 — see the column definition above. A declared
 * `relatedRecordNumber` always wins; the entity type (e.g. "leave-request" →
 * "Leave Request") is the floor under a notification that never got one.
 * Only `relatedEntityId` with nothing else to show it by is the case this
 * record reported — and even then it is never rendered as the cell's sole
 * content: it becomes the accessible name of a "No label" link when a target
 * exists, or plain "No record" text when there is truly nothing to open.
 */
// Exported only for inbox-related-record-cell.spec.ts — apps/web has no
// jsdom to render this table in.
export function relatedRecordCell(row: InboxNotification) {
  const recordLabel =
    row.relatedRecordNumber ??
    (row.relatedEntityType ? label(row.relatedEntityType) : null);

  if (!row.targetUrl) {
    return recordLabel ?? (row.relatedEntityId ? "Related record" : "No record");
  }

  return (
    <Link
      className="font-medium text-accent hover:underline"
      href={row.targetUrl}
      onClick={(event) => event.stopPropagation()}
    >
      {recordLabel ?? "View record"}
    </Link>
  );
}

function readableOpenState(state: string) {
  if (state === "ACCESS_DENIED") return "You no longer have access to the related record.";
  if (state === "RECORD_NOT_FOUND") return "The related record is no longer available.";
  if (state === "SUPERSEDED") return "This notification has been superseded by a newer update.";
  if (state === "EXPIRED") return "This notification has expired.";
  return "This notification can no longer be opened.";
}

const moduleOptions = [
  { label: "Employee", value: "employee" },
  { label: "Attendance", value: "attendance" },
  { label: "Leave", value: "leave" },
];

const statusOptions = [
  { label: "Unread", value: "UNREAD" },
  { label: "Read", value: "READ" },
  { label: "Dismissed", value: "DISMISSED" },
  { label: "Archived", value: "ARCHIVED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Superseded", value: "SUPERSEDED" },
  { label: "Actioned", value: "ACTIONED" },
];
