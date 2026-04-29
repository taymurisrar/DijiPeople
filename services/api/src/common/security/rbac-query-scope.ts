import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { SECURITY_ACCESS_LEVEL_WEIGHT } from '../constants/rbac-matrix';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

type ScopedWhereOptions = {
  tenantIdField?: string;
  businessUnitIdField?: string;
  organizationIdField?: string | null;
  ownerUserIdField?: string;
  ownerTeamIdField?: string;
  userIdField?: string;
  createdByIdField?: string;
};

type SecuredRecord = {
  tenantId: string;
  organizationId?: string | null;
  businessUnitId?: string | null;
  ownerUserId?: string | null;
  ownerTeamId?: string | null;
  userId?: string | null;
  createdById?: string | null;
};

export function resolveEffectiveAccessLevel(
  user: AuthenticatedUser,
  entityKey: string,
  privilege: SecurityPrivilege,
) {
  return (user.rolePrivileges ?? [])
    .filter(
      (rolePrivilege) =>
        rolePrivilege.entityKey === entityKey &&
        rolePrivilege.privilege === privilege,
    )
    .reduce((best, rolePrivilege) => {
      if (
        SECURITY_ACCESS_LEVEL_WEIGHT[rolePrivilege.accessLevel] >
        SECURITY_ACCESS_LEVEL_WEIGHT[best]
      ) {
        return rolePrivilege.accessLevel;
      }

      return best;
    }, SecurityAccessLevel.NONE);
}

export function buildTenantWhere<T extends Record<string, unknown>>(
  tenantId: string,
  tenantIdField = 'tenantId',
): T {
  return { [tenantIdField]: tenantId } as T;
}

export function buildOwnedRecordWhere(
  user: AuthenticatedUser,
  options: ScopedWhereOptions = {},
) {
  const ownerUserIdField = options.ownerUserIdField ?? 'ownerUserId';
  const ownerTeamIdField = options.ownerTeamIdField ?? 'ownerTeamId';
  const userIdField = options.userIdField ?? 'userId';
  const createdByIdField = options.createdByIdField ?? 'createdById';
  const teamIds = user.accessContext?.teamIds ?? [];

  return {
    OR: [
      { [ownerUserIdField]: user.userId },
      { [userIdField]: user.userId },
      { [createdByIdField]: user.userId },
      ...(teamIds.length > 0 ? [{ [ownerTeamIdField]: { in: teamIds } }] : []),
    ],
  };
}

export function buildBusinessUnitScopeWhere(
  user: AuthenticatedUser,
  accessLevel: SecurityAccessLevel,
  options: ScopedWhereOptions = {},
) {
  const businessUnitIdField = options.businessUnitIdField ?? 'businessUnitId';
  const organizationIdField = options.organizationIdField ?? 'organizationId';

  if (accessLevel === SecurityAccessLevel.ORGANIZATION) {
    if (options.organizationIdField === null) {
      return {
        [businessUnitIdField]: {
          in: user.accessContext?.accessibleBusinessUnitIds ?? [],
        },
      };
    }

    return { [organizationIdField]: user.accessContext?.organizationId };
  }

  if (
    accessLevel === SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT ||
    accessLevel === SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS
  ) {
    return {
      [businessUnitIdField]: {
        in: user.accessContext?.businessUnitSubtreeIds ?? [],
      },
    };
  }

  return { [businessUnitIdField]: user.accessContext?.businessUnitId };
}

export function buildScopedAccessWhere<T extends Record<string, unknown>>(
  user: AuthenticatedUser,
  entityKey: string,
  privilege: SecurityPrivilege,
  options: ScopedWhereOptions = {},
): T {
  const accessLevel = resolveEffectiveAccessLevel(user, entityKey, privilege);
  const tenantWhere = buildTenantWhere(user.tenantId, options.tenantIdField);

  if (accessLevel === SecurityAccessLevel.NONE) {
    return { AND: [tenantWhere, { id: '__rbac_no_access__' }] } as unknown as T;
  }

  if (accessLevel === SecurityAccessLevel.TENANT) {
    return tenantWhere as T;
  }

  if (
    accessLevel === SecurityAccessLevel.SELF ||
    accessLevel === SecurityAccessLevel.USER
  ) {
    return {
      AND: [tenantWhere, buildOwnedRecordWhere(user, options)],
    } as unknown as T;
  }

  if (accessLevel === SecurityAccessLevel.TEAM) {
    return {
      AND: [
        tenantWhere,
        {
          OR: [
            buildOwnedRecordWhere(user, options),
            buildBusinessUnitScopeWhere(
              user,
              SecurityAccessLevel.BUSINESS_UNIT,
              options,
            ),
          ],
        },
      ],
    } as unknown as T;
  }

  return {
    AND: [tenantWhere, buildBusinessUnitScopeWhere(user, accessLevel, options)],
  } as unknown as T;
}

export function canAccessRecord(
  user: AuthenticatedUser,
  entityKey: string,
  privilege: SecurityPrivilege,
  record: SecuredRecord,
) {
  if (user.tenantId !== record.tenantId) {
    return false;
  }

  const accessLevel = resolveEffectiveAccessLevel(user, entityKey, privilege);

  if (accessLevel === SecurityAccessLevel.NONE) {
    return false;
  }

  if (accessLevel === SecurityAccessLevel.TENANT) {
    return true;
  }

  if (
    accessLevel === SecurityAccessLevel.SELF ||
    accessLevel === SecurityAccessLevel.USER
  ) {
    return (
      record.ownerUserId === user.userId ||
      record.userId === user.userId ||
      record.createdById === user.userId
    );
  }

  if (accessLevel === SecurityAccessLevel.TEAM) {
    return (
      Boolean(record.ownerTeamId) &&
      (user.accessContext?.teamIds ?? []).includes(record.ownerTeamId ?? '')
    );
  }

  if (
    accessLevel === SecurityAccessLevel.BUSINESS_UNIT &&
    record.businessUnitId
  ) {
    return record.businessUnitId === user.accessContext?.businessUnitId;
  }

  if (
    (accessLevel === SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT ||
      accessLevel === SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS) &&
    record.businessUnitId
  ) {
    return (user.accessContext?.businessUnitSubtreeIds ?? []).includes(
      record.businessUnitId,
    );
  }

  if (accessLevel === SecurityAccessLevel.ORGANIZATION) {
    return record.organizationId
      ? record.organizationId === user.accessContext?.organizationId
      : Boolean(
          record.businessUnitId &&
          (user.accessContext?.accessibleBusinessUnitIds ?? []).includes(
            record.businessUnitId,
          ),
        );
  }

  return false;
}
