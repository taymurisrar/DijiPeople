import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BASE_ROLE_DEFINITIONS,
  BASE_ROLE_PERMISSION_KEYS,
  FOUNDATION_PERMISSION_DEFINITIONS,
} from '../../common/constants/permissions';
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
      data: BASE_ROLE_DEFINITIONS.map((role) => ({
        tenantId,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        accessLevel: role.accessLevel,
        createdById: actorUserId,
        updatedById: actorUserId,
      })),
      skipDuplicates: true,
    });

    await Promise.all(
      BASE_ROLE_DEFINITIONS.map((role) =>
        db.role.updateMany({
          where: {
            tenantId,
            key: role.key,
          },
          data: {
            accessLevel: role.accessLevel,
            updatedById: actorUserId,
          },
        }),
      ),
    );

    const [permissions, roles] = await Promise.all([
      db.permission.findMany({
        where: {
          tenantId,
          key: {
            in: FOUNDATION_PERMISSION_DEFINITIONS.map(
              (permission) => permission.key,
            ),
          },
        },
      }),
      db.role.findMany({
        where: {
          tenantId,
          key: {
            in: BASE_ROLE_DEFINITIONS.map((role) => role.key),
          },
        },
      }),
    ]);

    const permissionByKey = new Map(
      permissions.map((permission) => [permission.key, permission]),
    );

    const rolePermissionAssignments = roles.flatMap((role) => {
      const permissionKeys =
        BASE_ROLE_PERMISSION_KEYS[
          role.key as keyof typeof BASE_ROLE_PERMISSION_KEYS
        ] ?? [];

      return permissionKeys.reduce<
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

    await db.rolePermission.createMany({
      data: rolePermissionAssignments,
      skipDuplicates: true,
    });

    return {
      permissions,
      roles,
    };
  }
}
