"use client";

import { useMemo } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { AccessPermissionRecord } from "../types";

type PermissionRow = AccessPermissionRecord & {
  category: string;
  module: string;
  operation: string;
  scope: string;
  source: string;
  status: string;
};

export function PermissionsCatalog({
  permissions,
}: {
  permissions: AccessPermissionRecord[];
}) {
  const rows = useMemo(
    () =>
      permissions
        .map(toPermissionRow)
        .sort((left, right) => left.key.localeCompare(right.key)),
    [permissions],
  );

  const columns = useMemo<DataTableColumn<PermissionRow>[]>(
    () => [
      {
        key: "name",
        header: "Permission",
        sortable: true,
        searchable: true,
        render: (row) => (
          <div className="min-w-[220px]">
            <p className="font-semibold text-foreground">{row.name}</p>
            <p className="mt-1 text-xs text-muted">{row.key}</p>
          </div>
        ),
        sortAccessor: (row) => row.name,
        searchAccessor: (row) => `${row.name} ${row.key} ${row.description}`,
      },
      {
        key: "module",
        header: "Module",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: options(rows.map((row) => row.module)),
        render: (row) => row.module,
      },
      {
        key: "operation",
        header: "Type",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: options(rows.map((row) => row.operation)),
        render: (row) => row.operation,
      },
      {
        key: "scope",
        header: "Scope",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: options(rows.map((row) => row.scope)),
        render: (row) => row.scope,
      },
      {
        key: "source",
        header: "Source",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: options(rows.map((row) => row.source)),
        render: (row) => badge(row.source),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: options(rows.map((row) => row.status)),
        render: (row) => badge(row.status),
      },
      {
        key: "description",
        header: "Description",
        searchable: true,
        render: (row) => (
          <p className="max-w-xl text-sm text-muted">{row.description}</p>
        ),
      },
    ],
    [rows],
  );

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Permissions" value={rows.length} />
        <SummaryCard label="Modules" value={new Set(rows.map((row) => row.module)).size} />
        <SummaryCard label="Operations" value={new Set(rows.map((row) => row.operation)).size} />
        <SummaryCard label="Sources" value={new Set(rows.map((row) => row.source)).size} />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.id}
        pagination={{ page: 1, pageSize: 25 }}
        searchPlaceholder="Search permission code, label, module, or description"
        emptyState={
          <div className="p-8 text-center text-sm text-muted">
            No permissions found.
          </div>
        }
      />
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </article>
  );
}

function toPermissionRow(permission: AccessPermissionRecord): PermissionRow {
  const parts = permission.key.split(".").filter(Boolean);
  const moduleKey = parts[0] ?? "general";
  const operationKey = parts.at(-1) ?? "read";

  return {
    ...permission,
    category: startCase(moduleKey),
    module: startCase(moduleKey),
    operation: startCase(operationKey),
    scope: resolveScope(permission.key),
    source: permission.key.startsWith("custom.") ? "Custom" : "System",
    status: "Active",
  };
}

function resolveScope(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.includes("own") || normalized.includes(".self")) return "Self";
  if (normalized.includes("team")) return "Team";
  if (normalized.includes(".all") || normalized.includes("readall")) return "All";
  return "Tenant";
}

function options(values: readonly string[]) {
  return Array.from(new Set(values))
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ label: value, value }));
}

function badge(value: string) {
  return (
    <span className="inline-flex rounded-full border border-border bg-white px-2.5 py-1 text-xs font-semibold text-muted">
      {value}
    </span>
  );
}

function startCase(value: string) {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
