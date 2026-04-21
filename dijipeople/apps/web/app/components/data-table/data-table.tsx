"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";
import { DataTableColumn, DataTableSortState } from "./types";
import { sortRows } from "./utils";

type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  emptyState?: ReactNode;
  initialSort?: DataTableSortState | null;
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
  className,
  tableClassName,
  bodyClassName = "divide-y divide-border bg-white/90",
  rowClassName = "hover:bg-accent-soft/30",
  footer,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<DataTableSortState | null>(initialSort);

  const sortedRows = useMemo(
    () => sortRows(rows, columns, sort),
    [rows, columns, sort],
  );

  function handleSort(column: DataTableColumn<T>) {
    if (!column.sortable) {
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
      return <ArrowUpDown className="h-4 w-4" />;
    }

    return sort.direction === "asc" ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
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
            {sortedRows.map((row) => (
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
            ))}
          </tbody>
        </table>
      </div>

      {footer ? (
        <div className="border-t border-border bg-surface-strong px-5 py-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}