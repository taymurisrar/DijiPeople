import { DataTableFilterField } from "@/app/components/data-table/types";
import { EmployeeListItem } from "../types";

export function getEmployeeFilterFields(
  managerOptions: EmployeeListItem[],
): DataTableFilterField[] {
  return [
    {
      key: "search",
      label: "Search",
      type: "text",
      placeholder: "Search by employee name, code, email, or phone",
    },
    {
      key: "employmentStatus",
      label: "Status",
      type: "select",
      options: [
        { label: "Active", value: "Active" },
        { label: "Draft", value: "DRAFT" },
        { label: "On Leave", value: "ON_LEAVE" },
        { label: "Inactive", value: "INActive" },
        { label: "Terminated", value: "TERMINATED" },
      ],
    },
    {
      key: "reportingManagerEmployeeId",
      label: "Reporting Manager",
      type: "select",
      options: managerOptions.map((manager) => ({
        label: manager.fullName,
        value: manager.id,
      })),
    },
  ];
}