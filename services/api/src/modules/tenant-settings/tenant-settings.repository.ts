import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TenantSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSettingsByTenant(tenantId: string, db: PrismaDb = this.prisma) {
    return db.tenantSetting.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  findFeaturesByTenant(tenantId: string, db: PrismaDb = this.prisma) {
    return db.tenantFeature.findMany({
      where: { tenantId },
      orderBy: [{ key: 'asc' }],
    });
  }

  findSubscriptionForTenant(tenantId: string, db: PrismaDb = this.prisma) {
    return db.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: {
          include: {
            features: {
              orderBy: { featureKey: 'asc' },
            },
          },
        },
      },
    });
  }

  findTenantBySlug(slug: string, db: PrismaDb = this.prisma) {
    return db.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });
  }

  findTenantById(tenantId: string, db: PrismaDb = this.prisma) {
    return db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });
  }

  async upsertSettings(
    tenantId: string,
    updates: Array<{
      category: string;
      key: string;
      value: Prisma.InputJsonValue;
      actorUserId: string;
    }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.tenantSetting.upsert({
          where: {
            tenantId_category_key: {
              tenantId,
              category: update.category,
              key: update.key,
            },
          },
          create: {
            tenantId,
            category: update.category,
            key: update.key,
            value: update.value,
            createdById: update.actorUserId,
            updatedById: update.actorUserId,
          },
          update: {
            value: update.value,
            updatedById: update.actorUserId,
          },
        });
      }
    });
  }

  async upsertFeatures(
    tenantId: string,
    updates: Array<{
      key: string;
      isEnabled: boolean;
      actorUserId: string;
    }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.tenantFeature.upsert({
          where: {
            tenantId_key: {
              tenantId,
              key: update.key,
            },
          },
          create: {
            tenantId,
            key: update.key,
            isEnabled: update.isEnabled,
            createdById: update.actorUserId,
            updatedById: update.actorUserId,
          },
          update: {
            isEnabled: update.isEnabled,
            updatedById: update.actorUserId,
          },
        });
      }
    });
  }
}
