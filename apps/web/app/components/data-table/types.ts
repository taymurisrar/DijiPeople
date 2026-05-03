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

export type DataTableFilterFieldType = "text" | "select" | "lookup";

export type DataTableLookupOption = {
  label: string;
  value: string;
  description?: string | null;
};

export type DataTableLookupConfig = {
  /**
   * API route used by the toolbar to fetch lookup options.
   * Example: "/api/business-units"
   */
  endpoint: string;

  /**
   * Query parameter used for searching.
   * Example: "search"
   */
  searchParam?: string;

  /**
   * Field path used as option label.
   * Example: "name"
   */
  labelField: string;

  /**
   * Field path used as option value.
   * Example: "id"
   */
  valueField: string;

  /**
   * Optional field path shown as secondary text.
   * Example: "code"
   */
  descriptionField?: string;

  /**
   * Optional static fallback options.
   */
  options?: DataTableLookupOption[];
};

export type DataTableFilterField = {
  key: string;
  label: string;
  type?: DataTableFilterFieldType;
  placeholder?: string;

  /**
   * Used by select filters.
   */
  options?: DataTableFilterOption[];

  /**
   * Used by lookup filters.
   */
  lookup?: DataTableLookupConfig;
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