import { Injectable, UnauthorizedException } from '@nestjs/common';
import { FOUNDATION_PERMISSION_DEFINITIONS } from '../../common/constants/permissions';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuthAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async loadAccessContext(userId: string, expectedTenantId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        },
        businessUnit: {
          include: {
            organization: {
              select: { id: true, name: true },
            },
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            middleName: true,
            lastName: true,
            managerEmployeeId: true,
            businessUnitId: true,
          },
        },
        userPermissions: {
          include: { permission: true },
        },
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

    const tenantStatus = user?.tenant?.status
      ? String(user.tenant.status).toUpperCase()
      : null;

    if (
      !user ||
      (expectedTenantId && user.tenantId !== expectedTenantId) ||
      user.status !== 'ACTIVE' ||
      tenantStatus !== 'ACTIVE'
    ) {
      throw new UnauthorizedException(
        'Your session expired. Please sign in again to continue.',
      );
    }

    const directRoles = user.userRoles
      .map((userRole) => userRole.role)
      .filter((role) => role.isActive);
    const teamRoles = user.teamMemberships.flatMap((membership) =>
      membership.team.isActive
        ? membership.team.teamRoles
            .map((teamRole) => teamRole.role)
            .filter((role) => role.isActive)
        : [],
    );
    const effectiveRolesById = new Map(
      [...directRoles, ...teamRoles].map((role) => [role.id, role]),
    );
    const effectiveRoles = Array.from(effectiveRolesById.values());

    const roles = effectiveRoles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      type: role.isSystem ? 'SYSTEM' : 'CUSTOM',
      isSystem: role.isSystem,
    }));
    const roleIds = roles.map((role) => role.id);
    const roleKeys = roles.map((role) => role.key);
    const permissionKeys = Array.from(
      new Set([
        ...user.userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.map(
            (rolePermission) => rolePermission.permission.key,
          ),
        ),
        ...effectiveRoles.flatMap((role) =>
          role.rolePermissions.map(
            (rolePermission) => rolePermission.permission.key,
          ),
        ),
        ...effectiveRoles.flatMap((role) =>
          role.rolePrivileges
            .filter((privilege) => privilege.accessLevel !== 'NONE')
            .map(
              (privilege) =>
                `${privilege.entityKey}.${privilege.privilege.toLowerCase()}`,
            ),
        ),
        ...effectiveRoles.flatMap((role) =>
          role.miscPermissions
            .filter((permission) => permission.enabled)
            .map((permission) => permission.permissionKey),
        ),
        ...user.userPermissions.map(
          (userPermission) => userPermission.permission.key,
        ),
      ]),
    );
    const isTenantOwner = user.tenant.ownerUserId === user.id;
    const isSystemAdministrator = roleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN);
    const isSystemCustomizer = roleKeys.includes(ROLE_KEYS.SYSTEM_CUSTOMIZER);
    const teamIds = user.teamMemberships.map((membership) => membership.teamId);
    const rolePrivileges = effectiveRoles.flatMap((role) =>
      role.rolePrivileges.map((privilege) => ({
        entityKey: privilege.entityKey,
        privilege: privilege.privilege,
        accessLevel: privilege.accessLevel,
        roleId: role.id,
      })),
    );
    const miscPermissions = effectiveRoles.flatMap((role) =>
      role.miscPermissions
        .filter((permission) => permission.enabled)
        .map((permission) => permission.permissionKey),
    );
    const businessUnitAccess = await this.resolveBusinessUnitAccess(
      user.tenantId,
      user.businessUnitId,
      user.businessUnit.organizationId,
      isTenantOwner || isSystemAdministrator,
    );

    const authUser: AuthenticatedUser = {
      userId: user.id,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleIds,
      roleKeys,
      permissionKeys,
      rolePrivileges,
      miscPermissions,
      accessContext: {
        isSystemAdministrator,
        isSystemCustomizer,
        isTenantOwner,
        businessUnitId: user.businessUnitId,
        organizationId: user.businessUnit.organizationId,
        teamIds,
        accessibleBusinessUnitIds: businessUnitAccess.accessibleBusinessUnitIds,
        businessUnitSubtreeIds: businessUnitAccess.businessUnitSubtreeIds,
        canAccessAllBusinessUnits: isTenantOwner || isSystemAdministrator,
      },
    };

    return {
      authUser,
      response: {
        user: {
          id: user.id,
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          tenantId: user.tenantId,
          employeeId: user.employee?.id ?? null,
          isTenantOwner,
          roleIds,
          roleKeys,
          roles,
          permissionKeys,
          rolePrivileges,
          miscPermissions,
          availablePermissionKeys: FOUNDATION_PERMISSION_DEFINITIONS.map(
            (permission) => permission.key,
          ),
        },
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          status: user.tenant.status,
        },
        employee: user.employee
          ? {
              id: user.employee.id,
              employeeCode: user.employee.employeeCode,
              fullName: [
                user.employee.firstName,
                user.employee.middleName,
                user.employee.lastName,
              ]
                .filter(Boolean)
                .join(' '),
              reportingManagerEmployeeId: user.employee.managerEmployeeId,
              businessUnitId: user.employee.businessUnitId,
            }
          : null,
        roles,
        permissions: permissionKeys,
        accessContext: authUser.accessContext,
      },
    };
  }

  private async resolveBusinessUnitAccess(
    tenantId: string,
    userBusinessUnitId: string,
    userOrganizationId: string,
    canAccessAllBusinessUnits: boolean,
  ) {
    const businessUnits = await this.prisma.businessUnit.findMany({
      where: { tenantId },
      select: {
        id: true,
        organizationId: true,
        parentBusinessUnitId: true,
      },
    });

    const accessibleBusinessUnitIds = (
      canAccessAllBusinessUnits
        ? businessUnits
        : businessUnits.filter(
            (businessUnit) =>
              businessUnit.organizationId === userOrganizationId,
          )
    ).map((businessUnit) => businessUnit.id);

    return {
      accessibleBusinessUnitIds:
        accessibleBusinessUnitIds.length > 0
          ? accessibleBusinessUnitIds
          : [userBusinessUnitId],
      businessUnitSubtreeIds: this.resolveBusinessUnitSubtreeIds(
        businessUnits,
        userBusinessUnitId,
      ),
    };
  }

  private resolveBusinessUnitSubtreeIds(
    businessUnits: Array<{ id: string; parentBusinessUnitId: string | null }>,
    rootBusinessUnitId: string,
  ) {
    const childMap = businessUnits.reduce<Record<string, string[]>>(
      (acc, businessUnit) => {
        const key = businessUnit.parentBusinessUnitId ?? 'root';
        acc[key] = acc[key] ?? [];
        acc[key].push(businessUnit.id);
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
        queue.push(childId);
      }
    }

    return Array.from(visited);
  }
}
