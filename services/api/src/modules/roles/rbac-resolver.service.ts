import { Injectable } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { SECURITY_ACCESS_LEVEL_WEIGHT } from '../../common/constants/rbac-matrix';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildScopedAccessWhere,
  canAccessRecord as canAccessSecuredRecord,
  resolveEffectiveAccessLevel,
} from '../../common/security/rbac-query-scope';

type SecuredRecord = {
  tenantId: string;
  organizationId?: string | null;
  businessUnitId?: string | null;
  ownerUserId?: string | null;
  createdById?: string | null;
};

@Injectable()
export class RbacResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePrivileges(userId: string) {
    const effective = await this.getEffectivePermissionsForUser(userId);

    return {
      privileges: effective.privileges,
      miscPermissions: effective.miscPermissions,
    };
  }

  async getEffectivePermissionsForUser(userId: string, tenantId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: { select: { ownerUserId: true } },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
                rolePrivileges: true,
                miscPermissions: true,
              },
            },
          },
        },
        teamMemberships: {
          include: {
            team: {
              include: {
                teamRoles: {
                  include: {
                    role: {
                      include: {
                        rolePermissions: {
                          include: { permission: true },
                        },
                        rolePrivileges: true,
                        miscPermissions: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return {
        roleIds: [],
        roleKeys: [],
        permissionKeys: [],
        privileges: [],
        miscPermissions: [],
      };
    }

    if (tenantId && user.tenantId !== tenantId) {
      return {
        roleIds: [],
        roleKeys: [],
        permissionKeys: [],
        privileges: [],
        miscPermissions: [],
      };
    }

    const effectiveByKey = new Map<
      string,
      {
        entityKey: string;
        privilege: SecurityPrivilege;
        accessLevel: SecurityAccessLevel;
      }
    >();
    const miscPermissions = new Set<string>();
    const permissionKeys = new Set<string>();

    const directRoles = user.userRoles.map((userRole) => userRole.role);
    const teamRoles = user.teamMemberships.flatMap((membership) =>
      membership.team.isActive
        ? membership.team.teamRoles.map((teamRole) => teamRole.role)
        : [],
    );
    const effectiveRoles = Array.from(
      new Map(
        [...directRoles, ...teamRoles]
          .filter((role) => role.isActive)
          .map((role) => [role.id, role]),
      ).values(),
    );

    for (const role of effectiveRoles) {
      for (const rolePrivilege of role.rolePrivileges) {
        const key = `${rolePrivilege.entityKey}:${rolePrivilege.privilege}`;
        const current = effectiveByKey.get(key);

        if (!current) {
          effectiveByKey.set(key, {
            entityKey: rolePrivilege.entityKey,
            privilege: rolePrivilege.privilege,
            accessLevel: rolePrivilege.accessLevel,
          });
          continue;
        }

        effectiveByKey.set(key, {
          entityKey: rolePrivilege.entityKey,
          privilege: rolePrivilege.privilege,
          accessLevel: this.resolveHighestScope([
            current.accessLevel,
            rolePrivilege.accessLevel,
          ]),
        });
      }

      for (const rolePermission of role.rolePermissions ?? []) {
        permissionKeys.add(rolePermission.permission.key);
      }

      for (const permission of role.miscPermissions) {
        if (permission.enabled) {
          miscPermissions.add(permission.permissionKey);
          permissionKeys.add(permission.permissionKey);
        }
      }
    }

    return {
      roleIds: effectiveRoles.map((role) => role.id),
      roleKeys: effectiveRoles.map((role) => role.key),
      permissionKeys: Array.from(permissionKeys),
      privileges: Array.from(effectiveByKey.values()),
      miscPermissions: Array.from(miscPermissions),
    };
  }

  resolveHighestScope(
    accessLevels: Array<SecurityAccessLevel | null | undefined>,
  ) {
    return accessLevels.reduce<SecurityAccessLevel>((best, accessLevel) => {
      if (
        accessLevel &&
        SECURITY_ACCESS_LEVEL_WEIGHT[accessLevel] >
          SECURITY_ACCESS_LEVEL_WEIGHT[best]
      ) {
        return accessLevel;
      }

      return best;
    }, SecurityAccessLevel.NONE);
  }

  async canUserPerformAction(
    userId: string,
    tenantId: string,
    entityKey: string,
    privilege: SecurityPrivilege,
  ) {
    const effective = await this.getEffectivePermissionsForUser(
      userId,
      tenantId,
    );
    const accessLevel =
      effective.privileges.find(
        (item) => item.entityKey === entityKey && item.privilege === privilege,
      )?.accessLevel ?? SecurityAccessLevel.NONE;

    return accessLevel !== SecurityAccessLevel.NONE;
  }

  canAccessRecord(
    user: AuthenticatedUser,
    entityKey: string,
    privilege: SecurityPrivilege,
    record: SecuredRecord,
  ) {
    return canAccessSecuredRecord(user, entityKey, privilege, record);
  }

  async getAccessibleBusinessUnitIds(
    userId: string,
    accessLevel: SecurityAccessLevel,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        businessUnit: {
          select: {
            id: true,
            tenantId: true,
            organizationId: true,
          },
        },
      },
    });

    if (!user?.businessUnit) {
      return [];
    }

    const businessUnits = await this.prisma.businessUnit.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        organizationId: true,
        parentBusinessUnitId: true,
      },
    });

    switch (accessLevel) {
      case SecurityAccessLevel.TENANT:
        return businessUnits.map((unit) => unit.id);
      case SecurityAccessLevel.ORGANIZATION:
        return businessUnits
          .filter(
            (unit) => unit.organizationId === user.businessUnit?.organizationId,
          )
          .map((unit) => unit.id);
      case SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS:
      case SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT:
        return this.resolveBusinessUnitSubtreeIds(
          businessUnits,
          user.businessUnit.id,
        );
      case SecurityAccessLevel.BUSINESS_UNIT:
      case SecurityAccessLevel.TEAM:
      case SecurityAccessLevel.SELF:
      case SecurityAccessLevel.USER:
      case SecurityAccessLevel.NONE:
      default:
        return [user.businessUnit.id];
    }
  }

  buildSecuredWhereClause(
    user: AuthenticatedUser,
    entityKey: string,
    privilege: SecurityPrivilege,
  ): Record<string, unknown> {
    return buildScopedAccessWhere(user, entityKey, privilege);
  }

  private resolveAccessLevel(
    user: AuthenticatedUser,
    entityKey: string,
    privilege: SecurityPrivilege,
  ) {
    return resolveEffectiveAccessLevel(user, entityKey, privilege);
  }

  private resolveBusinessUnitSubtreeIds(
    businessUnits: Array<{
      id: string;
      parentBusinessUnitId: string | null;
    }>,
    rootBusinessUnitId: string,
  ) {
    const childMap = businessUnits.reduce<Record<string, string[]>>(
      (acc, item) => {
        const key = item.parentBusinessUnitId ?? 'root';
        acc[key] = acc[key] ?? [];
        acc[key].push(item.id);
        return acc;
      },
      {},
    );

    const queue = [rootBusinessUnitId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }

      visited.add(current);
      for (const childId of childMap[current] ?? []) {
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      }
    }

    return Array.from(visited);
  }
}
