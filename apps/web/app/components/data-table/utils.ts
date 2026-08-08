import {
  DataTableColumn,
  DataTableFilterState,
  DataTableSortState,
} from "./types";

type ComparableValue = string | number | boolean | Date | null | undefined;

function normalizeValue(value: ComparableValue) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return value.toString().trim().toLowerCase();
}

/*
 * Columns built from view metadata carry no accessor functions, so falling back
 * to the row's own field keeps sorting and filtering working for every module
 * instead of silently doing nothing.
 */
function readRowField<T>(row: T, column: DataTableColumn<T>) {
  const field = column.entityField ?? column.key;
  const source = row as Record<string, unknown>;
  const value = source?.[field];

  if (value === null || value === undefined) {
    return undefined;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value as ComparableValue;
  }

  // Lookup objects render through a label, so prefer a human-readable field.
  const nested = value as Record<string, unknown>;
  const label = nested.name ?? nested.label ?? nested.fullName ?? nested.title;

  return typeof label === "string" ? label : undefined;
}

function resolveColumnValue<T>(
  row: T,
  column: DataTableColumn<T>,
  preferred: "filter" | "sort",
): ComparableValue {
  const accessor =
    preferred === "filter"
      ? (column.filterAccessor ?? column.sortAccessor)
      : (column.sortAccessor ?? column.filterAccessor);

  const fromAccessor = accessor?.(row) as ComparableValue | undefined;

  if (fromAccessor !== undefined && fromAccessor !== null) {
    return fromAccessor;
  }

  return readRowField(row, column);
}

function getAccessorValue<T>(row: T, column?: DataTableColumn<T>) {
  if (!column) {
    return "";
  }

  return normalizeValue(resolveColumnValue(row, column, "filter"));
}

function toComparableNumber(value: string) {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const dateValue = new Date(value).getTime();

  return Number.isFinite(dateValue) ? dateValue : Number.NaN;
}

export function sortRows<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  sort: DataTableSortState | null,
): T[] {
  if (!sort) {
    return rows;
  }

  const column = columns.find((item) => item.key === sort.columnKey);

  if (!column?.sortable) {
    return rows;
  }

  const multiplier = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = normalizeValue(resolveColumnValue(left, column, "sort"));

    const rightValue = normalizeValue(
      resolveColumnValue(right, column, "sort"),
    );

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * multiplier;
    }

    return String(leftValue).localeCompare(String(rightValue), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * multiplier;
  });
}

export function filterRows<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  filters: DataTableFilterState[],
): T[] {
  if (!filters.length) {
    return rows;
  }

  return rows.filter((row) =>
    filters.every((filter) => {
      const column = columns.find((item) => item.key === filter.columnKey);

      if (!column?.filterable) {
        return true;
      }

      const rawValue = String(getAccessorValue(row, column))
        .trim()
        .toLowerCase();
      const filterValue = filter.value.trim().toLowerCase();
      const rawComparable = toComparableNumber(rawValue);
      const filterComparable = toComparableNumber(filter.value);
      const filterComparableTo = toComparableNumber(filter.valueTo ?? "");

      switch (filter.operator) {
        case "contains":
          if (column.filterType === "multiSelect") {
            return filterValue
              .split(",")
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean)
              .includes(rawValue);
          }

          return rawValue.includes(filterValue);

        case "equals":
          if (column.filterType === "multiSelect") {
            return filterValue
              .split(",")
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean)
              .includes(rawValue);
          }

          return rawValue === filterValue;

        case "startsWith":
          return rawValue.startsWith(filterValue);

        case "endsWith":
          return rawValue.endsWith(filterValue);

        case "isEmpty":
          return rawValue.length === 0;

        case "isNotEmpty":
          return rawValue.length > 0;

        case "before":
        case "lessThan":
          return (
            Number.isFinite(rawComparable) &&
            Number.isFinite(filterComparable) &&
            rawComparable < filterComparable
          );

        case "after":
        case "greaterThan":
          return (
            Number.isFinite(rawComparable) &&
            Number.isFinite(filterComparable) &&
            rawComparable > filterComparable
          );

        case "between":
          return (
            Number.isFinite(rawComparable) &&
            Number.isFinite(filterComparable) &&
            Number.isFinite(filterComparableTo) &&
            rawComparable >= filterComparable &&
            rawComparable <= filterComparableTo
          );

        default:
          return true;
      }
    }),
  );
}

export function searchRows<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  searchTerm: string,
): T[] {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return rows;
  }

  const searchableColumns = columns.filter(
    (column) => column.searchable !== false && (column.searchAccessor || column.filterAccessor || column.sortAccessor),
  );

  return rows.filter((row) =>
    searchableColumns.some((column) => {
      const accessor =
        column.searchAccessor ?? column.filterAccessor ?? column.sortAccessor;

      if (!accessor) {
        return false;
      }

      const value = normalizeValue(accessor(row) as ComparableValue);

      return String(value).toLowerCase().includes(normalizedSearch);
    }),
  );
}
