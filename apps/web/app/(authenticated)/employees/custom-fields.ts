import type { EmployeeCustomFieldDefinition } from "@/lib/runtime/modules/employee-custom-fields";
import { apiRequestJson } from "@/lib/server-api";

/*
 * The tenant's published custom fields on Employees (BUG-3697). A failure
 * leaves the form as it was before custom fields existed rather than failing
 * the page: the built-in employee fields do not depend on them.
 */
export function loadEmployeeCustomFields() {
  return apiRequestJson<readonly EmployeeCustomFieldDefinition[]>(
    "/employees/custom-fields",
  ).catch((): readonly EmployeeCustomFieldDefinition[] => []);
}
