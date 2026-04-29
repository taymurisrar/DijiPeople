import { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

export type DataTableComparableValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

export type DataTableFilterOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "isEmpty"
  | "isNotEmpty";

export type DataTableColumn<T> = {
  key: string;
  entityField?: string;
  header: string;

  className?: string;
  headerClassName?: string;
  cellClassName?: string;

  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;

  sortAccessor?: (row: T) => DataTableComparableValue;
  filterAccessor?: (row: T) => DataTableComparableValue;
  searchAccessor?: (row: T) => DataTableComparableValue;

  render: (row: T) => ReactNode;
};

export type DataTableFilterOption = {
  label: string;
  value: string;
};

export type DataTableFilterFieldType = "text" | "select";

export type DataTableFilterField = {
  key: string;
  label: string;
  type?: DataTableFilterFieldType;
  placeholder?: string;
  options?: DataTableFilterOption[];
};

export type DataTableFilterState = {
  columnKey: string;
  operator: DataTableFilterOperator;
  value: string;
};

export type DataTableSortState = {
  columnKey: string;
  direction: SortDirection;
};
