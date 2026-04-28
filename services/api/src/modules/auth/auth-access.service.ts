import { Injectable, UnauthorizedException } from '@nestjs/common';
import { FOUNDATION_PERMISSION_DEFINITIONS } from '../../common/constants/permissions';
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

    const roles = user.userRoles.map((userRole) => ({
      id: userRole.role.id,
      key: userRole.role.key,
      name: userRole.role.name,
      type: userRole.role.isSystem ? 'SYSTEM' : 'CUSTOM',
      isSystem: userRole.role.isSystem,
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
        ...user.userRoles.flatMap((userRole) =>
          userRole.role.rolePrivileges
            .filter((privilege) => privilege.accessLevel !== 'NONE')
            .map(
              (privilege) =>
                `${privilege.entityKey}.${privilege.privilege.toLowerCase()}`,
            ),
        ),
        ...user.userRoles.flatMap((userRole) =>
          userRole.role.miscPermissions
            .filter((permission) => permission.enabled)
            .map((permission) => permission.permissionKey),
        ),
        ...user.userPermissions.map(
          (userPermission) => userPermission.permission.key,
        ),
      ]),
    );
    const isTenantOwner = user.tenant.ownerUserId === user.id;
    const isSystemAdministrator = roleKeys.includes('system-admin');
    const isSystemCustomizer = roleKeys.includes('system-customizer');
    const rolePrivileges = user.userRoles.flatMap((userRole) =>
      userRole.role.rolePrivileges.map((privilege) => ({
        entityKey: privilege.entityKey,
        privilege: privilege.privilege,
        accessLevel: privilege.accessLevel,
        roleId: userRole.role.id,
      })),
    );
    const miscPermissions = user.userRoles.flatMap((userRole) =>
      userRole.role.miscPermissions
        .filter((permission) => permission.enabled)
        .map((permission) => permission.permissionKey),
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
}
