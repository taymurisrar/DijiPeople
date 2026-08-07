import { ROLE_KEYS } from '../constants/rbac-matrix';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

export const ELEVATED_TENANT_ROLE_KEYS = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
]);

/**
 * Roles that administer employee profiles at HR level, tenant wide.
 *
 * A manager is deliberately absent: holding this would present them as an HR
 * administrator of every record rather than of their own reporting line.
 */
export const CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.HR,
]);

/**
 * Roles that may edit an employee record at all.
 *
 * Wider than the HR-level set because a manager maintains their own reports.
 * This only opens the update path; which records may be touched is still
 * decided by the scoped access query at the call site.
 */
export const EMPLOYEE_RECORD_EDITOR_ROLE_KEYS = new Set<string>([
  ...CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS,
  ROLE_KEYS.MANAGER,
]);

/**
 * Tenant-wide operational roles are not employee-persona roles.
 * They may administer tenant-scoped HR data without a linked Employee record,
 * while every query and mutation must still remain constrained to tenantId.
 *
 * System Customizer and Recruiter are capability roles. They must earn access
 * through explicit permissions/privileges and must not inherit tenant-wide
 * employee, attendance, hierarchy, or management visibility from this helper.
 */
export function hasElevatedTenantRole(
  user: Pick<AuthenticatedUser, 'roleKeys'> | null | undefined,
) {
  return (user?.roleKeys ?? []).some((roleKey) =>
    ELEVATED_TENANT_ROLE_KEYS.has(roleKey),
  );
}

export function canEditEmployeeCoreProfile(
  user: Pick<AuthenticatedUser, 'roleKeys'> | null | undefined,
) {
  return (user?.roleKeys ?? []).some((roleKey) =>
    CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS.has(roleKey),
  );
}

/** Whether the role may edit employee records within its own access scope. */
export function canEditEmployeeRecord(
  user: Pick<AuthenticatedUser, 'roleKeys'> | null | undefined,
) {
  return (user?.roleKeys ?? []).some((roleKey) =>
    EMPLOYEE_RECORD_EDITOR_ROLE_KEYS.has(roleKey),
  );
}
