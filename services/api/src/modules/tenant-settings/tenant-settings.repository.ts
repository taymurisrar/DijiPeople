import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

export type TenantSettingJsonInput =
  | Prisma.InputJsonValue
  | Prisma.JsonNullValueInput;

export type TenantSettingUpsertInput = {
  category: string;
  key: string;
  value: TenantSettingJsonInput;
  actorUserId: string;
};

export type TenantFeatureUpsertInput = {
  key: string;
  isEnabled: boolean;
  actorUserId: string;
};

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

  async upsertSettings(tenantId: string, updates: TenantSettingUpsertInput[]) {
    if (updates.length === 0) return;

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

  async upsertFeatures(tenantId: string, updates: TenantFeatureUpsertInput[]) {
    if (updates.length === 0) return;

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
