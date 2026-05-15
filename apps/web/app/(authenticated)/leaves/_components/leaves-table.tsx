"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTablePagination } from "@/app/components/data-table/data-table-pagination";
import {
  DataTableColumn,
  DataTableFilterState,
} from "@/app/components/data-table/types";
import { formatDateWithTenantSettings } from "@/lib/date-format";
import { LeaveRequestRecord } from "../types";
import { LeaveRequestActionButtons } from "./leave-request-action-buttons";
import { LeaveRequestStatusBadge } from "./leave-request-status-badge";

type LeavesTableProps = {
  requests: LeaveRequestRecord[];
  formatting: {
    dateFormat: string;
    locale: string;
    timezone: string;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    pathname: string;
    searchParams: Record<string, string | undefined>;
  };
  visibleColumnKeys?: string[];
  initialSortColumnKey?: string;
  initialSortDirection?: "asc" | "desc";
  initialFilters?: DataTableFilterState[];
  enableSelection?: boolean;
  useEntityDataApi?: boolean;
};

export function LeavesTable({
  requests,
  formatting,
  pagination,
  visibleColumnKeys,
  initialSortColumnKey = "startDate",
  initialSortDirection = "desc",
  initialFilters = [],
  enableSelection = false,
  useEntityDataApi = false,
}: LeavesTableProps) {
  const [selectedLeaveIds, setSelectedLeaveIds] = useState<string[]>([]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("leaves:selected-ids-changed", {
        detail: {
          ids: selectedLeaveIds,
          count: selectedLeaveIds.length,
        },
      }),
    );
  }, [selectedLeaveIds]);

  useEffect(() => {
    function clearSelection() {
      setSelectedLeaveIds([]);
    }

    window.addEventListener("leaves:clear-selection", clearSelection);
    return () =>
      window.removeEventListener("leaves:clear-selection", clearSelection);
  }, []);

  const columns: DataTableColumn<LeaveRequestRecord>[] = [
    {
      key: "employee",
      entityField: "employeeId",
      header: "Employee",
      sortable: true,
      filterable: true,
      filterType: "text",
      filterParamKey: "employee",
      sortAccessor: (request) => request.employee.fullName,
      filterAccessor: (request) =>
        `${request.employee.fullName} ${request.employee.employeeCode}`,
      render: (request) => (
        <div>
          <Link
            className="font-semibold text-foreground transition hover:text-accent"
            href={`/leaves/${request.id}`}
          >
            {request.employee.fullName}
          </Link>
          <p className="mt-1 text-muted">{request.employee.employeeCode}</p>
        </div>
      ),
    },
    {
      key: "leaveType",
      entityField: "leaveTypeId",
      header: "Leave Type",
      sortable: true,
      filterable: true,
      filterType: "text",
      filterParamKey: "leaveType",
      sortAccessor: (request) => request.leaveType.name,
      filterAccessor: (request) =>
        `${request.leaveType.name} ${request.leaveType.category}`,
      render: (request) => (
        <div>
          <p className="font-medium text-foreground">
            {request.leaveType.name}
          </p>
          <p className="mt-1 text-muted">{request.leaveType.category}</p>
        </div>
      ),
    },
    {
      key: "dateRange",
      entityField: "startDate",
      header: "Dates",
      sortable: true,
      filterable: true,
      filterType: "date",
      filterParamKey: "dateRange",
      sortAccessor: (request) => new Date(request.startDate).getTime(),
      filterAccessor: (request) => request.startDate,
      cellClassName: "text-muted",
      render: (request) => (
        <div>
          <p>
            {formatDateWithTenantSettings(request.startDate, formatting)} to{" "}
            {formatDateWithTenantSettings(request.endDate, formatting)}
          </p>
          <p className="mt-1">{request.totalDays} day(s)</p>
        </div>
      ),
    },
    {
      key: "status",
      entityField: "status",
      header: "Status",
      sortable: true,
      filterable: true,
      filterType: "multiSelect",
      filterParamKey: "status",
      filterOptions: [
        { label: "Pending", value: "PENDING" },
        { label: "Approved", value: "APPROVED" },
        { label: "Rejected", value: "REJECTED" },
        { label: "Cancelled", value: "CANCELLED" },
      ],
      sortAccessor: (request) => request.status,
      filterAccessor: (request) => request.status,
      render: (request) => <LeaveRequestStatusBadge status={request.status} />,
    },
    {
      key: "attachments",
      entityField: "documents",
      header: "Attachments",
      sortable: false,
      filterable: false,
      render: (request) =>
        request.documents && request.documents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {request.documents.map((document) => (
              <a
                key={document.id}
                className="text-sm font-medium text-accent transition hover:text-accent-strong"
                href={document.downloadPath}
                target="_blank"
              >
                {document.documentType?.name || "Attachment"}:{" "}
                {document.originalFileName}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-muted">No attachments</p>
        ),
    },
    {
      key: "approvalFlow",
      entityField: "pendingStep",
      header: "Approval Flow",
      sortable: false,
      filterable: true,
      filterType: "text",
      filterParamKey: "approvalFlow",
      filterAccessor: (request) =>
        request.pendingStep
          ? `${request.pendingStep.stepOrder} ${request.pendingStep.approverType}`
          : "",
      cellClassName: "text-muted",
      render: (request) => (
        <div>
          {request.pendingStep ? (
            <p>
              Pending step {request.pendingStep.stepOrder}:{" "}
              {request.pendingStep.approverType}
            </p>
          ) : (
            <p>No pending step</p>
          )}

          {request.reason ? (
            <p className="mt-2 max-w-xs">{request.reason}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      sortable: false,
      filterable: false,
      render: (request) => <LeaveRequestActionButtons request={request} />,
    },
  ];

  const visibleColumns = visibleColumnKeys?.length
    ? columns.filter((column) =>
        getLeaveCustomizationColumnKeys(column.key).some((columnKey) =>
          visibleColumnKeys.includes(columnKey),
        ),
      )
    : columns;

  return (
    <section className="grid gap-6">
      <DataTable
        mode={useEntityDataApi ? "server" : "client"}
        entityLogicalName={useEntityDataApi ? "leaves" : undefined}
        rows={requests}
        columns={visibleColumns.length ? visibleColumns : columns}
        getRowKey={(request) => request.id}
        initialSort={{
          columnKey: initialSortColumnKey,
          direction: initialSortDirection,
        }}
        initialFilters={initialFilters}
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalItems: pagination.totalItems,
        }}
        footer={<DataTablePagination {...pagination} />}
        enableSelection={enableSelection}
        selectedRowKeys={selectedLeaveIds}
        onSelectedRowKeysChange={setSelectedLeaveIds}
      />
    </section>
  );
}

function getLeaveCustomizationColumnKeys(tableColumnKey: string) {
  const map: Record<string, string[]> = {
    employee: ["employeeId", "employee", "employeeCode", "fullName"],
    leaveType: ["leaveTypeId", "leaveType", "leaveTypeName", "category"],
    dateRange: ["startDate", "endDate", "totalDays"],
    status: ["status"],
    attachments: ["documents"],
    approvalFlow: ["pendingStep", "reason"],
    actions: ["actions"],
  };

  return map[tableColumnKey] ?? [tableColumnKey];
}