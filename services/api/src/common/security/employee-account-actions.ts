import { ROLE_KEYS } from '../constants/rbac-matrix';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import { hasAnyRole } from './role-matching';

export const EMPLOYEE_ACCOUNT_ACTION_ROLE_KEYS = [
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.HR,
] as const;

export function canManageEmployeeAccountActions(
  user: Pick<AuthenticatedUser, 'roleKeys'> | null | undefined,
) {
  return hasAnyRole(user?.roleKeys ?? [], EMPLOYEE_ACCOUNT_ACTION_ROLE_KEYS);
}
