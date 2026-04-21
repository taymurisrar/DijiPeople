import { DataTableToolbar } from "@/app/components/data-table/data-table-toolbar";
import { EmployeeListItem } from "../types";
import { getEmployeeFilterFields } from "./employees-filters";

type EmployeesFilterBarProps = {
  managerOptions: EmployeeListItem[];
};

export function EmployeesFilterBar({
  managerOptions,
}: EmployeesFilterBarProps) {
  return (
    <DataTableToolbar
      fields={getEmployeeFilterFields(managerOptions)}
      resetLabel="Reset filters"
      submitLabel="Apply filters"
    />
  );
}