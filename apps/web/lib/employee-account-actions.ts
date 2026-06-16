import { ROLE_KEYS } from "@/lib/security-keys";
import { hasAnyRuntimeRole } from "@/lib/runtime/role-runtime";
import type { RuntimeRoleValue } from "@/lib/runtime/security-runtime.types";

export const EMPLOYEE_ACCOUNT_ACTION_ROLE_KEYS = [
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.HR,
] as const;

export function canManageEmployeeAccountActions(
  roles: readonly RuntimeRoleValue[] | undefined | null,
) {
  return hasAnyRuntimeRole(roles, EMPLOYEE_ACCOUNT_ACTION_ROLE_KEYS);
}
