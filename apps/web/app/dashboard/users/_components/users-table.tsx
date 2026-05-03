"use client";

import Link from "next/link";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTablePagination } from "@/app/components/data-table/data-table-pagination";
import { DataTableColumn } from "@/app/components/data-table/types";
import { formatDateWithTenantSettings } from "@/lib/date-format";
import { UserListItem } from "../types";

type UsersTableProps = {
  users: UserListItem[];
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

export function UsersTable({
  users,
  formatting,
  pagination,
  visibleColumnKeys,
  initialSortColumnKey = "user",
  initialSortDirection = "asc",
  useEntityDataApi = false,
}: UsersTableProps) {
  const columns: DataTableColumn<UserListItem>[] = [
    {
      key: "user",
      entityField: "firstName",
      header: "User",
      sortable: true,
      sortAccessor: (user) => user.fullName,
      render: (user) => {
        const userRecordId = getUserRecordId(user);

        return (
          <div>
            <Link
              className="font-semibold text-foreground transition hover:text-accent"
              href={`/dashboard/users/${userRecordId}`}
            >
              {user.fullName ||
                [user.firstName, user.lastName].filter(Boolean).join(" ")}
            </Link>

            <p className="mt-1 text-muted">{user.email}</p>

            {user.isServiceAccount ? (
              <p className="mt-1">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  Service Account
                </span>
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "email",
      entityField: "email",
      header: "Email",
      sortable: true,
      sortAccessor: (user) => user.email,
      cellClassName: "text-muted",
      render: (user) => user.email || "-",
    },
    {
      key: "status",
      entityField: "status",
      header: "Status",
      sortable: true,
      sortAccessor: (user) => user.status,
      render: (user) => <UserStatusBadge status={user.status} />,
    },
    {
      key: "businessUnit",
      entityField: "businessUnitId",
      header: "Business Unit",
      sortable: true,
      sortAccessor: (user) =>
        user.businessUnit?.name || user.businessUnitId,
      cellClassName: "text-muted",
      render: (user) =>
        user.businessUnit?.name ||
        user.businessUnit?.code ||
        user.businessUnitId ||
        "-",
    },
    {
      key: "roles",
      header: "Roles",
      sortable: false,
      cellClassName: "text-muted",
      render: (user) => {
        const roles = user.userRoles
          ?.map((userRole) => userRole.role?.name)
          .filter(Boolean);

        if (!roles?.length) {
          return "No roles assigned";
        }

        return (
          <div className="flex flex-wrap gap-1">
            {roles.slice(0, 2).map((role) => (
              <span
                key={role}
                className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground"
              >
                {role}
              </span>
            ))}

            {roles.length > 2 ? (
              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                +{roles.length - 2}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "employee",
      header: "Linked Employee",
      sortable: false,
      cellClassName: "text-muted",
      render: (user) =>
        user.employee ? (
          <Link
            className="font-medium text-foreground transition hover:text-accent"
            href={`/dashboard/employees/${user.employee.id}`}
          >
            {user.employee.fullName || user.employee.employeeCode}
          </Link>
        ) : (
          "Not linked"
        ),
    },
    {
      key: "lastLoginAt",
      entityField: "lastLoginAt",
      header: "Last Login",
      sortable: true,
      sortAccessor: (user) =>
        user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0,
      cellClassName: "text-muted",
      render: (user) =>
        user.lastLoginAt
          ? formatDateWithTenantSettings(user.lastLoginAt, formatting)
          : "Never",
    },
    {
      key: "createdAt",
      entityField: "createdAt",
      header: "Created",
      sortable: true,
      sortAccessor: (user) =>
        user.createdAt ? new Date(user.createdAt).getTime() : 0,
      cellClassName: "text-muted",
      render: (user) =>
        user.createdAt
          ? formatDateWithTenantSettings(user.createdAt, formatting)
          : "-",
    },
  ];

  const visibleColumns = visibleColumnKeys?.length
    ? columns.filter((column) =>
        getUserCustomizationColumnKeys(column.key).some((columnKey) =>
          visibleColumnKeys.includes(columnKey),
        ),
      )
    : columns;

  return (
    <DataTable
      mode={useEntityDataApi ? "server" : "client"}
      entityLogicalName={useEntityDataApi ? "users" : undefined}
      rows={users}
      columns={visibleColumns.length ? visibleColumns : columns}
getRowKey={(user) => getUserRecordId(user) || user.email}
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

function getUserRecordId(user: UserListItem) {
  return user.id || user.userId || user.email || "";
}

function UserStatusBadge({ status }: { status: UserListItem["status"] }) {
  const normalizedStatus = String(status).toUpperCase();

  const className =
    normalizedStatus === "ACTIVE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalizedStatus === "SUSPENDED"
      ? "border-red-200 bg-red-50 text-red-700"
      : normalizedStatus === "INVITED"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {formatStatusLabel(normalizedStatus)}
    </span>
  );
}

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getUserCustomizationColumnKeys(tableColumnKey: string) {
  const map: Record<string, string[]> = {
    user: ["firstName", "lastName", "email", "isServiceAccount"],
    email: ["email"],
    status: ["status"],
    businessUnit: ["businessUnitId"],
    roles: ["userRoles"],
    employee: ["employee"],
    lastLoginAt: ["lastLoginAt"],
    createdAt: ["createdAt"],
  };

  return map[tableColumnKey] ?? [tableColumnKey];
}