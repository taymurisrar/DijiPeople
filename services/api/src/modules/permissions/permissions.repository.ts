import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PermissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(tenantId: string, db: PrismaDb = this.prisma) {
    return db.permission.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, permissionId: string, db: PrismaDb = this.prisma) {
    return db.permission.findFirst({
      where: {
        id: permissionId,
        tenantId,
      },
    });
  }

  findByIds(
    tenantId: string,
    permissionIds: string[],
    db: PrismaDb = this.prisma,
  ) {
    return db.permission.findMany({
      where: {
        tenantId,
        id: { in: permissionIds },
      },
    });
  }
}
