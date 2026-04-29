"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FilterX,
  Search,
} from "lucide-react";
import { ReactNode, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DataTableFilterMenu } from "./data-table-filter-menu";
import {
  DataTableColumn,
  DataTableFilterState,
  DataTableSortState,
} from "./types";
import { filterRows, searchRows, sortRows } from "./utils";

type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  mode?: "client" | "server";
  entityLogicalName?: string;
  pagination?: {
    page: number;
    pageSize: number;
    total?: number;
    totalItems?: number;
    totalPages?: number;
  };
  emptyState?: ReactNode;
  initialSort?: DataTableSortState | null;
  initialFilters?: DataTableFilterState[];
  enableSearch?: boolean;
  searchPlaceholder?: string;
  className?: string;
  tableClassName?: string;
  bodyClassName?: string;
  rowClassName?: string;
  footer?: ReactNode;
};

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  emptyState,
  initialSort = null,
  initialFilters = [],
  enableSearch = true,
  searchPlaceholder = "Search records",
  className,
  tableClassName,
  bodyClassName = "divide-y divide-border bg-white/90",
  rowClassName = "hover:bg-accent-soft/30",
  footer,
  mode = "client",
  entityLogicalName,
  pagination,
}: DataTableProps<T>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sort, setSort] = useState<DataTableSortState | null>(initialSort);
  const [filters, setFilters] =
    useState<DataTableFilterState[]>(initialFilters);
  const [search, setSearch] = useState("");

  const processedRows = useMemo(() => {
    const searchedRows = searchRows(rows, columns, search);

    if (mode === "server") {
      return searchedRows;
    }

    const filteredRows = filterRows(searchedRows, columns, filters);

    return sortRows(filteredRows, columns, sort);
  }, [rows, columns, search, filters, sort, mode]);

  const hasActiveSearchOrFilters =
    search.trim().length > 0 || (mode === "client" && filters.length > 0);
  const totalRecords =
    pagination?.total ?? pagination?.totalItems ?? rows.length;

  function handleSort(column: DataTableColumn<T>) {
    if (!column.sortable) {
      return;
    }

    if (mode === "server") {
      const entityField = column.entityField ?? column.key;
      const nextDirection =
        sort?.columnKey === column.key && sort.direction === "asc"
          ? "desc"
          : "asc";
      const params = new URLSearchParams(searchParams.toString());

      params.set("orderBy", `${entityField} ${nextDirection}`);
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
      setSort({ columnKey: column.key, direction: nextDirection });
      return;
    }

    setSort((current) => {
      if (!current || current.columnKey !== column.key) {
        return { columnKey: column.key, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { columnKey: column.key, direction: "desc" };
      }

      return null;
    });
  }

  function renderSortIcon(column: DataTableColumn<T>) {
    if (!column.sortable) {
      return null;
    }

    if (sort?.columnKey !== column.key) {
      return <ArrowUpDown className="h-4 w-4 text-muted" />;
    }

    return sort.direction === "asc" ? (
      <ArrowUp className="h-4 w-4 text-foreground" />
    ) : (
      <ArrowDown className="h-4 w-4 text-foreground" />
    );
  }

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      className={
        className ??
        "overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm"
      }
    >
      <div className="flex flex-col gap-3 border-b border-border bg-surface-strong px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Records</p>
          <p className="text-xs text-muted">
            Showing {processedRows.length} of {totalRecords}
            {entityLogicalName ? ` ${entityLogicalName}` : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {enableSearch ? (
            <div className="flex min-w-[260px] items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 shadow-sm focus-within:border-foreground">
              <Search className="h-4 w-4 text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  mode === "server"
                    ? "Quick filter current page"
                    : searchPlaceholder
                }
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          ) : null}

          {mode === "client" ? (
            <DataTableFilterMenu
              columns={columns}
              filters={filters}
              onFiltersChange={setFilters}
            />
          ) : null}

          {hasActiveSearchOrFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilters([]);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-muted shadow-sm transition hover:bg-surface-strong hover:text-foreground"
            >
              <FilterX className="h-4 w-4" />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table
          className={
            tableClassName ?? "min-w-full divide-y divide-border text-sm"
          }
        >
          <thead className="bg-surface-strong text-left text-muted">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-5 py-4 font-medium ${column.headerClassName ?? ""}`}
                >
                  {column.sortable ? (
                    <button
                      className="inline-flex items-center gap-2 text-left transition hover:text-foreground"
                      onClick={() => handleSort(column)}
                      type="button"
                    >
                      <span>{column.header}</span>
                      {renderSortIcon(column)}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className={bodyClassName}>
            {processedRows.length > 0 ? (
              processedRows.map((row) => (
                <tr key={getRowKey(row)} className={rowClassName}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-5 py-4 align-top ${column.cellClassName ?? column.className ?? ""}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-10 text-center text-sm text-muted"
                >
                  No records match the selected search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {footer ? (
        <div className="border-t border-border bg-surface-strong px-5 py-4">
          {footer}
        </div>
      ) : pagination ? (
        <div className="border-t border-border bg-surface-strong px-5 py-4 text-sm text-muted">
          Page {pagination.page} of{" "}
          {pagination.totalPages ??
            Math.max(1, Math.ceil(totalRecords / Math.max(1, pagination.pageSize)))}
        </div>
      ) : null}
    </div>
  );
}
