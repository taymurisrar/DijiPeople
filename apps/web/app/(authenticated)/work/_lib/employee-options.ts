import { apiRequestJson } from "@/lib/server-api";
import type { PersonOption } from "./people";

type EmployeePage = {
  items?: Array<{ id: string; fullName: string; employeeCode: string }>;
};

/**
 * The employees the caller can read, for name lookups and pickers. A nicety: a
 * screen works without it, so a failure is an empty list rather than an error.
 */
export async function loadEmployeeOptions(): Promise<PersonOption[]> {
  const page = await apiRequestJson<EmployeePage>(
    "/employees?pageSize=100",
  ).catch((): EmployeePage => ({ items: [] }));
  return (page.items ?? []).map((employee) => ({
    id: employee.id,
    name: employee.fullName,
    code: employee.employeeCode,
  }));
}
