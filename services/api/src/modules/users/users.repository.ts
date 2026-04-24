import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(tenantId: string, db: PrismaDb = this.prisma) {
    return db.user.findMany({
      where: { tenantId },
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
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  findByTenantSlugAndEmail(
    tenantSlug: string,
    email: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        tenant: {
          slug: tenantSlug.trim(),
        },
      },
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
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  findByEmail(email: string, db: PrismaDb = this.prisma) {
    return db.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
      },
    });
  }

  findByEmailWithAccess(email: string, db: PrismaDb = this.prisma) {
    return db.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
      },
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
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  findByIdWithAccess(id: string, db: PrismaDb = this.prisma) {
    return db.user.findUnique({
      where: { id },
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
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  create(data: Prisma.UserUncheckedCreateInput, db: PrismaDb = this.prisma) {
    return db.user.create({ data });
  }

  update(
    userId: string,
    data: Prisma.UserUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.user.update({
      where: { id: userId },
      data,
    });
  }

  delete(userId: string, db: PrismaDb = this.prisma) {
    return db.user.delete({
      where: { id: userId },
    });
  }

  markLastLogin(userId: string, db: PrismaDb = this.prisma) {
    return db.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async replaceRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
    createdById: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.userRole.deleteMany({
      where: { userId },
    });

    if (roleIds.length > 0) {
      await db.userRole.createMany({
        data: roleIds.map((roleId) => ({
          tenantId,
          userId,
          roleId,
          createdById,
        })),
      });
    }

    return this.findByIdWithAccess(userId, db);
  }

  async replaceDirectPermissions(
    tenantId: string,
    userId: string,
    permissionIds: string[],
    createdById: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.userPermission.deleteMany({
      where: { tenantId, userId },
    });

    if (permissionIds.length > 0) {
      await db.userPermission.createMany({
        data: permissionIds.map((permissionId) => ({
          tenantId,
          userId,
          permissionId,
          createdById,
        })),
        skipDuplicates: true,
      });
    }

    return this.findByIdWithAccess(userId, db);
  }

  async findTenantOwnerUserId(tenantId: string, db: PrismaDb = this.prisma) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        ownerUserId: true,
      },
    });

    return tenant?.ownerUserId ?? null;
  }
}
