"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { OnboardingStatusBadge } from "./onboarding-status-badge";
import type { EmployeeOnboardingRecord, OnboardingListResponse } from "../types";

export function OnboardingTable({
  response,
}: {
  response: OnboardingListResponse;
}) {
  const columns = useMemo<DataTableColumn<EmployeeOnboardingRecord>[]>(
    () => [
      {
        key: "title",
        header: "Onboarding",
        sortable: true,
        searchable: true,
        render: (item) => (
          <div className="min-w-[240px]">
            <Link
              className="font-semibold text-foreground transition hover:text-accent"
              href={`/onboarding/${item.id}`}
            >
              {item.title}
            </Link>
            <p className="mt-1 text-xs text-muted">
              {item.employee?.fullName ||
                item.candidate?.fullName ||
                "Unlinked onboarding"}
            </p>
          </div>
        ),
        sortAccessor: (item) => item.title,
        searchAccessor: (item) =>
          [
            item.title,
            item.employee?.fullName,
            item.candidate?.fullName,
            item.candidate?.email,
          ]
            .filter(Boolean)
            .join(" "),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: [
          { label: "Not started", value: "NOT_STARTED" },
          { label: "In progress", value: "IN_PROGRESS" },
          { label: "Ready for conversion", value: "READY_FOR_CONVERSION" },
          { label: "Blocked", value: "BLOCKED" },
          { label: "Completed", value: "COMPLETED" },
        ],
        render: (item) => <OnboardingStatusBadge status={item.status} />,
        sortAccessor: (item) => item.status,
        filterAccessor: (item) => item.status,
      },
      {
        key: "progress",
        header: "Progress",
        sortable: true,
        render: (item) => (
          <span className="text-sm text-muted">
            <span className="font-semibold text-foreground">
              {item.progress.percent}%
            </span>{" "}
            {item.progress.completedTasks}/{item.progress.totalTasks} tasks
          </span>
        ),
        sortAccessor: (item) => item.progress.percent,
      },
      {
        key: "dueDate",
        header: "Due",
        sortable: true,
        filterable: true,
        filterType: "date",
        render: (item) => (
          <span className="text-sm text-muted">{formatDate(item.dueDate)}</span>
        ),
        sortAccessor: (item) =>
          item.dueDate ? new Date(item.dueDate).getTime() : 0,
      },
      {
        key: "draft",
        header: "Draft Profile",
        render: (item) => {
          const draft = item.employee?.isDraftProfile
            ? item.employee
            : item.candidate?.draftEmployee;
          return draft ? (
            <Link
              className="text-sm font-medium text-accent transition hover:text-accent-strong"
              href={`/recruitment/employee-drafts/${draft.id}`}
            >
              Complete draft
            </Link>
          ) : (
            <span className="text-sm text-muted">Not created</span>
          );
        },
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      rows={response.items}
      getRowKey={(item) => item.id}
      entityLogicalName="onboarding records"
      pagination={{
        page: response.meta.page,
        pageSize: response.meta.pageSize,
        total: response.meta.total,
        totalPages: response.meta.totalPages,
        pageSizeOptions: [10, 25, 50],
      }}
      searchPlaceholder="Search onboarding records"
      emptyState={
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
          No onboarding records yet.
        </div>
      }
    />
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
