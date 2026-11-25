import { Prisma, SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../constants/rbac-matrix';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import { resolveEffectiveAccessLevel } from './rbac-query-scope';

/*
 * DP-MASTER WP-06.S1 / WP-30.S1. "Whose work may this user see or change?"
 *
 * Work records (work items, contribution entries) have no business-unit or team
 * column of their own that is reliable: the people they concern do. So visibility
 * of someone's work follows visibility of that person, using the access level the
 * user's roles already hold on the EMPLOYEES entity. An employee (SELF) sees and
 * changes their own work; a manager sees their business-unit subtree; HR sees the
 * tenant. This adds no second permission model and widens no existing right.
 *
 * The result is a `where` for the Employee model, or null when the user may not
 * touch anyone's work at that privilege. It is always tenant-scoped by the caller.
 */
export function employeeScopeWhere(
  user: AuthenticatedUser,
  privilege: SecurityPrivilege,
): Prisma.EmployeeWhereInput | null {
  const level = resolveEffectiveAccessLevel(
    user,
    ENTITY_KEYS.EMPLOYEES,
    privilege,
  );
  const own: Prisma.EmployeeWhereInput = { userId: user.userId };
  const context = user.accessContext;

  switch (level) {
    case SecurityAccessLevel.TENANT:
      return {};
    case SecurityAccessLevel.NONE:
      return null;
    case SecurityAccessLevel.SELF:
    case SecurityAccessLevel.USER:
      return own;
    case SecurityAccessLevel.TEAM:
      return {
        OR: [own, { teamId: { in: context?.teamIds ?? [] } }],
      };
    case SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT:
    case SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS:
      return {
        OR: [
          own,
          { businessUnitId: { in: context?.businessUnitSubtreeIds ?? [] } },
        ],
      };
    case SecurityAccessLevel.ORGANIZATION:
      return {
        OR: [
          own,
          ...(context?.organizationId
            ? [{ organizationId: context.organizationId }]
            : []),
          { businessUnitId: { in: context?.accessibleBusinessUnitIds ?? [] } },
        ],
      };
    default:
      // BUSINESS_UNIT and anything else: the user's own business unit.
      return {
        OR: [
          own,
          ...(context?.businessUnitId
            ? [{ businessUnitId: context.businessUnitId }]
            : []),
        ],
      };
  }
}

/** True when this scope reaches every employee in the tenant. */
export function isTenantWide(where: Prisma.EmployeeWhereInput | null) {
  return where !== null && Object.keys(where).length === 0;
}
