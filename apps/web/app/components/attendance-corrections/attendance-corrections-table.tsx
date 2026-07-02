"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import type {
  AttendanceCorrectionListResponse,
  AttendanceCorrectionRequest,
} from "./attendance-correction-types";

type AttendanceCorrectionsTableProps = {
  response: AttendanceCorrectionListResponse;
};

export function AttendanceCorrectionsTable({
  response,
}: AttendanceCorrectionsTableProps) {
  const columns = useMemo<DataTableColumn<AttendanceCorrectionRequest>[]>(
    () => [
      {
        key: "request",
        header: "Request",
        searchable: true,
        sortable: true,
        searchAccessor: (row) => `${row.requestNumber} ${row.reason}`,
        sortAccessor: (row) => row.requestNumber,
        render: (row) => (
          <div className="max-w-md">
            <Link
              className="font-semibold text-foreground transition hover:text-accent"
              href={`/attendance/corrections/${row.id}`}
            >
              {row.requestNumber}
            </Link>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{row.reason}</p>
          </div>
        ),
      },
      {
        key: "employee",
        header: "Employee",
        searchable: true,
        searchAccessor: (row) => `${row.employeeName} ${row.employee.employeeCode ?? ""}`,
        render: (row) => (
          <div>
            <p className="font-medium text-foreground">{row.employeeName}</p>
            <p className="text-xs text-muted">{row.employee.employeeCode ?? "No code"}</p>
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
        filterable: true,
        render: (row) => label(row.correctionType),
      },
      {
        key: "status",
        header: "Status",
        filterable: true,
        filterType: "select",
        filterOptions: statusOptions,
        filterAccessor: (row) => row.status,
        render: (row) => <StatusPill tone={statusTone(row.status)}>{label(row.status)}</StatusPill>,
      },
      {
        key: "submitted",
        header: "Submitted",
        sortable: true,
        sortAccessor: (row) => new Date(row.submittedAtUtc ?? row.createdAtUtc),
        render: (row) => formatDateTime(row.submittedAtUtc ?? row.createdAtUtc),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <Link
            aria-label={`Open ${row.requestNumber}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted transition hover:border-accent/30 hover:text-accent"
            href={`/attendance/corrections/${row.id}`}
            title="Open request"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      emptyState={
        <EmptyState
          description="Submitted attendance correction requests will appear here."
          title="No attendance corrections"
        />
      }
      entityLogicalName="attendance correction requests"
      getRowKey={(row) => row.id}
      pagination={response}
      rows={response.items}
      searchPlaceholder="Search corrections"
    />
  );
}

export function AttendanceCorrectionViewTabs() {
  const views = [
    ["mine", "My Requests"],
    ["pending", "Pending My Approval"],
    ["team", "My Team"],
    ["approved", "Approved"],
    ["rejected", "Rejected"],
    ["all", "All Relevant"],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {views.map(([view, labelText]) => (
        <Link
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
          href={view === "mine" ? "/attendance/corrections" : `/attendance/corrections?view=${view}`}
          key={view}
        >
          {labelText}
        </Link>
      ))}
    </div>
  );
}

export function label(value: string | null | undefined) {
  return value
    ? value
        .replace(/[_-]/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "None";
}

export function statusTone(status: string) {
  if (status === "APPROVED") return "good";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "PENDING_APPROVAL" || status === "SUBMITTED") return "danger";
  if (status === "RETURNED") return "info";
  return "neutral";
}

const statusOptions = [
  { label: "Draft", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Pending Approval", value: "PENDING_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Returned", value: "RETURNED" },
  { label: "Cancelled", value: "CANCELLED" },
];
