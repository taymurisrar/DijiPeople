"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";

type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  width?: string | number;
  minWidth?: string | number;
  align?: "left" | "center" | "right";
  hidden?: boolean;
  sticky?: "left" | "right";
};

type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T, index: number) => string;

  selectable?: boolean;
  selectedRowIds?: string[];
  onToggleRow?: (id: string, row: T) => void;
  onToggleAll?: (checked: boolean) => void;

  loading?: boolean;
  loadingRowCount?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyState?: ReactNode;

  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T, index: number) => string | undefined;

  stickyHeader?: boolean;
  maxHeight?: string | number;
  compact?: boolean;
  zebra?: boolean;
  hoverable?: boolean;

  tableClassName?: string;
  wrapperClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  rowClassName?: string;

  footer?: ReactNode;
};

function getAlignmentClasses(align: DataTableColumn<unknown>["align"]) {
  switch (align) {
    case "center":
      return "text-center";
    case "right":
      return "text-right";
    case "left":
    default:
      return "text-left";
  }
}

function getStickyClasses(sticky?: "left" | "right") {
  if (sticky === "left") {
    return "sticky left-0 z-10 bg-inherit";
  }

  if (sticky === "right") {
    return "sticky right-0 z-10 bg-inherit";
  }

  return "";
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selectable = false,
  selectedRowIds = [],
  onToggleRow,
  onToggleAll,
  loading = false,
  loadingRowCount = 6,
  emptyTitle = "No records found",
  emptyDescription = "There is nothing to display right now.",
  emptyState,
  onRowClick,
  getRowClassName,
  stickyHeader = false,
  maxHeight,
  compact = false,
  zebra = false,
  hoverable = true,
  tableClassName,
  wrapperClassName,
  headerClassName,
  bodyClassName,
  rowClassName,
  footer,
}: DataTableProps<T>) {
  const visibleColumns = useMemo(
    () => columns.filter((column) => !column.hidden),
    [columns],
  );

  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;
  const someSelected =
    selectedRowIds.length > 0 && selectedRowIds.length < rows.length;

  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const cellPaddingClass = compact ? "px-4 py-3" : "px-6 py-4";
  const checkboxCellPaddingClass = compact ? "px-3 py-3" : "px-4 py-4";

  return (
    <div
      className={clsx(
        "overflow-x-auto",
        maxHeight ? "overflow-y-auto" : "",
        wrapperClassName,
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table
        className={clsx(
          "min-w-full divide-y divide-slate-200 text-sm",
          tableClassName,
        )}
      >
        <thead
          className={clsx(
            "bg-slate-50 text-slate-500",
            stickyHeader ? "sticky top-0 z-20" : "",
            headerClassName,
          )}
        >
          <tr>
            {selectable ? (
              <th
                className={clsx(
                  checkboxCellPaddingClass,
                  "align-middle",
                  stickyHeader ? "bg-slate-50" : "",
                )}
              >
                <input
                  ref={headerCheckboxRef}
                  checked={allSelected}
                  onChange={(event) => onToggleAll?.(event.target.checked)}
                  type="checkbox"
                  aria-label="Select all rows"
                />
              </th>
            ) : null}

            {visibleColumns.map((column) => (
              <th
                key={column.key}
                className={clsx(
                  cellPaddingClass,
                  "font-medium align-middle",
                  getAlignmentClasses(column.align),
                  getStickyClasses(column.sticky),
                  stickyHeader ? "bg-slate-50" : "",
                  column.headerClassName,
                )}
                style={{
                  width: column.width,
                  minWidth: column.minWidth,
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className={clsx("divide-y divide-slate-100 bg-white", bodyClassName)}>
          {loading
            ? Array.from({ length: loadingRowCount }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="animate-pulse">
                  {selectable ? (
                    <td className={checkboxCellPaddingClass}>
                      <div className="h-4 w-4 rounded bg-slate-200" />
                    </td>
                  ) : null}

                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={clsx(
                        cellPaddingClass,
                        "align-top",
                        getAlignmentClasses(column.align),
                        getStickyClasses(column.sticky),
                        column.cellClassName,
                      )}
                      style={{
                        width: column.width,
                        minWidth: column.minWidth,
                      }}
                    >
                      <div className="h-4 w-3/4 rounded bg-slate-200" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.length === 0
              ? (
                <tr>
                  <td
                    className="px-6 py-12 text-center"
                    colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  >
                    {emptyState ?? (
                      <div className="mx-auto max-w-md">
                        <div className="text-base font-semibold text-slate-900">
                          {emptyTitle}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {emptyDescription}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )
              : rows.map((row, index) => {
                  const id = rowKey(row, index);
                  const isSelected = selectedRowIds.includes(id);
                  const clickable = Boolean(onRowClick);

                  return (
                    <tr
                      key={id}
                      className={clsx(
                        rowClassName,
                        zebra && index % 2 === 1 ? "bg-slate-50/40" : "bg-white",
                        hoverable ? "hover:bg-slate-50" : "",
                        isSelected ? "bg-blue-50/50" : "",
                        clickable ? "cursor-pointer" : "",
                        getRowClassName?.(row, index),
                      )}
                      onClick={clickable ? () => onRowClick?.(row) : undefined}
                    >
                      {selectable ? (
                        <td
                          className={clsx(
                            checkboxCellPaddingClass,
                            "align-top",
                            onRowClick ? "cursor-default" : "",
                          )}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            checked={isSelected}
                            onChange={() => onToggleRow?.(id, row)}
                            type="checkbox"
                            aria-label={`Select row ${index + 1}`}
                          />
                        </td>
                      ) : null}

                      {visibleColumns.map((column) => (
                        <td
                          key={column.key}
                          className={clsx(
                            cellPaddingClass,
                            "align-top",
                            getAlignmentClasses(column.align),
                            getStickyClasses(column.sticky),
                            column.cellClassName,
                          )}
                          style={{
                            width: column.width,
                            minWidth: column.minWidth,
                          }}
                        >
                          {column.render(row, index)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
        </tbody>
      </table>

      {footer ? (
        <div className="border-t border-slate-200 bg-white px-6 py-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}