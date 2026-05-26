"use client";

import Link from "next/link";
import { ExternalLink, Eye } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import type { ApprovalRequestItem, ApprovalsResponse } from "./approval-types";

export function ApprovalsTable({ response }: { response: ApprovalsResponse }) {
  const columns = useMemo<DataTableColumn<ApprovalRequestItem>[]>(
    () => [
      {
        key: "title",
        header: "Request",
        sortable: true,
        searchable: true,
        searchAccessor: (row) => `${row.title} ${row.requestNumber ?? ""}`,
        sortAccessor: (row) => row.title,
        render: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.title}</p>
            <p className="mt-1 text-sm text-muted">{row.requestNumber ?? row.entityId}</p>
          </div>
        ),
      },
      {
        key: "module",
        header: "Module",
        filterable: true,
        filterType: "select",
        filterOptions: [
          { label: "Employee", value: "employee" },
          { label: "Attendance", value: "attendance" },
          { label: "Leave", value: "leave" },
        ],
        filterAccessor: (row) => row.moduleKey,
        render: (row) => label(row.moduleKey),
      },
      {
        key: "submittedBy",
        header: "Submitted by",
        render: (row) => person(row.submittedByUser),
      },
      {
        key: "submittedFor",
        header: "Submitted for",
        render: (row) =>
          row.submittedForEmployee
            ? `${row.submittedForEmployee.firstName} ${row.submittedForEmployee.lastName}`
            : "Not specified",
      },
      {
        key: "currentStep",
        header: "Current step",
        render: (row) => row.currentStep?.stepName ?? "No active step",
      },
      {
        key: "approver",
        header: "Current approver",
        render: (row) => assignmentLabel(row.currentStep),
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
        key: "sla",
        header: "SLA",
        render: (row) => <StatusPill tone={slaTone(row.currentStep?.slaStatus)}>{label(row.currentStep?.slaStatus ?? "NOT_APPLICABLE")}</StatusPill>,
      },
      {
        key: "submitted",
        header: "Submitted",
        sortable: true,
        sortAccessor: (row) => (row.submittedAtUtc ? new Date(row.submittedAtUtc) : null),
        render: (row) => (row.submittedAtUtc ? formatDateTime(row.submittedAtUtc) : "Not submitted"),
      },
      {
        key: "due",
        header: "Due",
        render: (row) => (row.currentStep?.dueAtUtc ? formatDateTime(row.currentStep.dueAtUtc) : "No due date"),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex gap-2">
            <Link className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted transition hover:border-accent/30 hover:text-accent" href={`/approvals/${row.id}`} title="View approval">
              <Eye className="h-4 w-4" />
            </Link>
            <Link className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-muted transition hover:border-accent/30 hover:text-accent" href={row.relatedRecordUrl} title="Open record">
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      emptyState={<EmptyState title="No approvals found" description="Approval requests and progress will appear here once workflows are submitted." />}
      entityLogicalName="approvals"
      getRowKey={(row) => row.id}
      rows={response.items}
      searchPlaceholder="Search approvals"
      pagination={response}
    />
  );
}

function person(value: { firstName: string; lastName: string; email: string }) {
  return `${value.firstName} ${value.lastName}`.trim() || value.email;
}

function assignmentLabel(step: ApprovalRequestItem["currentStep"]) {
  const assignment = step?.assignments.find((item) => item.status === "PENDING") ?? step?.assignments[0];
  if (!assignment) return "Not assigned";
  if (assignment.assignedToUser) return person(assignment.assignedToUser);
  if (assignment.assignedToRole) return assignment.assignedToRole.name;
  return "Resolver pending";
}

function label(value: string) {
  return value.replace(/[_-]/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string) {
  if (status === "APPROVED" || status === "COMPLETED") return "good";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "ESCALATED" || status === "RETURNED") return "warning";
  return "info";
}

function slaTone(status?: string) {
  if (status === "BREACHED" || status === "ESCALATED") return "danger";
  if (status === "DUE_SOON") return "warning";
  if (status === "ON_TRACK") return "good";
  return "neutral";
}

const statusOptions = [
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Returned", value: "RETURNED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Escalated", value: "ESCALATED" },
  { label: "Completed", value: "COMPLETED" },
];
