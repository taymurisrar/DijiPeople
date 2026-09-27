import type {
  DataTableFilterOperator,
  DataTableFilterState,
} from "@/app/components/data-table/types";

/*
 * TASK-0036 / ADR-0025 — a filter on a custom field column of the employee
 * list. The table writes it to the URL like any column filter
 * (`<field>Filter`, `<field>FilterOperator`, `<field>FilterTo`); the employees
 * endpoint takes custom fields as one JSON `customFilters` parameter, because
 * their names are the tenant's and cannot be DTO properties.
 */
export type CustomFieldListFilter = {
  readonly field: string;
  readonly operator: DataTableFilterOperator;
  readonly value?: string;
  readonly valueTo?: string;
};

const VALUELESS = new Set<string>(["isEmpty", "isNotEmpty"]);

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function resolveCustomFieldListFilters(
  params: Readonly<Record<string, string | string[] | undefined>>,
  fieldNames: readonly string[],
) {
  const filters: CustomFieldListFilter[] = [];
  const tableFilters: DataTableFilterState[] = [];
  const searchParams: Record<string, string> = {};

  for (const field of fieldNames) {
    const value = first(params[`${field}Filter`]);
    const operator = (first(params[`${field}FilterOperator`]) ||
      "contains") as DataTableFilterOperator;
    const valueTo = first(params[`${field}FilterTo`]);
    if (!value && !VALUELESS.has(operator)) continue;

    filters.push({
      field,
      operator,
      ...(value && !VALUELESS.has(operator) ? { value } : {}),
      ...(valueTo ? { valueTo } : {}),
    });
    tableFilters.push({
      columnKey: field,
      operator,
      value,
      valueTo: valueTo || undefined,
    });
    if (value) searchParams[`${field}Filter`] = value;
    searchParams[`${field}FilterOperator`] = operator;
    if (valueTo) searchParams[`${field}FilterTo`] = valueTo;
  }

  return {
    /* The `customFilters` query value, or empty when nothing is filtered. */
    customFilters: filters.length ? JSON.stringify(filters) : "",
    tableFilters,
    searchParams,
  };
}
