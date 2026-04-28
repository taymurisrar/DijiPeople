import { Injectable, NotFoundException } from '@nestjs/common';
import {
  RoleAccessLevel,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type BusinessUnitAccessContext = {
  userId: string;
  tenantId: string;
  businessUnitId: string;
  organizationId: string;
  roleKeys: string[];
  roleAccessLevels: RoleAccessLevel[];
  effectiveAccessLevel: RoleAccessLevel;
  accessibleBusinessUnitIds: string[];
  accessibleUserIds: string[];
  requiresSelfScope: boolean;
};

const ACCESS_LEVEL_WEIGHT: Record<RoleAccessLevel, number> = {
  USER: 1,
  BUSINESS_UNIT: 2,
  PARENT_BU: 3,
  ORGANIZATION: 4,
  TENANT: 5,
};

@Injectable()
export class OrganizationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccessibleBusinessUnits(userId: string) {
    const context = await this.resolveBusinessUnitAccessContext(userId);
    return context.accessibleBusinessUnitIds;
  }

  async resolveBusinessUnitAccessContext(
    userId: string,
  ): Promise<BusinessUnitAccessContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        businessUnit: {
          select: {
            id: true,
            tenantId: true,
            organizationId: true,
            parentBusinessUnitId: true,
          },
        },
        userRoles: {
          include: {
            role: {
              select: {
                key: true,
                accessLevel: true,
                rolePrivileges: {
                  where: {
                    privilege: SecurityPrivilege.READ,
                    accessLevel: { not: SecurityAccessLevel.NONE },
                  },
                  select: {
                    accessLevel: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.businessUnit) {
      throw new NotFoundException('User or user business unit was not found.');
    }

    const roleKeys = user.userRoles.map((item) => item.role.key);
    const roleAccessLevels = user.userRoles.map((item) => item.role.accessLevel);
    const rolePrivilegeAccessLevels = user.userRoles.flatMap((item) =>
      item.role.rolePrivileges.map((privilege) =>
        this.securityAccessLevelToRoleAccessLevel(privilege.accessLevel),
      ),
    );
    const effectiveAccessLevel = this.resolveEffectiveAccessLevel(
      roleKeys,
      [...roleAccessLevels, ...rolePrivilegeAccessLevels],
    );

    const businessUnits = await this.prisma.businessUnit.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        organizationId: true,
        parentBusinessUnitId: true,
      },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });

    const accessibleBusinessUnitIds = this.resolveAccessibleBusinessUnitIds(
      businessUnits,
      user.businessUnit.id,
      user.businessUnit.organizationId,
      effectiveAccessLevel,
    );

    const accessibleUsers = await this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        businessUnitId: { in: accessibleBusinessUnitIds },
      },
      select: { id: true },
    });

    return {
      userId: user.id,
      tenantId: user.tenantId,
      businessUnitId: user.businessUnit.id,
      organizationId: user.businessUnit.organizationId,
      roleKeys,
      roleAccessLevels,
      effectiveAccessLevel,
      accessibleBusinessUnitIds,
      accessibleUserIds: accessibleUsers.map((item) => item.id),
      requiresSelfScope: effectiveAccessLevel === RoleAccessLevel.USER,
    };
  }

  private resolveEffectiveAccessLevel(
    roleKeys: string[],
    roleAccessLevels: RoleAccessLevel[],
  ) {
    if (roleKeys.includes('system-admin')) {
      return RoleAccessLevel.TENANT;
    }

    if (roleAccessLevels.length === 0) {
      return RoleAccessLevel.USER;
    }

    return roleAccessLevels.reduce((best, current) => {
      if (ACCESS_LEVEL_WEIGHT[current] > ACCESS_LEVEL_WEIGHT[best]) {
        return current;
      }
      return best;
    }, RoleAccessLevel.USER);
  }

  private securityAccessLevelToRoleAccessLevel(accessLevel: SecurityAccessLevel) {
    switch (accessLevel) {
      case SecurityAccessLevel.TENANT:
        return RoleAccessLevel.TENANT;
      case SecurityAccessLevel.ORGANIZATION:
        return RoleAccessLevel.ORGANIZATION;
      case SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS:
        return RoleAccessLevel.PARENT_BU;
      case SecurityAccessLevel.BUSINESS_UNIT:
        return RoleAccessLevel.BUSINESS_UNIT;
      case SecurityAccessLevel.USER:
      case SecurityAccessLevel.NONE:
      default:
        return RoleAccessLevel.USER;
    }
  }

  private resolveAccessibleBusinessUnitIds(
    businessUnits: Array<{
      id: string;
      organizationId: string;
      parentBusinessUnitId: string | null;
    }>,
    userBusinessUnitId: string,
    userOrganizationId: string,
    accessLevel: RoleAccessLevel,
  ) {
    switch (accessLevel) {
      case RoleAccessLevel.TENANT:
        return businessUnits.map((item) => item.id);
      case RoleAccessLevel.ORGANIZATION:
        return businessUnits
          .filter((item) => item.organizationId === userOrganizationId)
          .map((item) => item.id);
      case RoleAccessLevel.PARENT_BU:
        return this.resolveBusinessUnitSubtreeIds(businessUnits, userBusinessUnitId);
      case RoleAccessLevel.BUSINESS_UNIT:
      case RoleAccessLevel.USER:
      default:
        return [userBusinessUnitId];
    }
  }

  private resolveBusinessUnitSubtreeIds(
    businessUnits: Array<{
      id: string;
      parentBusinessUnitId: string | null;
    }>,
    rootBusinessUnitId: string,
  ) {
    const childMap = businessUnits.reduce<Record<string, string[]>>((acc, item) => {
      const parentKey = item.parentBusinessUnitId ?? 'root';
      acc[parentKey] = acc[parentKey] ?? [];
      acc[parentKey].push(item.id);
      return acc;
    }, {});

    const queue = [rootBusinessUnitId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }

      visited.add(current);
      const children = childMap[current] ?? [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      }
    }

    return Array.from(visited);
  }
}
