import { Injectable } from '@nestjs/common';
import {
  Prisma,
  RoleType,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { FOUNDATION_PERMISSION_DEFINITIONS } from '../../common/constants/permissions';
import {
  SYSTEM_ROLE_DEFINITIONS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
  matrixPrivilegeToPermissionKey,
} from '../../common/constants/rbac-matrix';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PermissionBootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrapTenantRbac(
    tenantId: string,
    db: PrismaDb = this.prisma,
    actorUserId?: string,
  ) {
    await db.permission.createMany({
      data: FOUNDATION_PERMISSION_DEFINITIONS.map((permission) => ({
        tenantId,
        key: permission.key,
        name: permission.name,
        description: permission.description,
        createdById: actorUserId,
        updatedById: actorUserId,
      })),
      skipDuplicates: true,
    });

    await db.role.createMany({
      data: SYSTEM_ROLE_DEFINITIONS.map((role) => ({
        tenantId,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
        roleType: RoleType.SYSTEM,
        isEditable: role.isEditable,
        isCloneable: true,
        accessLevel: role.accessLevel,
        createdById: actorUserId,
        updatedById: actorUserId,
      })),
      skipDuplicates: true,
    });

    for (const role of SYSTEM_ROLE_DEFINITIONS) {
      await db.role.updateMany({
        where: {
          tenantId,
          key: role.key,
        },
        data: {
          name: role.name,
          description: role.description,
          accessLevel: role.accessLevel,
          isSystem: true,
          roleType: RoleType.SYSTEM,
          isEditable: role.isEditable,
          isCloneable: true,
          isActive: true,
          updatedById: actorUserId,
        },
      });
    }

    const permissions = await db.permission.findMany({
      where: {
        tenantId,
        key: {
          in: FOUNDATION_PERMISSION_DEFINITIONS.map(
            (permission) => permission.key,
          ),
        },
      },
    });

    const roles = await db.role.findMany({
      where: {
        tenantId,
        key: {
          in: SYSTEM_ROLE_DEFINITIONS.map((role) => role.key),
        },
      },
    });

    const permissionByKey = new Map(
      permissions.map((permission) => [permission.key, permission]),
    );

    const rolePermissionAssignments = roles.flatMap((role) => {
      const roleMatrix =
        SYSTEM_ROLE_PRIVILEGES[
          role.key as keyof typeof SYSTEM_ROLE_PRIVILEGES
        ] ?? {};

      const permissionKeys = new Set<string>();

      for (const [matrixKey, accessLevel] of Object.entries(roleMatrix)) {
        if (accessLevel === SecurityAccessLevel.NONE) {
          continue;
        }

        const [entityKey, privilegeKey] = matrixKey.split(':');

        if (!entityKey || !privilegeKey) {
          continue;
        }

        permissionKeys.add(
          matrixPrivilegeToPermissionKey(
            entityKey,
            privilegeKey as SecurityPrivilege,
          ),
        );
      }

      for (const permissionKey of SYSTEM_ROLE_MISC_PERMISSIONS[
        role.key as keyof typeof SYSTEM_ROLE_MISC_PERMISSIONS
      ] ?? []) {
        permissionKeys.add(permissionKey);
      }

      return Array.from(permissionKeys).reduce<
        Array<{
          tenantId: string;
          roleId: string;
          permissionId: string;
          createdById: string | undefined;
        }>
      >((assignments, permissionKey) => {
        const permission = permissionByKey.get(permissionKey);

        if (!permission) {
          return assignments;
        }

        assignments.push({
          tenantId,
          roleId: role.id,
          permissionId: permission.id,
          createdById: actorUserId,
        });

        return assignments;
      }, []);
    });

    if (rolePermissionAssignments.length > 0) {
      await db.rolePermission.createMany({
        data: rolePermissionAssignments,
        skipDuplicates: true,
      });
    }

    const rolePrivilegeAssignments = roles.flatMap((role) => {
      const roleMatrix =
        SYSTEM_ROLE_PRIVILEGES[
          role.key as keyof typeof SYSTEM_ROLE_PRIVILEGES
        ] ?? {};

      return Object.entries(roleMatrix).flatMap(([matrixKey, accessLevel]) => {
        const [entityKey, privilegeKey] = matrixKey.split(':');

        if (!entityKey || !privilegeKey) {
          return [];
        }

        return {
          tenantId,
          roleId: role.id,
          entityKey,
          privilege: privilegeKey as SecurityPrivilege,
          accessLevel,
          createdById: actorUserId,
          updatedById: actorUserId,
        };
      });
    });

    for (const assignment of rolePrivilegeAssignments) {
      await db.rolePrivilege.upsert({
        where: {
          roleId_entityKey_privilege: {
            roleId: assignment.roleId,
            entityKey: assignment.entityKey,
            privilege: assignment.privilege,
          },
        },
        update: {
          accessLevel: assignment.accessLevel,
          updatedById: assignment.updatedById,
        },
        create: {
          tenantId: assignment.tenantId,
          roleId: assignment.roleId,
          entityKey: assignment.entityKey,
          privilege: assignment.privilege,
          accessLevel: assignment.accessLevel,
          createdById: assignment.createdById,
          updatedById: assignment.updatedById,
        },
      });
    }

    for (const role of roles) {
      const miscPermissionKeys =
        SYSTEM_ROLE_MISC_PERMISSIONS[
          role.key as keyof typeof SYSTEM_ROLE_MISC_PERMISSIONS
        ] ?? [];

      for (const permissionKey of miscPermissionKeys) {
        await db.roleMiscPermission.upsert({
          where: {
            roleId_permissionKey: {
              roleId: role.id,
              permissionKey,
            },
          },
          create: {
            tenantId,
            roleId: role.id,
            permissionKey,
            enabled: true,
            createdById: actorUserId,
            updatedById: actorUserId,
          },
          update: {
            enabled: true,
            updatedById: actorUserId,
          },
        });
      }
    }

    return {
      permissions,
      roles,
    };
  }
}
