"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export type ProDataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  width?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  align?: "left" | "center" | "right";
  hidden?: boolean;
  sticky?: "left" | "right";
  sortable?: boolean;
  sortField?: string;
};

export type ProDataTableProps<T> = {
  rows: T[];
  columns: ProDataTableColumn<T>[];
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
    pageSizeOptions?: number[];
    onPageSizeChange?: (pageSize: number) => void;
  };
  stickyPagination?: boolean;
  sort?: { field: string; direction: "asc" | "desc" } | null;
  onSortChange?: (sort: { field: string; direction: "asc" | "desc" }) => void;
  sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
  onSortsChange?: (
    sorts: Array<{ field: string; direction: "asc" | "desc" }>,
  ) => void;
  onColumnResize?: (columnKey: string, width: number) => void;
};

function getAlignmentClasses(align: ProDataTableColumn<unknown>["align"]) {
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

export function ProDataTable<T>({
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
  stickyPagination = false,
  sort,
  onSortChange,
  sorts,
  onSortsChange,
  onColumnResize,
}: ProDataTableProps<T>) {
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

  function changeSort(
    field: string,
    additive: boolean,
  ) {
    if (onSortsChange) {
      const current = sorts ?? [];
      const existing = current.find((item) => item.field === field);
      const next = {
        field,
        direction: existing?.direction === "asc" ? "desc" : "asc",
      } as const;
      onSortsChange(
        additive
          ? [...current.filter((item) => item.field !== field), next]
          : [next],
      );
      return;
    }
    onSortChange?.({
      field,
      direction:
        sort?.field === field && sort.direction === "asc" ? "desc" : "asc",
    });
  }

  function beginResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    column: ProDataTableColumn<T>,
  ) {
    if (!onColumnResize) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const header = event.currentTarget.parentElement;
    const startWidth = header?.getBoundingClientRect().width ?? 160;
    const minimum = Number(column.minWidth) || 80;
    const maximum = Number(column.maxWidth) || 720;
    const move = (pointer: PointerEvent) =>
      onColumnResize(
        column.key,
        Math.min(maximum, Math.max(minimum, startWidth + pointer.clientX - startX)),
      );
    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
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
        <colgroup>
          {selectable ? <col className="w-12" /> : null}
          {canExpand ? <col className="w-12" /> : null}
          {visibleColumns.map((column) => (
            <col
              key={column.key}
              style={{
                width: column.width,
                minWidth: column.minWidth,
                maxWidth: column.maxWidth,
              }}
            />
          ))}
        </colgroup>
        <thead
          className={clsx(
            "bg-slate-50 text-slate-500",
            /*
             * Only has to beat the rows beneath it. It used to sit at z-20,
             * which also put it above the application shell — see the pagination
             * bar below for what that cost.
             */
            stickyHeader ? "sticky top-0 z-10" : "",
            headerClassName,
          )}
        >
          <tr>
            {selectable ? (
              <th
                className={clsx(
                  checkboxCellPaddingClass,
                  "w-12 align-middle",
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
                  "relative font-medium align-middle",
                  getAlignmentClasses(column.align),
                  getStickyClasses(column.sticky),
                  stickyHeader ? "bg-slate-50" : "",
                  column.headerClassName,
                )}
                style={{
                  width: column.width,
                  minWidth: column.minWidth,
                  maxWidth: column.maxWidth,
                }}
              >
                {column.sortable && (onSortChange || onSortsChange) ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md text-left hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]/20"
                    onClick={(event) =>
                      changeSort(column.sortField ?? column.key, event.shiftKey)
                    }
                    title="Sort column. Hold Shift to add another sort."
                  >
                    {column.header}
                    {(sorts?.find(
                      (item) => item.field === (column.sortField ?? column.key),
                    ) ??
                      (sort?.field === (column.sortField ?? column.key)
                        ? sort
                        : undefined)) ? (
                      (sorts?.find(
                        (item) => item.field === (column.sortField ?? column.key),
                      ) ?? sort)
                        ?.direction === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                    )}
                    {sorts && sorts.length > 1 ? (
                      <span className="text-[9px] text-slate-400">
                        {sorts.findIndex(
                          (item) => item.field === (column.sortField ?? column.key),
                        ) + 1 || ""}
                      </span>
                    ) : null}
                  </button>
                ) : (
                  column.header
                )}
                {onColumnResize ? (
                  <button
                    type="button"
                    aria-label={`Resize ${String(column.header)} column`}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none border-r border-transparent hover:border-[var(--admin-primary)] focus:border-[var(--admin-primary)] focus:outline-none"
                    onPointerDown={(event) => beginResize(event, column)}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault();
                      const current = Number(column.width) || 160;
                      onColumnResize(
                        column.key,
                        Math.max(80, current + (event.key === "ArrowRight" ? 16 : -16)),
                      );
                    }}
                  />
                ) : null}
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
                      maxWidth: column.maxWidth,
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
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick?.(row);
                            }
                          }
                        : undefined
                    }
                  >
                    {selectable ? (
                      <td
                        className={clsx(
                          checkboxCellPaddingClass,
                          "w-12 align-top",
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
                          maxWidth: column.maxWidth,
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
        <DataTablePaginationFooter
          pagination={pagination}
          sticky={stickyPagination}
        />
      ) : null}
    </div>
  );
}

function DataTablePaginationFooter({
  pagination,
  sticky,
}: {
  pagination: NonNullable<ProDataTableProps<unknown>["pagination"]>;
  sticky: boolean;
}) {
  const pageSize = Math.max(1, pagination.pageSize);
  const totalPages = Math.max(1, Math.ceil(pagination.totalRecords / pageSize));
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  const start = pagination.totalRecords === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, pagination.totalRecords);

  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600",
        /*
         * z-10, not z-30. At z-30 this bar out-stacked the application shell and
         * painted over an open profile menu — a table paginator drawn on top of
         * the navigation. It only ever needs to sit above the rows it scrolls
         * over.
         */
        sticky &&
          "sticky bottom-0 z-10 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]",
      )}
    >
      <span>
        Showing {start}-{end} of {pagination.totalRecords}
      </span>
      {pagination.onPageSizeChange ? (
        <label className="flex items-center gap-2 text-xs font-medium">
          Rows
          <select
            aria-label="Rows per page"
            value={pagination.pageSize}
            onChange={(event) =>
              pagination.onPageSizeChange?.(Number(event.target.value))
            }
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
          >
            {(pagination.pageSizeOptions ?? [10, 25, 50, 100]).map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div
        className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        role="group"
        aria-label="Pagination"
      >
        <button
          className="rounded-lg p-2 hover:bg-slate-50 disabled:opacity-30"
          disabled={page <= 1}
          onClick={() => pagination.onPageChange?.(1)}
          type="button"
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          className="rounded-lg p-2 hover:bg-slate-50 disabled:opacity-30"
          disabled={page <= 1}
          onClick={() => pagination.onPageChange?.(page - 1)}
          type="button"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-24 px-3 text-center text-xs font-semibold text-slate-700">
          Page {page} of {totalPages}
        </span>
        <button
          className="rounded-lg p-2 hover:bg-slate-50 disabled:opacity-30"
          disabled={page >= totalPages}
          onClick={() => pagination.onPageChange?.(page + 1)}
          type="button"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          className="rounded-lg p-2 hover:bg-slate-50 disabled:opacity-30"
          disabled={page >= totalPages}
          onClick={() => pagination.onPageChange?.(totalPages)}
          type="button"
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
