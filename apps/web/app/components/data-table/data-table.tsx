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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  pagination,

  enableSelection = false,
  selectedRowKeys = [],
  onSelectedRowKeysChange,
}: DataTableProps<T>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sort, setSort] = useState<DataTableSortState | null>(initialSort);
  const [filters, setFilters] =
    useState<DataTableFilterState[]>(initialFilters);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSort(initialSort);
  }, [initialSort]);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const processedRows = useMemo(() => {
    const searchedRows = searchRows(rows, columns, search);

    if (mode === "server") {
      return searchedRows;
    }

    const filteredRows = filterRows(searchedRows, columns, filters);

    return sortRows(filteredRows, columns, sort);
  }, [rows, columns, search, filters, sort, mode]);

  const processedRowKeys = useMemo(
    () => processedRows.map((row) => getRowKey(row)),
    [processedRows, getRowKey],
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

  const someVisibleSelected =
    selectedVisibleCount > 0 && !allVisibleSelected;

  const hasActiveSearchOrFilters =
    search.trim().length > 0 || filters.length > 0;

  const totalRecords =
    pagination?.total ?? pagination?.totalItems ?? rows.length;

  function toggleRowSelection(rowKey: string) {
    if (!onSelectedRowKeysChange) {
      return;
    }

    if (selectedKeySet.has(rowKey)) {
      onSelectedRowKeysChange(
        selectedRowKeys.filter((key) => key !== rowKey),
      );
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
        "overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm"
      }
    >
      <div className="flex flex-col gap-3 border-b border-border bg-surface-strong px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Records
          </p>

          <p className="text-xs text-muted">
            Showing {processedRows.length} of {totalRecords}
            {entityLogicalName ? ` ${entityLogicalName}` : ""}
          </p>

          {enableSelection && selectedRowKeys.length > 0 ? (
            <p className="mt-1 text-xs font-medium text-foreground">
              {selectedRowKeys.length} selected
            </p>
          ) : null}
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

          {hasActiveSearchOrFilters ? (
            <button
              type="button"
              onClick={clearAllFilters}
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
              {enableSelection ? (
                <th className="w-12 px-5 py-4">
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
                  className={`px-5 py-4 font-medium ${
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
                        onApply={(nextFilter) =>
                          applyColumnFilter(column, nextFilter)
                        }
                      />
                    ) : null}
                  </div>
                </th>
                );
              })}
            </tr>
          </thead>

          <tbody className={bodyClassName}>
            {processedRows.length > 0 ? (
              processedRows.map((row) => {
                const rowKey = getRowKey(row);
                const isSelected = selectedKeySet.has(rowKey);

                return (
                  <tr key={rowKey} className={rowClassName}>
                    {enableSelection ? (
                      <td className="w-12 px-5 py-4 align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(rowKey)}
                          className="h-4 w-4 rounded border-border"
                          aria-label="Select record"
                        />
                      </td>
                    ) : null}

                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-5 py-4 align-top ${
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
            Math.max(
              1,
              Math.ceil(totalRecords / Math.max(1, pagination.pageSize)),
            )}
        </div>
      ) : null}
    </div>
  );
}

function ColumnFilterButton<T>({
  column,
  filter,
  onApply,
}: {
  column: DataTableColumn<T>;
  filter?: DataTableFilterState;
  onApply: (filter: DataTableFilterState | null) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const filterType = column.filterType ?? "text";
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
          className="absolute left-0 top-8 z-30 w-72 rounded-2xl border border-border bg-white p-3 text-sm text-foreground shadow-xl"
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
  type,
  value,
  onChange,
}: {
  label?: string;
  type: "text" | "date" | "number";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
      />
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

function getOperators(type: NonNullable<DataTableColumn<unknown>["filterType"]>) {
  if (type === "date") {
    return [
      { value: "equals", label: "Equals" },
      { value: "before", label: "Before" },
      { value: "after", label: "After" },
      { value: "between", label: "Between" },
    ] satisfies Array<{ value: DataTableFilterOperator; label: string }>;
  }

  if (type === "number") {
    return [
      { value: "equals", label: "Equals" },
      { value: "greaterThan", label: "Greater than" },
      { value: "lessThan", label: "Less than" },
      { value: "between", label: "Between" },
    ] satisfies Array<{ value: DataTableFilterOperator; label: string }>;
  }

  if (type === "select" || type === "multiSelect") {
    return [{ value: "equals", label: "Equals" }] satisfies Array<{
      value: DataTableFilterOperator;
      label: string;
    }>;
  }

  return [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "startsWith", label: "Starts with" },
  ] satisfies Array<{ value: DataTableFilterOperator; label: string }>;
}
