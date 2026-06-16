import { ROLE_KEYS } from '../constants/rbac-matrix';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

export const ELEVATED_TENANT_ROLE_KEYS = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
]);

export const CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.HR,
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
