import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(tenantId: string, db: PrismaDb = this.prisma) {
    return db.role.findMany({
      where: { tenantId },
      include: {
        userRoles: {
          select: {
            userId: true,
          },
        },
        rolePermissions: {
          include: {
            permission: true,
          },
        },
        rolePrivileges: true,
        miscPermissions: true,
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  findByIdAndTenant(
    tenantId: string,
    roleId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.role.findFirst({
      where: { id: roleId, tenantId },
      include: {
        userRoles: {
          select: {
            userId: true,
          },
        },
        rolePermissions: {
          include: {
            permission: true,
          },
        },
        rolePrivileges: true,
        miscPermissions: true,
      },
    });
  }

  findByIds(tenantId: string, roleIds: string[], db: PrismaDb = this.prisma) {
    return db.role.findMany({
      where: {
        tenantId,
        id: { in: roleIds },
      },
      include: {
        rolePrivileges: true,
        miscPermissions: true,
      },
    });
  }

  findByKeyAndTenant(
    tenantId: string,
    key: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.role.findFirst({
      where: {
        tenantId,
        key,
      },
    });
  }

  create(data: Prisma.RoleUncheckedCreateInput, db: PrismaDb = this.prisma) {
    return db.role.create({ data });
  }

  update(
    roleId: string,
    data: Prisma.RoleUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.role.update({
      where: { id: roleId },
      data,
    });
  }

  delete(roleId: string, db: PrismaDb = this.prisma) {
    return db.role.delete({
      where: { id: roleId },
    });
  }

  async replacePermissions(
    tenantId: string,
    roleId: string,
    permissionIds: string[],
    createdById: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.rolePermission.deleteMany({
      where: { roleId },
    });

    if (permissionIds.length > 0) {
      await db.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          tenantId,
          roleId,
          permissionId,
          createdById,
        })),
      });
    }

    return this.findByIdAndTenant(tenantId, roleId, db);
  }

  async replaceMatrix(
    tenantId: string,
    roleId: string,
    privileges: Array<{
      entityKey: string;
      privilege: Prisma.RolePrivilegeUncheckedCreateInput['privilege'];
      accessLevel: Prisma.RolePrivilegeUncheckedCreateInput['accessLevel'];
    }>,
    miscPermissions: Array<{ permissionKey: string; enabled: boolean }>,
    actorId: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.rolePrivilege.deleteMany({ where: { tenantId, roleId } });
    await db.roleMiscPermission.deleteMany({ where: { tenantId, roleId } });

    if (privileges.length > 0) {
      await db.rolePrivilege.createMany({
        data: privileges.map((item) => ({
          tenantId,
          roleId,
          entityKey: item.entityKey,
          privilege: item.privilege,
          accessLevel: item.accessLevel,
          createdById: actorId,
          updatedById: actorId,
        })),
        skipDuplicates: true,
      });
    }

    if (miscPermissions.length > 0) {
      await db.roleMiscPermission.createMany({
        data: miscPermissions.map((item) => ({
          tenantId,
          roleId,
          permissionKey: item.permissionKey,
          enabled: item.enabled,
          createdById: actorId,
          updatedById: actorId,
        })),
        skipDuplicates: true,
      });
    }

    return this.findByIdAndTenant(tenantId, roleId, db);
  }
}
