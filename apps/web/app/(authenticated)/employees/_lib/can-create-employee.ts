import { PERMISSION_KEYS } from "@/lib/security-keys";

/**
 * Whether the signed-in user may create employees (DP-QA-021).
 *
 * `/employees/new` rendered the full form with a Save button to an employee-level
 * user; the API refused only on submit. The list screen already hid the New
 * command from them, so the route now agrees. Usability only: the API enforces
 * `employees.create` and the matrix privilege regardless.
 */
export function canCreateEmployee(
  user: { permissionKeys?: readonly string[] | null } | null | undefined,
): boolean {
  return Boolean(
    user?.permissionKeys?.includes(PERMISSION_KEYS.EMPLOYEES_CREATE),
  );
}
