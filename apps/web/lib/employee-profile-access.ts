import type { SessionUser } from "@/lib/auth";

const CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS = new Set([
  "global-admin",
  "system-admin",
  "hr",
]);

export function canEditEmployeeCoreProfile(
  user: Pick<SessionUser, "roleKeys"> | null | undefined,
) {
  return (user?.roleKeys ?? []).some((roleKey) =>
    CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS.has(roleKey),
  );
}

export type EmployeeAccessMode =
  | "SELF"
  | "MANAGER_READONLY"
  | "HR_MANAGE"
  | "ADMIN_MANAGE"
  | "DENIED";

/**
 * Record-level manage rights as the API grants them: `canWriteEmployeeRecord`
 * in employee-access.service.ts treats HR_MANAGE and ADMIN_MANAGE alike. Keep
 * every UI gate on this helper so a screen cannot drift from the server and
 * lock out HR, who receive HR_MANAGE rather than ADMIN_MANAGE.
 */
export function canManageEmployeeRecord(
  accessMode: EmployeeAccessMode | string | null | undefined,
) {
  return accessMode === "ADMIN_MANAGE" || accessMode === "HR_MANAGE";
}
