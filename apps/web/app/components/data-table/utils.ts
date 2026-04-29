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

function getAccessorValue<T>(row: T, column?: DataTableColumn<T>) {
  if (!column) {
    return "";
  }

  const accessor = column.filterAccessor ?? column.sortAccessor;

  if (!accessor) {
    return "";
  }

  return normalizeValue(accessor(row) as ComparableValue);
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

  if (!column?.sortable || !column.sortAccessor) {
    return rows;
  }

  const multiplier = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = normalizeValue(
      column.sortAccessor?.(left) as ComparableValue,
    );

    const rightValue = normalizeValue(
      column.sortAccessor?.(right) as ComparableValue,
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

      const rawValue = String(getAccessorValue(row, column)).trim().toLowerCase();
      const filterValue = filter.value.trim().toLowerCase();

      switch (filter.operator) {
        case "contains":
          return rawValue.includes(filterValue);

        case "equals":
          return rawValue === filterValue;

        case "startsWith":
          return rawValue.startsWith(filterValue);

        case "endsWith":
          return rawValue.endsWith(filterValue);

        case "isEmpty":
          return rawValue.length === 0;

        case "isNotEmpty":
          return rawValue.length > 0;

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