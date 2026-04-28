import { Injectable } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import {
  SECURITY_ACCESS_LEVEL_WEIGHT,
} from '../../common/constants/rbac-matrix';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';

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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: { select: { ownerUserId: true } },
        userRoles: {
          include: {
            role: {
              include: {
                rolePrivileges: true,
                miscPermissions: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return {
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

    for (const userRole of user.userRoles) {
      for (const rolePrivilege of userRole.role.rolePrivileges) {
        const key = `${rolePrivilege.entityKey}:${rolePrivilege.privilege}`;
        const current = effectiveByKey.get(key);

        if (
          !current ||
          SECURITY_ACCESS_LEVEL_WEIGHT[rolePrivilege.accessLevel] >
            SECURITY_ACCESS_LEVEL_WEIGHT[current.accessLevel]
        ) {
          effectiveByKey.set(key, {
            entityKey: rolePrivilege.entityKey,
            privilege: rolePrivilege.privilege,
            accessLevel: rolePrivilege.accessLevel,
          });
        }
      }

      for (const permission of userRole.role.miscPermissions) {
        if (permission.enabled) {
          miscPermissions.add(permission.permissionKey);
        }
      }
    }

    return {
      privileges: Array.from(effectiveByKey.values()),
      miscPermissions: Array.from(miscPermissions),
    };
  }

  canAccessRecord(
    user: AuthenticatedUser,
    entityKey: string,
    privilege: SecurityPrivilege,
    record: SecuredRecord,
  ) {
    if (user.tenantId !== record.tenantId) {
      return false;
    }

    const accessLevel = this.resolveAccessLevel(user, entityKey, privilege);
    if (accessLevel === SecurityAccessLevel.NONE) {
      return false;
    }

    if (accessLevel === SecurityAccessLevel.TENANT) {
      return true;
    }

    if (accessLevel === SecurityAccessLevel.USER) {
      return (
        record.ownerUserId === user.userId ||
        record.createdById === user.userId
      );
    }

    if (
      accessLevel === SecurityAccessLevel.ORGANIZATION &&
      record.organizationId &&
      user.accessContext?.organizationId === record.organizationId
    ) {
      return true;
    }

    return Boolean(
      record.businessUnitId &&
        user.accessContext?.businessUnitId === record.businessUnitId,
    );
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
        return this.resolveBusinessUnitSubtreeIds(
          businessUnits,
          user.businessUnit.id,
        );
      case SecurityAccessLevel.BUSINESS_UNIT:
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
    const accessLevel = this.resolveAccessLevel(user, entityKey, privilege);

    if (accessLevel === SecurityAccessLevel.NONE) {
      return { id: '__no_access__' };
    }

    if (accessLevel === SecurityAccessLevel.TENANT) {
      return { tenantId: user.tenantId };
    }

    if (accessLevel === SecurityAccessLevel.USER) {
      return {
        tenantId: user.tenantId,
        OR: [{ ownerUserId: user.userId }, { createdById: user.userId }],
      };
    }

    if (accessLevel === SecurityAccessLevel.ORGANIZATION) {
      return {
        tenantId: user.tenantId,
        organizationId: user.accessContext?.organizationId,
      };
    }

    return {
      tenantId: user.tenantId,
      businessUnitId: user.accessContext?.businessUnitId,
    };
  }

  private resolveAccessLevel(
    user: AuthenticatedUser,
    entityKey: string,
    privilege: SecurityPrivilege,
  ) {
    let best: SecurityAccessLevel = SecurityAccessLevel.NONE;

    for (const rolePrivilege of user.rolePrivileges ?? []) {
      if (
        rolePrivilege.entityKey !== entityKey ||
        rolePrivilege.privilege !== privilege
      ) {
        continue;
      }

      if (
        SECURITY_ACCESS_LEVEL_WEIGHT[rolePrivilege.accessLevel] >
        SECURITY_ACCESS_LEVEL_WEIGHT[best]
      ) {
        best = rolePrivilege.accessLevel;
      }
    }

    return best;
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
