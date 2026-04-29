"use client";

import Link from "next/link";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTablePagination } from "@/app/components/data-table/data-table-pagination";
import { DataTableColumn } from "@/app/components/data-table/types";
import { formatDateWithTenantSettings } from "@/lib/date-format";
import { EmployeeListItem } from "../types";
import { EmployeeStatusBadge } from "./employee-status-badge";

type EmployeesTableProps = {
  employees: EmployeeListItem[];
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
  useEntityDataApi?: boolean;
};

export function EmployeesTable({
  employees,
  formatting,
  pagination,
  visibleColumnKeys,
  initialSortColumnKey = "employee",
  initialSortDirection = "asc",
  useEntityDataApi = false,
}: EmployeesTableProps) {
  const columns: DataTableColumn<EmployeeListItem>[] = [
    {
      key: "employee",
      entityField: "firstName",
      header: "Employee",
      sortable: true,
      sortAccessor: (employee) => employee.fullName,
      render: (employee) => (
        <div>
          <Link
            className="font-semibold text-foreground transition hover:text-accent"
            href={`/dashboard/employees/${employee.id}`}
          >
            {employee.fullName}
          </Link>

          {employee.isDraftProfile ? (
            <p className="mt-1">
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Draft Employee
              </span>
            </p>
          ) : null}

          <p className="mt-1 text-muted">
            {employee.preferredName
              ? `Preferred: ${employee.preferredName}`
              : employee.workEmail || "No work email"}
          </p>
        </div>
      ),
    },
    {
      key: "code",
      entityField: "employeeCode",
      header: "Code",
      sortable: true,
      sortAccessor: (employee) => employee.employeeCode,
      cellClassName: "text-foreground",
      render: (employee) => employee.employeeCode || "-",
    },
    {
      key: "status",
      entityField: "employmentStatus",
      header: "Status",
      sortable: true,
      sortAccessor: (employee) => employee.employmentStatus,
      render: (employee) => (
        <EmployeeStatusBadge status={employee.employmentStatus} />
      ),
    },
    {
      key: "reportingManager",
      entityField: "managerEmployeeId",
      header: "Reporting Manager",
      sortable: true,
      sortAccessor: (employee) =>
        employee.reportingManager
          ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`
          : "",
      cellClassName: "text-muted",
      render: (employee) =>
        employee.reportingManager
          ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`
          : "No reporting manager assigned",
    },
    {
      key: "hireDate",
      entityField: "hireDate",
      header: "Hire Date",
      sortable: true,
      sortAccessor: (employee) =>
        employee.hireDate ? new Date(employee.hireDate).getTime() : 0,
      cellClassName: "text-muted",
      render: (employee) =>
        employee.hireDate
          ? formatDateWithTenantSettings(employee.hireDate, formatting)
          : "-",
    },
    {
      key: "contact",
      entityField: "email",
      header: "Contact",
      sortable: true,
      sortAccessor: (employee) => employee.workEmail || employee.phone || "",
      cellClassName: "text-muted",
      render: (employee) => (
        <div>
          <p>{employee.phone || "-"}</p>
          <p>{employee.workEmail || "No work email"}</p>
        </div>
      ),
    },
  ];

  const visibleColumns = visibleColumnKeys?.length
    ? columns.filter((column) =>
        getEmployeeCustomizationColumnKeys(column.key).some((columnKey) =>
          visibleColumnKeys.includes(columnKey),
        ),
      )
    : columns;

  return (
    <DataTable
      mode={useEntityDataApi ? "server" : "client"}
      entityLogicalName={useEntityDataApi ? "employees" : undefined}
      rows={employees}
      columns={visibleColumns.length ? visibleColumns : columns}
      getRowKey={(employee) => employee.id}
      initialSort={{
        columnKey: initialSortColumnKey,
        direction: initialSortDirection,
      }}
      pagination={{
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: pagination.totalItems,
      }}
      footer={<DataTablePagination {...pagination} />}
    />
  );
}

function getEmployeeCustomizationColumnKeys(tableColumnKey: string) {
  const map: Record<string, string[]> = {
    employee: ["firstName", "lastName", "preferredName", "email", "phone"],
    code: ["employeeCode"],
    status: ["employmentStatus"],
    reportingManager: ["managerEmployeeId"],
    hireDate: ["hireDate"],
    contact: ["email", "phone", "personalEmail"],
  };

  return map[tableColumnKey] ?? [tableColumnKey];
}
