"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

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
  renderExpandedRow?: (row: T, index: number) => ReactNode;
  pagination?: {
    page: number;
    pageSize: number;
    totalRecords: number;
    onPageChange?: (page: number) => void;
  };
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
  renderExpandedRow,
  pagination,
}: DataTableProps<T>) {
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);
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
  const canExpand = Boolean(renderExpandedRow);

  function toggleExpanded(id: string) {
    setExpandedRowIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

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
            {canExpand ? (
              <th
                className={clsx(
                  checkboxCellPaddingClass,
                  stickyHeader ? "bg-slate-50" : "",
                )}
              />
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

        <tbody
          className={clsx("divide-y divide-slate-100 bg-white", bodyClassName)}
        >
          {loading ? (
            Array.from({ length: loadingRowCount }).map((_, rowIndex) => (
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
          ) : rows.length === 0 ? (
            <tr>
              <td
                className="px-6 py-12 text-center"
                colSpan={
                  visibleColumns.length +
                  (selectable ? 1 : 0) +
                  (canExpand ? 1 : 0)
                }
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
          ) : (
            rows.map((row, index) => {
              const id = rowKey(row, index);
              const isSelected = selectedRowIds.includes(id);
              const clickable = Boolean(onRowClick);

              return (
                <Fragment key={id}>
                  <tr
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

                    {canExpand ? (
                      <td
                        className={clsx(checkboxCellPaddingClass, "align-top")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          aria-expanded={expandedRowIds.includes(id)}
                          aria-label={
                            expandedRowIds.includes(id)
                              ? `Collapse row ${index + 1}`
                              : `Expand row ${index + 1}`
                          }
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950/15"
                          onClick={() => toggleExpanded(id)}
                          type="button"
                        >
                          <ChevronDown
                            className={clsx(
                              "h-4 w-4 transition",
                              expandedRowIds.includes(id) ? "rotate-180" : "",
                            )}
                          />
                        </button>
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
                  {canExpand && expandedRowIds.includes(id) ? (
                    <tr className="bg-slate-50">
                      <td
                        className="px-6 py-4"
                        colSpan={
                          visibleColumns.length +
                          (selectable ? 1 : 0) +
                          (canExpand ? 1 : 0)
                        }
                      >
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          {renderExpandedRow?.(row, index)}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>

      {footer ? (
        <div className="border-t border-slate-200 bg-white px-6 py-4">
          {footer}
        </div>
      ) : pagination ? (
        <DataTablePaginationFooter pagination={pagination} />
      ) : null}
    </div>
  );
}

function DataTablePaginationFooter({
  pagination,
}: {
  pagination: NonNullable<DataTableProps<unknown>["pagination"]>;
}) {
  const pageSize = Math.max(1, pagination.pageSize);
  const totalPages = Math.max(1, Math.ceil(pagination.totalRecords / pageSize));
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  const start = pagination.totalRecords === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, pagination.totalRecords);

  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-6 py-4 text-sm text-slate-600">
      <span>
        Showing {start}-{end} of {pagination.totalRecords}
      </span>
      <div className="flex items-center gap-2">
        <button
          className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => pagination.onPageChange?.(page - 1)}
          type="button"
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => pagination.onPageChange?.(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
