import { Injectable, UnauthorizedException } from '@nestjs/common';
import { FOUNDATION_PERMISSION_DEFINITIONS } from '../../common/constants/permissions';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hasElevatedTenantRole } from '../../common/security/elevated-tenant-roles';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
import { buildDirectPermissionPrivileges } from './direct-permission-privileges';

/*
 * A terminated employee whose termination date has arrived has no access, whether
 * or not the sweeper has disabled the user yet. The tenant owner is exempt for the
 * same reason the sweeper skips them: ownership must be transferred first.
 */
export function isPastEffectiveTermination(user: {
  id: string;
  tenant?: { ownerUserId?: string | null } | null;
  employee?: { employmentStatus: unknown; terminationDate: Date | null } | null;
}) {
  const employee = user.employee;
  if (!employee || employee.employmentStatus !== 'TERMINATED') return false;
  if (
    !employee.terminationDate ||
    employee.terminationDate.getTime() > Date.now()
  ) {
    return false;
  }
  return user.tenant?.ownerUserId !== user.id;
}

@Injectable()
export class AuthAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async loadPlatformAccessContext(platformUserId: string) {
    const user = await this.prisma.platformUser.findUnique({
      where: { id: platformUserId },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Your admin session expired. Please sign in again to continue.',
      );
    }

    const { roleKeys, permissionKeys } = platformAccessForRole(user.role);

    const authUser: AuthenticatedUser = {
      userId: user.id,
      tenantId: 'platform',
      tenantName: 'DijiPeople Platform',
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleIds: [user.role],
      roleKeys,
      permissionKeys,
      platform: {
        id: user.id,
        role: user.role,
        status: user.status,
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
          role: user.role,
          roleIds: [user.role],
          roleKeys,
          permissionKeys,
        },
        tenant: {
          id: 'platform',
          name: 'DijiPeople Platform',
          slug: 'platform',
          status: 'ACTIVE',
        },
        roles: [{ id: user.role, key: user.role, name: user.role }],
        permissions: permissionKeys,
      },
    };
  }

  async loadAccessContext(
    userId: string,
    expectedTenantId?: string,
    options: { includeEmployee?: boolean } = {},
  ) {
    // The request guard reads only `authUser`; the employee row feeds the
    // `response` object that /auth/me and login return. Skipping it there saves
    // a statement on every authenticated request (BUG-3165), and the query budget
    // test (auth-query-budget.e2e-spec.ts, ceiling 25) holds that line.
    //
    // The same read carries employmentStatus and terminationDate, so login, token
    // refresh and /auth/me refuse a terminated employee on the effective date. The
    // per-request guard path does NOT read it; it relies on the sweeper having
    // disabled the user (AccessRevocationSweeperWorker, every minute by default).
    const includeEmployee = options.includeEmployee ?? true;
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
        // Only the organization id is read (BUG-3165): loading the organization
        // relation cost a second statement for nothing.
        businessUnit: { select: { organizationId: true } },
        // employmentStatus/terminationDate are read on every request so a
        // terminated employee loses access ON the effective date even if the
        // revocation sweeper has not run yet.
        ...(includeEmployee
          ? {
              employee: {
                select: {
                  employmentStatus: true,
                  terminationDate: true,
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  middleName: true,
                  lastName: true,
                  managerEmployeeId: true,
                  businessUnitId: true,
                },
              },
            }
          : {}),
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
      tenantStatus !== 'ACTIVE' ||
      isPastEffectiveTermination(user)
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
    const isTenantOwner = user.tenant.ownerUserId === user.id;
    const isSystemAdministrator = roleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN);
    const isSystemCustomizer = roleKeys.includes(ROLE_KEYS.SYSTEM_CUSTOMIZER);
    const hasTenantWideOperationalAccess = hasElevatedTenantRole({ roleKeys });
    const permissionKeys = Array.from(
      new Set([
        ...(hasTenantWideOperationalAccess || isTenantOwner
          ? FOUNDATION_PERMISSION_DEFINITIONS.map(
              (permission) => permission.key,
            )
          : []),
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
    const teamIds = user.teamMemberships.map((membership) => membership.teamId);
    const rolePrivileges = [
      ...effectiveRoles.flatMap((role) =>
        role.rolePrivileges.map((privilege) => ({
          entityKey: privilege.entityKey,
          privilege: privilege.privilege,
          accessLevel: privilege.accessLevel,
          roleId: role.id,
        })),
      ),
      ...buildDirectPermissionPrivileges(
        user.userPermissions.map(
          (userPermission) => userPermission.permission.key,
        ),
        effectiveRoles,
      ),
    ];
    const miscPermissions = effectiveRoles.flatMap((role) =>
      role.miscPermissions
        .filter((permission) => permission.enabled)
        .map((permission) => permission.permissionKey),
    );
    const businessUnitAccess = await this.resolveBusinessUnitAccess(
      user.tenantId,
      user.businessUnitId,
      user.businessUnit?.organizationId ?? null,
      isTenantOwner || hasTenantWideOperationalAccess,
    );
    const defaultBusinessUnitId =
      user.businessUnitId ?? businessUnitAccess.accessibleBusinessUnitIds[0];
    const defaultOrganizationId =
      user.businessUnit?.organizationId ??
      businessUnitAccess.defaultOrganizationId;

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
        businessUnitId: defaultBusinessUnitId,
        organizationId: defaultOrganizationId,
        teamIds,
        accessibleBusinessUnitIds: businessUnitAccess.accessibleBusinessUnitIds,
        businessUnitSubtreeIds: businessUnitAccess.businessUnitSubtreeIds,
        canAccessAllBusinessUnits:
          isTenantOwner || hasTenantWideOperationalAccess,
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
    userBusinessUnitId: string | null,
    userOrganizationId: string | null,
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
    const defaultBusinessUnitId =
      userBusinessUnitId ??
      accessibleBusinessUnitIds[0] ??
      businessUnits[0]?.id;

    return {
      accessibleBusinessUnitIds:
        accessibleBusinessUnitIds.length > 0
          ? accessibleBusinessUnitIds
          : defaultBusinessUnitId
            ? [defaultBusinessUnitId]
            : [],
      businessUnitSubtreeIds: this.resolveBusinessUnitSubtreeIds(
        businessUnits,
        defaultBusinessUnitId,
      ),
      defaultOrganizationId:
        userOrganizationId ??
        businessUnits.find(
          (businessUnit) => businessUnit.id === defaultBusinessUnitId,
        )?.organizationId ??
        businessUnits[0]?.organizationId ??
        '',
    };
  }

  private resolveBusinessUnitSubtreeIds(
    businessUnits: Array<{ id: string; parentBusinessUnitId: string | null }>,
    rootBusinessUnitId: string | null | undefined,
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
    const queue = rootBusinessUnitId ? [rootBusinessUnitId] : [];
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
