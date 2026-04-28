import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;
type UserCreateInput = Omit<
  Prisma.UserUncheckedCreateInput,
  'businessUnitId'
> & {
  businessUnitId?: string;
};

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
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
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
                rolePrivileges: true,
                miscPermissions: true,
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
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
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
                rolePrivileges: true,
                miscPermissions: true,
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
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
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
                rolePrivileges: true,
                miscPermissions: true,
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
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
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
                rolePrivileges: true,
                miscPermissions: true,
              },
            },
          },
        },
      },
    });
  }

  create(data: UserCreateInput, db: PrismaDb = this.prisma) {
    return this.createWithDefaultBusinessUnit(data, db);
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

  findBusinessUnitById(
    tenantId: string,
    businessUnitId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.businessUnit.findFirst({
      where: {
        id: businessUnitId,
        tenantId,
      },
      select: {
        id: true,
      },
    });
  }

  private async createWithDefaultBusinessUnit(
    data: UserCreateInput,
    db: PrismaDb,
  ) {
    const businessUnitId =
      data.businessUnitId ??
      (await this.ensureTenantDefaultBusinessUnitId(data.tenantId, db));

    return db.user.create({
      data: {
        ...data,
        businessUnitId,
      },
    });
  }

  private async ensureTenantDefaultBusinessUnitId(
    tenantId: string,
    db: PrismaDb,
  ) {
    const existingBusinessUnit = await db.businessUnit.findFirst({
      where: { tenantId },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });

    if (existingBusinessUnit) {
      return existingBusinessUnit.id;
    }

    const organization =
      (await db.organization.findFirst({
        where: { tenantId },
        orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
        select: { id: true },
      })) ??
      (await db.organization.create({
        data: {
          tenantId,
          name: 'Default Organization',
        },
        select: { id: true },
      }));

    const businessUnit = await db.businessUnit.create({
      data: {
        tenantId,
        organizationId: organization.id,
        name: 'Default Business Unit',
      },
      select: { id: true },
    });

    return businessUnit.id;
  }
}
