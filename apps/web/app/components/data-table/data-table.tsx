"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Filter,
  FilterX,
  Search,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptionalSystemPreferences } from "@/app/(authenticated)/_components/resolved-settings-provider";
import {
  DataTableColumn,
  DataTableFilterOperator,
  DataTableFilterState,
  DataTableSortState,
  DataTableProps,
} from "./types";

import { filterRows, searchRows, sortRows } from "./utils";

const EMPTY_FILTERS: DataTableFilterState[] = [];

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  emptyState,
  initialSort = null,
  initialFilters = EMPTY_FILTERS,
  enableSearch = true,
  searchPlaceholder = "Search records",
  className,
  tableClassName,
  bodyClassName = "divide-y divide-border bg-white/90",
  rowClassName = "hover:bg-accent-soft/30",
  footer,
  mode = "client",
  entityLogicalName,
  pagination = {
    page: 1,
    pageSize: 10,
    pageSizeOptions: [10, 25, 50, 100],
  },

  enableSelection = false,
  selectedRowKeys = [],
  onSelectedRowKeysChange,
  onRowClick,
}: DataTableProps<T>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferences = useOptionalSystemPreferences();
  const stickyStateKey = `dijipeople:data-table:${entityLogicalName ?? pathname}`;
  const restoredStickyState = useRef(false);

  /*
   * In server mode the URL is the source of truth for ordering. Without this
   * the state resets to the view's default after every navigation, so each
   * header click recomputed the same direction and the toggle never returned.
   */
  const urlSort = useMemo<DataTableSortState | null>(() => {
    if (mode !== "server") return null;

    const raw = searchParams.get("orderBy")?.trim();
    if (!raw) return null;

    const [field, direction] = raw.split(/\s+/);
    const matched = columns.find(
      (column) => (column.entityField ?? column.key) === field,
    );

    if (!matched) return null;

    return {
      columnKey: matched.key,
      direction: direction === "desc" ? "desc" : "asc",
    };
  }, [mode, searchParams, columns]);

  const effectiveInitialSort = urlSort ?? initialSort;

  const [sort, setSort] = useState<DataTableSortState | null>(
    effectiveInitialSort,
  );
  const [filters, setFilters] =
    useState<DataTableFilterState[]>(initialFilters);
  const [search, setSearch] = useState("");
  const [clientPage, setClientPage] = useState(pagination?.page ?? 1);
  const [clientPageSize, setClientPageSize] = useState(
    pagination?.pageSize ?? 10,
  );
  /* Widths a user has dragged, keyed by column. Untouched columns stay auto. */
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = useState(false);

  function resizeColumn(columnKey: string, startX: number, startWidth: number) {
    const MIN_WIDTH = 80;

    const onMove = (event: PointerEvent) => {
      const next = Math.max(MIN_WIDTH, startWidth + event.clientX - startX);
      setColumnWidths((current) => ({ ...current, [columnKey]: next }));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setIsResizing(false);
    };

    // Selecting text while dragging makes the header flicker, so the table
    // suppresses selection for the duration of the drag.
    setIsResizing(true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /* DataTable synchronizes controlled inputs and persisted external state into its local interaction model. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSort(effectiveInitialSort);
  }, [effectiveInitialSort]);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  useEffect(() => {
    if (
      restoredStickyState.current ||
      !preferences?.enableStickyFilters ||
      mode === "server"
    ) {
      return;
    }

    restoredStickyState.current = true;
    try {
      const stored = window.localStorage.getItem(stickyStateKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        search?: string;
        sort?: DataTableSortState | null;
        filters?: DataTableFilterState[];
      };
      if (typeof parsed.search === "string") setSearch(parsed.search);
      if (parsed.sort) setSort(parsed.sort);
      if (Array.isArray(parsed.filters)) setFilters(parsed.filters);
    } catch {
      window.localStorage.removeItem(stickyStateKey);
    }
  }, [mode, preferences?.enableStickyFilters, stickyStateKey]);

  useEffect(() => {
    if (!preferences?.enableStickyFilters || mode === "server") {
      window.localStorage.removeItem(stickyStateKey);
      return;
    }

    window.localStorage.setItem(
      stickyStateKey,
      JSON.stringify({ search, sort, filters }),
    );
  }, [
    filters,
    mode,
    preferences?.enableStickyFilters,
    search,
    sort,
    stickyStateKey,
  ]);

  const processedRows = useMemo(() => {
    const searchedRows = searchRows(rows, columns, search);

    if (mode === "server") {
      return searchedRows;
    }

    const filteredRows = filterRows(searchedRows, columns, filters);

    return sortRows(filteredRows, columns, sort);
  }, [rows, columns, search, filters, sort, mode]);

  useEffect(() => {
    setClientPage(pagination?.page ?? 1);
    if (pagination?.pageSize) setClientPageSize(pagination.pageSize);
  }, [pagination?.page, pagination?.pageSize]);

  useEffect(() => {
    setClientPage(1);
  }, [search, filters, sort, clientPageSize]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const effectivePageSize =
    pagination && mode === "client"
      ? clientPageSize
      : (pagination?.pageSize ?? processedRows.length);
  const totalProcessedRows =
    mode === "server"
      ? (pagination?.total ?? pagination?.totalItems ?? rows.length)
      : processedRows.length;
  const totalPages =
    pagination?.totalPages ??
    Math.max(1, Math.ceil(totalProcessedRows / Math.max(1, effectivePageSize)));
  const currentPage =
    mode === "server"
      ? (pagination?.page ?? 1)
      : Math.min(clientPage, totalPages);
  const visibleRows = useMemo(() => {
    if (!pagination || mode === "server") return processedRows;
    const start = (currentPage - 1) * effectivePageSize;
    return processedRows.slice(start, start + effectivePageSize);
  }, [currentPage, effectivePageSize, mode, pagination, processedRows]);

  const processedRowKeys = useMemo(
    () => visibleRows.map((row) => getRowKey(row)),
    [visibleRows, getRowKey],
  );

  const selectedKeySet = useMemo(
    () => new Set(selectedRowKeys),
    [selectedRowKeys],
  );

  const selectedVisibleCount = processedRowKeys.filter((key) =>
    selectedKeySet.has(key),
  ).length;

  const allVisibleSelected =
    processedRowKeys.length > 0 &&
    selectedVisibleCount === processedRowKeys.length;

  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const hasActiveSearchOrFilters =
    search.trim().length > 0 || filters.length > 0;

  const totalRecords = totalProcessedRows;
  const rangeStart =
    totalRecords === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1;
  const rangeEnd =
    totalRecords === 0
      ? 0
      : Math.min(
          rangeStart + Math.max(visibleRows.length, 1) - 1,
          totalRecords,
        );
  const pageSizeOptions = normalizePageSizeOptions(
    pagination?.pageSizeOptions,
    effectivePageSize,
  );

  function toggleRowSelection(rowKey: string) {
    if (!onSelectedRowKeysChange) {
      return;
    }

    if (selectedKeySet.has(rowKey)) {
      onSelectedRowKeysChange(selectedRowKeys.filter((key) => key !== rowKey));
      return;
    }

    onSelectedRowKeysChange([...selectedRowKeys, rowKey]);
  }

  function toggleAllVisibleRows() {
    if (!onSelectedRowKeysChange) {
      return;
    }

    if (allVisibleSelected) {
      onSelectedRowKeysChange(
        selectedRowKeys.filter((key) => !processedRowKeys.includes(key)),
      );
      return;
    }

    onSelectedRowKeysChange(
      Array.from(new Set([...selectedRowKeys, ...processedRowKeys])),
    );
  }

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

  function getFilterParamKey(column: DataTableColumn<T>) {
    return column.filterParamKey ?? column.entityField ?? column.key;
  }

  function applyColumnFilter(
    column: DataTableColumn<T>,
    nextFilter: DataTableFilterState | null,
  ) {
    if (mode === "server") {
      const params = new URLSearchParams(searchParams.toString());
      const key = getFilterParamKey(column);

      params.delete(`${key}Filter`);
      params.delete(`${key}FilterOperator`);
      params.delete(`${key}FilterTo`);

      if (nextFilter) {
        params.set(`${key}Filter`, nextFilter.value);
        params.set(`${key}FilterOperator`, nextFilter.operator);

        if (nextFilter.valueTo) {
          params.set(`${key}FilterTo`, nextFilter.valueTo);
        }
      }

      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);

      setFilters((current) => [
        ...current.filter((filter) => filter.columnKey !== column.key),
        ...(nextFilter ? [nextFilter] : []),
      ]);

      return;
    }

    setFilters((current) => [
      ...current.filter((filter) => filter.columnKey !== column.key),
      ...(nextFilter ? [nextFilter] : []),
    ]);
  }

  function clearAllFilters() {
    setSearch("");

    if (mode === "server") {
      const params = new URLSearchParams(searchParams.toString());

      columns.forEach((column) => {
        const key = getFilterParamKey(column);
        params.delete(`${key}Filter`);
        params.delete(`${key}FilterOperator`);
        params.delete(`${key}FilterTo`);
      });

      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
      setFilters([]);
      return;
    }

    setFilters([]);
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
        `w-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm ${
          preferences?.uiDensity
            ? `data-table-density-${preferences.uiDensity.toLowerCase()}`
            : ""
        }`
      }
    >
      <div className="flex flex-col gap-2 border-b border-border bg-surface-strong px-3 py-2.5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Records</p>

          {!footer && !pagination ? (
            <p className="text-xs text-muted">
              Showing {rangeStart}-{rangeEnd} of {totalRecords}
              {entityLogicalName ? ` ${entityLogicalName}` : ""}
            </p>
          ) : null}

          {enableSelection && selectedRowKeys.length > 0 ? (
            <p className="mt-1 text-xs font-medium text-foreground">
              {selectedRowKeys.length} selected
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {enableSearch ? (
            <div className="flex min-w-[220px] items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5 shadow-sm focus-within:border-foreground">
              <Search className="h-4 w-4 text-muted" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  mode === "server"
                    ? "Quick filter current page"
                    : searchPlaceholder
                }
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
          ) : null}

          {hasActiveSearchOrFilters ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted shadow-sm transition hover:bg-surface-strong hover:text-foreground"
            >
              <FilterX className="h-4 w-4" />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={`w-full min-w-0 overflow-x-auto ${
          isResizing ? "select-none" : ""
        }`}
      >
        <table
          className={
            tableClassName ?? "min-w-full divide-y divide-border text-sm"
          }
        >
          <thead className="bg-surface-strong text-left text-muted">
            <tr>
              {enableSelection ? (
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = someVisibleSelected;
                      }
                    }}
                    onChange={toggleAllVisibleRows}
                    className="h-4 w-4 rounded border-border"
                    aria-label="Select all visible records"
                  />
                </th>
              ) : null}

              {columns.map((column) => {
                const activeFilter = filters.find(
                  (filter) => filter.columnKey === column.key,
                );

                return (
                  <th
                    key={column.key}
                    style={
                      columnWidths[column.key]
                        ? {
                            width: columnWidths[column.key],
                            minWidth: columnWidths[column.key],
                          }
                        : undefined
                    }
                    className={`relative px-3 py-2 text-xs font-medium ${
                      column.headerClassName ?? ""
                    }`}
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span className={activeFilter ? "text-foreground" : ""}>
                        {column.header}
                      </span>

                      {column.sortable ? (
                        <button
                          aria-label={`Sort ${column.header}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white hover:text-foreground"
                          onClick={() => handleSort(column)}
                          type="button"
                        >
                          {renderSortIcon(column)}
                        </button>
                      ) : null}

                      {column.filterable ? (
                        <ColumnFilterButton
                          column={column}
                          filter={activeFilter}
                          suggestionRows={rows}
                          onApply={(nextFilter) =>
                            applyColumnFilter(column, nextFilter)
                          }
                        />
                      ) : null}
                    </div>

                    {/* Drag to widen a column; double click restores auto width. */}
                    <span
                      aria-hidden="true"
                      onDoubleClick={() =>
                        setColumnWidths((current) => {
                          const next = { ...current };
                          delete next[column.key];
                          return next;
                        })
                      }
                      onPointerDown={(event) => {
                        event.preventDefault();
                        const cell = event.currentTarget
                          .parentElement as HTMLElement | null;
                        resizeColumn(
                          column.key,
                          event.clientX,
                          cell?.offsetWidth ?? 160,
                        );
                      }}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className={bodyClassName}>
            {visibleRows.length > 0 ? (
              visibleRows.map((row) => {
                const rowKey = getRowKey(row);
                const isSelected = selectedKeySet.has(rowKey);

                return (
                  <tr
                    key={rowKey}
                    className={`${rowClassName} ${onRowClick ? "cursor-pointer" : ""}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {enableSelection ? (
                      <td className="w-10 px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(rowKey)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 rounded border-border"
                          aria-label="Select record"
                        />
                      </td>
                    ) : null}

                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-2 align-top ${
                          column.cellClassName ?? column.className ?? ""
                        }`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={columns.length + (enableSelection ? 1 : 0)}
                  className="px-3 py-8 text-center text-sm text-muted"
                >
                  No records match the selected search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {footer ? (
        <div className="border-t border-border bg-surface-strong px-3 py-2.5">
          {footer}
        </div>
      ) : pagination ? (
        <div className="flex flex-col gap-3 border-t border-border bg-surface-strong px-3 py-2.5 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <span>
            Showing {rangeStart} to {rangeEnd} of {totalRecords} records
          </span>
          {mode === "client" ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted">
                Rows per page
                <select
                  className="h-8 rounded-lg border border-border bg-white px-2 text-xs text-foreground outline-none transition focus:border-accent"
                  onChange={(event) =>
                    setClientPageSize(
                      Math.max(
                        1,
                        Number(event.target.value) || effectivePageSize,
                      ),
                    )
                  }
                  value={effectivePageSize}
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage <= 1}
                onClick={() => setClientPage((page) => Math.max(1, page - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setClientPage((page) => Math.min(totalPages, page + 1))
                }
                type="button"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ColumnFilterButton<T>({
  column,
  filter,
  onApply,
  suggestionRows,
}: {
  column: DataTableColumn<T>;
  filter?: DataTableFilterState;
  onApply: (filter: DataTableFilterState | null) => void;
  suggestionRows?: readonly T[];
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });

  /*
   * Measured from the trigger when the menu opens, and nudged back inside the
   * viewport when the column sits near the right edge.
   */
  function measureMenuPosition() {
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (!anchor) return;

    const MENU_WIDTH = 288;
    const MARGIN = 8;
    const left = Math.min(
      Math.max(MARGIN, anchor.left),
      Math.max(MARGIN, window.innerWidth - MENU_WIDTH - MARGIN),
    );

    setMenuPosition({ top: anchor.bottom + 6, left });
  }

  const filterType = column.filterType ?? "text";

  /*
   * Values offered for an exact match. Declared options win when a column has
   * them; otherwise the values already loaded for that column are used, so a
   * free-text column still suggests real data instead of nothing.
   */
  const suggestionValues = useMemo(() => {
    if (column.filterOptions?.length) {
      return column.filterOptions.map((option) => option.value);
    }

    const accessor = column.filterAccessor ?? column.sortAccessor;
    const seen = new Set<string>();

    for (const row of suggestionRows ?? []) {
      const raw = accessor?.(row);
      const text = raw === null || raw === undefined ? "" : String(raw).trim();

      if (text) seen.add(text);
      if (seen.size >= 100) break;
    }

    return [...seen].sort((left, right) => left.localeCompare(right));
  }, [column, suggestionRows]);
  const isActive = Boolean(filter);

  const [operator, setOperator] = useState<DataTableFilterOperator>(
    filter?.operator ?? getDefaultOperator(column),
  );
  const [value, setValue] = useState(filter?.value ?? "");
  const [valueTo, setValueTo] = useState(filter?.valueTo ?? "");

  function openFilterMenu() {
    setOperator(filter?.operator ?? getDefaultOperator(column));
    setValue(filter?.value ?? "");
    setValueTo(filter?.valueTo ?? "");
    measureMenuPosition();
    setOpen(true);
  }

  function toggleFilterMenu() {
    if (open) {
      setOpen(false);
      return;
    }

    openFilterMenu();
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function applyFilter() {
    const normalizedValue = value.trim();
    const normalizedValueTo = valueTo.trim();

    if (!["isEmpty", "isNotEmpty"].includes(operator) && !normalizedValue) {
      onApply(null);
      setOpen(false);
      return;
    }

    onApply({
      columnKey: column.key,
      operator,
      value: normalizedValue,
      valueTo: operator === "between" ? normalizedValueTo : undefined,
    });

    setOpen(false);
  }

  function clearFilter() {
    setOperator(getDefaultOperator(column));
    setValue("");
    setValueTo("");
    onApply(null);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Filter ${column.header}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleFilterMenu}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white hover:text-foreground ${
          isActive ? "bg-white text-foreground ring-1 ring-border" : ""
        }`}
      >
        <Filter className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          /*
           * The table body scrolls and the shell hides overflow, so an
           * absolutely positioned menu is clipped. Positioning against the
           * viewport keeps the whole menu, including its actions, reachable.
           */
          style={menuPosition}
          className="fixed z-50 w-72 rounded-2xl border border-border bg-white p-3 text-sm text-foreground shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Filter
              </p>
              <p className="font-medium">{column.header}</p>
            </div>

            {isActive ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-foreground">
                Active
              </span>
            ) : null}
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted">Condition</span>
            <select
              value={operator}
              onChange={(event) =>
                setOperator(event.target.value as DataTableFilterOperator)
              }
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
            >
              {getOperators(filterType).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3 grid gap-3">
            {filterType === "select" || filterType === "multiSelect" ? (
              <FilterSelectInput
                multiple={filterType === "multiSelect"}
                options={column.filterOptions ?? []}
                value={value}
                onChange={setValue}
              />
            ) : (
              <FilterTextInput
                suggestions={suggestionValues}
                type={
                  filterType === "date"
                    ? "date"
                    : filterType === "number"
                      ? "number"
                      : "text"
                }
                value={value}
                onChange={setValue}
              />
            )}

            {operator === "between" ? (
              <FilterTextInput
                label="To"
                type={
                  filterType === "date"
                    ? "date"
                    : filterType === "number"
                      ? "number"
                      : "text"
                }
                value={valueTo}
                onChange={setValueTo}
              />
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clearFilter}
              className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted transition hover:bg-surface-strong hover:text-foreground"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={applyFilter}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-strong"
            >
              <Check className="h-4 w-4" />
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function FilterTextInput({
  label = "Value",
  suggestions,
  type,
  value,
  onChange,
}: {
  label?: string;
  suggestions?: readonly string[];
  type: "text" | "date" | "number";
  value: string;
  onChange: (value: string) => void;
}) {
  // Unique per input so several open filters cannot share a suggestion list.
  const listId = `${useId()}-filter-values`;

  const hasSuggestions = Boolean(suggestions?.length) && type !== "date";

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        list={hasSuggestions ? listId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
      />
      {hasSuggestions ? (
        <datalist id={listId}>
          {suggestions?.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </label>
  );
}

function FilterSelectInput({
  multiple,
  options,
  value,
  onChange,
}: {
  multiple: boolean;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const selectedValues = value.split(",").filter(Boolean);

  if (multiple) {
    return (
      <div className="grid gap-2">
        <span className="text-xs font-medium text-muted">Values</span>
        <div className="max-h-40 overflow-auto rounded-xl border border-border p-1">
          {options.map((option) => {
            const checked = selectedValues.includes(option.value);

            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-strong"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selectedValues.filter((item) => item !== option.value)
                      : [...selectedValues, option.value];

                    onChange(next.join(","));
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted">Value</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
      >
        <option value="">Select value</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function getDefaultOperator<T>(column: DataTableColumn<T>) {
  const type = column.filterType ?? "text";

  if (type === "date" || type === "number") return "equals";
  if (type === "select" || type === "multiSelect") return "equals";

  return "contains";
}

function getOperators(
  type: NonNullable<DataTableColumn<unknown>["filterType"]>,
) {
  const blank = [
    { value: "isEmpty", label: "Is empty" },
    { value: "isNotEmpty", label: "Has data" },
  ] satisfies Array<{ value: DataTableFilterOperator; label: string }>;

  if (type === "date") {
    return [
      { value: "equals", label: "On" },
      { value: "before", label: "Before" },
      { value: "after", label: "After" },
      { value: "onOrBefore", label: "On or before" },
      { value: "onOrAfter", label: "On or after" },
      { value: "between", label: "Between" },
      ...blank,
    ] satisfies Array<{ value: DataTableFilterOperator; label: string }>;
  }

  if (type === "number") {
    return [
      { value: "equals", label: "Equals" },
      { value: "notEquals", label: "Does not equal" },
      { value: "greaterThan", label: "Greater than" },
      { value: "lessThan", label: "Less than" },
      { value: "between", label: "Between" },
      ...blank,
    ] satisfies Array<{ value: DataTableFilterOperator; label: string }>;
  }

  if (type === "select" || type === "multiSelect") {
    return [
      { value: "equals", label: "Is" },
      { value: "notEquals", label: "Is not" },
      ...blank,
    ] satisfies Array<{ value: DataTableFilterOperator; label: string }>;
  }

  return [
    { value: "contains", label: "Contains" },
    { value: "notContains", label: "Does not contain" },
    { value: "equals", label: "Equals" },
    { value: "notEquals", label: "Does not equal" },
    { value: "startsWith", label: "Starts with" },
    { value: "endsWith", label: "Ends with" },
    ...blank,
  ] satisfies Array<{ value: DataTableFilterOperator; label: string }>;
}

function normalizePageSizeOptions(
  options: readonly number[] | undefined,
  currentPageSize: number,
) {
  return Array.from(
    new Set(
      [...(options?.length ? options : [10, 25, 50, 100]), currentPageSize]
        .map((option) => Math.floor(option))
        .filter((option) => Number.isFinite(option) && option > 0),
    ),
  ).sort((left, right) => left - right);
}
