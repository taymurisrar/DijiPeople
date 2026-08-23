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
  legacyPermissionToMatrixPrivileges,
  legacyRoleAccessLevelToSecurityAccessLevel,
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

    /*
     * Written as one insert plus a handful of grouped updates, not as an upsert
     * per assignment.
     *
     * A tenant's system roles carry **6,345** privilege rows. The loop that used
     * to be here issued one `upsert` per row, sequentially, inside the caller's
     * interactive transaction — and Prisma's default interactive transaction
     * timeout is five seconds. Self-service provisioning therefore failed with
     * `A query cannot be executed on an expired transaction ... 5001 ms passed`,
     * after the customer's card had already been charged: the outbox retried
     * eight times, marked `PROVISIONING_REQUESTED` FAILED, and left a paid order
     * with no workspace. It succeeded only when the machine happened to be fast
     * enough, which is why it reached production looking healthy.
     *
     * `createMany` writes every missing row in one statement, exactly as the
     * `rolePermission` block above already does. The updates that follow exist
     * only for the re-bootstrap case — a tenant whose rows predate a change to
     * `SYSTEM_ROLE_PRIVILEGES` — and are grouped by the three values that vary,
     * so drift is reconciled in a few dozen statements rather than thousands.
     * On a new tenant every row is an insert and no update runs at all.
     */
    if (rolePrivilegeAssignments.length > 0) {
      await db.rolePrivilege.createMany({
        data: rolePrivilegeAssignments,
        skipDuplicates: true,
      });

      const drift = new Map<
        string,
        {
          roleId: string;
          privilege: SecurityPrivilege;
          accessLevel: (typeof rolePrivilegeAssignments)[number]['accessLevel'];
          updatedById: string | null | undefined;
          entityKeys: string[];
        }
      >();

      for (const assignment of rolePrivilegeAssignments) {
        const key = `${assignment.roleId}|${assignment.privilege}|${String(assignment.accessLevel)}`;
        const group = drift.get(key);
        if (group) group.entityKeys.push(assignment.entityKey);
        else
          drift.set(key, {
            roleId: assignment.roleId,
            privilege: assignment.privilege,
            accessLevel: assignment.accessLevel,
            updatedById: assignment.updatedById,
            entityKeys: [assignment.entityKey],
          });
      }

      for (const group of drift.values()) {
        await db.rolePrivilege.updateMany({
          where: {
            tenantId,
            roleId: group.roleId,
            privilege: group.privilege,
            entityKey: { in: group.entityKeys },
            accessLevel: { not: group.accessLevel },
          },
          data: {
            accessLevel: group.accessLevel,
            updatedById: group.updatedById,
          },
        });
      }
    }

    // Custom roles may predate matrix permissions. Preserve their legacy
    // capability by creating only absent matrix rows; an explicit matrix row,
    // including NONE, is never overwritten.
    const customRoles = await db.role.findMany({
      where: { tenantId, isSystem: false, isActive: true },
      include: {
        rolePermissions: {
          include: { permission: { select: { key: true } } },
        },
        miscPermissions: {
          where: { enabled: true },
          select: { permissionKey: true },
        },
      },
    });
    const customRolePrivilegeAssignments = customRoles.flatMap((role) => {
      const permissionKeys = new Set([
        ...role.rolePermissions.map((item) => item.permission.key),
        ...role.miscPermissions.map((item) => item.permissionKey),
      ]);
      const accessLevel = legacyRoleAccessLevelToSecurityAccessLevel(
        role.accessLevel,
      );

      return Array.from(permissionKeys).flatMap((permissionKey) =>
        legacyPermissionToMatrixPrivileges(permissionKey).map(
          (requirement) => ({
            tenantId,
            roleId: role.id,
            entityKey: requirement.entityKey,
            privilege: requirement.privilege,
            accessLevel,
            createdById: actorUserId,
            updatedById: actorUserId,
          }),
        ),
      );
    });

    if (customRolePrivilegeAssignments.length > 0) {
      await db.rolePrivilege.createMany({
        data: customRolePrivilegeAssignments,
        skipDuplicates: true,
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
