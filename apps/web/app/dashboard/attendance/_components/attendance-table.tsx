"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTablePagination } from "@/app/components/data-table/data-table-pagination";
import {
  DataTableColumn,
  DataTableFilterState,
} from "@/app/components/data-table/types";
import { formatDateWithTenantSettings } from "@/lib/date-format";
import { AttendanceEntryRecord } from "../types";
import { AttendanceStatusBadge } from "./attendance-status-badge";

type AttendanceTableProps = {
  entries: AttendanceEntryRecord[];
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
  showEmployee?: boolean;
  enableSelection?: boolean;
  useEntityDataApi?: boolean;
};

export function AttendanceTable({
  entries,
  formatting,
  pagination,
  visibleColumnKeys,
  initialSortColumnKey = "attendanceDate",
  initialSortDirection = "desc",
  initialFilters = [],
  showEmployee = false,
  enableSelection = false,
  useEntityDataApi = false,
}: AttendanceTableProps) {
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<string[]>([]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("attendance:selected-ids-changed", {
        detail: {
          ids: selectedAttendanceIds,
          count: selectedAttendanceIds.length,
        },
      }),
    );
  }, [selectedAttendanceIds]);

  useEffect(() => {
    function clearSelection() {
      setSelectedAttendanceIds([]);
    }

    window.addEventListener("attendance:clear-selection", clearSelection);

    return () =>
      window.removeEventListener("attendance:clear-selection", clearSelection);
  }, []);

  const columns: DataTableColumn<AttendanceEntryRecord>[] = [
    {
      key: "employee",
      entityField: "employeeId",
      header: "Employee",
      sortable: true,
      filterable: true,
      filterType: "text",
      filterParamKey: "employee",
      sortAccessor: (entry) => entry.employee?.fullName ?? "",
      filterAccessor: (entry) =>
        `${entry.employee?.fullName ?? ""} ${entry.employee?.employeeCode ?? ""}`,
      render: (entry) => (
        <div>
          <p className="font-semibold text-foreground">
            {entry.employee?.fullName ?? "Employee"}
          </p>
          <p className="mt-1 text-muted">
            {entry.employee?.employeeCode ?? "No employee code"}
          </p>
        </div>
      ),
    },
    {
      key: "attendanceDate",
      entityField: "attendanceDate",
      header: "Date",
      sortable: true,
      filterable: true,
      filterType: "date",
      filterParamKey: "attendanceDate",
      sortAccessor: (entry) => new Date(entry.attendanceDate).getTime(),
      filterAccessor: (entry) => entry.attendanceDate,
      cellClassName: "text-muted",
      render: (entry) =>
        formatDateWithTenantSettings(entry.attendanceDate, formatting),
    },
    {
      key: "attendanceMode",
      entityField: "attendanceMode",
      header: "Mode",
      sortable: true,
      filterable: true,
      filterType: "multiSelect",
      filterParamKey: "attendanceMode",
      filterOptions: [
        { label: "Office", value: "OFFICE" },
        { label: "Remote", value: "REMOTE" },
        { label: "Hybrid", value: "HYBRID" },
      ],
      sortAccessor: (entry) => entry.attendanceMode,
      filterAccessor: (entry) => entry.attendanceMode,
      cellClassName: "text-muted",
      render: (entry) => formatAttendanceMode(entry.attendanceMode),
    },
    {
      key: "checkIn",
      entityField: "checkInAt",
      header: "Check In",
      sortable: true,
      filterable: false,
      sortAccessor: (entry) =>
        entry.checkInAt ? new Date(entry.checkInAt).getTime() : 0,
      cellClassName: "text-muted",
      render: (entry) => (
        <div>
          <p>{entry.checkInAt ? formatTime(entry.checkInAt) : "Not recorded"}</p>
          {entry.isLateCheckIn && entry.lateCheckInMinutes ? (
            <p className="mt-1 text-xs text-danger">
              Late by {entry.lateCheckInMinutes} min
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "checkOut",
      entityField: "checkOutAt",
      header: "Check Out",
      sortable: true,
      filterable: false,
      sortAccessor: (entry) =>
        entry.checkOutAt ? new Date(entry.checkOutAt).getTime() : 0,
      cellClassName: "text-muted",
      render: (entry) => (
        <div>
          <p>{entry.checkOutAt ? formatTime(entry.checkOutAt) : "Pending"}</p>
          {entry.isLateCheckOut && entry.lateCheckOutMinutes ? (
            <p className="mt-1 text-xs text-warning">
              Beyond grace by {entry.lateCheckOutMinutes} min
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "duration",
      entityField: "durationMinutes",
      header: "Duration",
      sortable: true,
      filterable: false,
      sortAccessor: (entry) => entry.durationMinutes ?? 0,
      cellClassName: "text-muted",
      render: (entry) => entry.durationLabel ?? "Open",
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
        { label: "Present", value: "PRESENT" },
        { label: "Absent", value: "ABSENT" },
        { label: "Late", value: "LATE" },
        { label: "Half Day", value: "HALF_DAY" },
        { label: "Missed Checkout", value: "MISSED_CHECKOUT" },
      ],
      sortAccessor: (entry) => entry.status,
      filterAccessor: (entry) => entry.status,
      render: (entry) => <AttendanceStatusBadge status={entry.status} />,
    },
    {
      key: "location",
      entityField: "officeLocationId",
      header: "Location",
      sortable: true,
      filterable: true,
      filterType: "text",
      filterParamKey: "location",
      sortAccessor: (entry) =>
        entry.officeLocation?.name ?? entry.remoteAddressText ?? "",
      filterAccessor: (entry) =>
        entry.officeLocation?.name ?? entry.remoteAddressText ?? "",
      cellClassName: "text-muted",
      render: (entry) =>
        entry.officeLocation?.name ?? entry.remoteAddressText ?? "No location",
    },
    {
      key: "source",
      entityField: "source",
      header: "Source",
      sortable: true,
      filterable: true,
      filterType: "text",
      filterParamKey: "source",
      sortAccessor: (entry) => entry.source,
      filterAccessor: (entry) => entry.source,
      cellClassName: "text-muted",
      render: (entry) => entry.source,
    },
    {
      key: "details",
      entityField: "notes",
      header: "Details",
      sortable: false,
      filterable: true,
      filterType: "text",
      filterParamKey: "details",
      filterAccessor: (entry) =>
        entry.workSummary ??
        entry.checkOutNote ??
        entry.checkInNote ??
        entry.notes ??
        "",
      cellClassName: "text-muted",
      render: (entry) =>
        entry.workSummary ??
        entry.checkOutNote ??
        entry.checkInNote ??
        entry.notes ??
        "No details",
    },
  ];

  const baseColumns = showEmployee
    ? columns
    : columns.filter((column) => column.key !== "employee");

  const visibleColumns = visibleColumnKeys?.length
    ? baseColumns.filter((column) =>
        getAttendanceCustomizationColumnKeys(column.key).some((columnKey) =>
          visibleColumnKeys.includes(columnKey),
        ),
      )
    : baseColumns;

  return (
    <section className="grid gap-6">
      <DataTable
        mode={useEntityDataApi ? "server" : "client"}
        entityLogicalName={useEntityDataApi ? "attendance" : undefined}
        rows={entries}
        columns={visibleColumns.length ? visibleColumns : baseColumns}
        getRowKey={(entry) => entry.id}
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
        selectedRowKeys={selectedAttendanceIds}
        onSelectedRowKeysChange={setSelectedAttendanceIds}
      />
    </section>
  );
}

function getAttendanceCustomizationColumnKeys(tableColumnKey: string) {
  const map: Record<string, string[]> = {
    employee: ["employeeId", "employee", "employeeCode", "fullName"],
    attendanceDate: ["attendanceDate"],
    attendanceMode: ["attendanceMode"],
    checkIn: ["checkInAt", "isLateCheckIn", "lateCheckInMinutes"],
    checkOut: ["checkOutAt", "isLateCheckOut", "lateCheckOutMinutes"],
    duration: ["durationMinutes", "durationLabel"],
    status: ["status"],
    location: ["officeLocationId", "officeLocation", "remoteAddressText"],
    source: ["source"],
    details: ["workSummary", "checkOutNote", "checkInNote", "notes"],
  };

  return map[tableColumnKey] ?? [tableColumnKey];
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAttendanceMode(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}