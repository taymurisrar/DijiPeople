import { ROLE_KEYS } from '../constants/rbac-matrix';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

export const ELEVATED_TENANT_ROLE_KEYS = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.SYSTEM_CUSTOMIZER,
]);

/**
 * Tenant-wide operational roles are not employee-persona roles.
 * They may administer tenant-scoped HR data without a linked Employee record,
 * while every query and mutation must still remain constrained to tenantId.
 */
export function hasElevatedTenantRole(
  user: Pick<AuthenticatedUser, 'roleKeys'> | null | undefined,
) {
  return (user?.roleKeys ?? []).some((roleKey) =>
    ELEVATED_TENANT_ROLE_KEYS.has(roleKey),
  );
}
