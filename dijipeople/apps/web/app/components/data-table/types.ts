import { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
  sortable?: boolean;
  sortAccessor?: (row: T) => string | number | null | undefined;
  render: (row: T) => ReactNode;
};

export type DataTableFilterOption = {
  label: string;
  value: string;
};

export type DataTableFilterField = {
  key: string;
  label: string;
  type?: "text" | "select";
  placeholder?: string;
  options?: DataTableFilterOption[];
};

export type DataTableSortState = {
  columnKey: string;
  direction: SortDirection;
};