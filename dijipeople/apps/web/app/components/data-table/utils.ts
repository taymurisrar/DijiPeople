import { DataTableColumn, DataTableSortState } from "./types";

function normalizeSortValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return value;
  }

  return value.toString().trim().toLowerCase();
}

export function sortRows<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  sort: DataTableSortState | null,
) {
  if (!sort) {
    return rows;
  }

  const column = columns.find((item) => item.key === sort.columnKey);
  if (!column?.sortable || !column.sortAccessor) {
    return rows;
  }

  const multiplier = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = normalizeSortValue(column.sortAccessor?.(left));
    const rightValue = normalizeSortValue(column.sortAccessor?.(right));

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * multiplier;
    }

    if (leftValue < rightValue) {
      return -1 * multiplier;
    }

    if (leftValue > rightValue) {
      return 1 * multiplier;
    }

    return 0;
  });
}