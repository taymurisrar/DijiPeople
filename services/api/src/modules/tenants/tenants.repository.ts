import { Injectable } from '@nestjs/common';
import {
  BillingCycle,
  DiscountType,
  Prisma,
  SubscriptionStatus,
  TenantStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, db: PrismaDb = this.prisma) {
    return db.tenant.findUnique({
      where: { id },
      include: {
        customerAccount: {
          select: {
            primaryOwnerUserId: true,
          },
        },
      },
    });
  }

  findByIdWithSuperAdminSummary(id: string, db: PrismaDb = this.prisma) {
    return db.tenant.findUnique({
      where: { id },
      include: {
        customerAccount: true,
        subscription: {
          include: {
            plan: true,
          },
        },
        tenantFeatures: {
          where: { isEnabled: true },
          orderBy: { key: 'asc' },
        },
        _count: {
          select: {
            users: true,
            employees: true,
          },
        },
      },
    });
  }

  findAllForSuperAdmin(db: PrismaDb = this.prisma) {
    return db.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customerAccount: true,
        subscription: {
          include: {
            plan: true,
          },
        },
        tenantFeatures: {
          where: { isEnabled: true },
          orderBy: { key: 'asc' },
        },
        _count: {
          select: {
            users: true,
            employees: true,
          },
        },
      },
    });
  }

  findBySlug(slug: string, db: PrismaDb = this.prisma) {
    return db.tenant.findUnique({
      where: { slug },
    });
  }

  updateStatus(
    id: string,
    status: TenantStatus,
    actorUserId?: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.tenant.update({
      where: { id },
      data: {
        status,
        updatedById: actorUserId,
      },
      include: {
        customerAccount: true,
        subscription: {
          include: {
            plan: true,
          },
        },
        tenantFeatures: {
          where: { isEnabled: true },
          orderBy: { key: 'asc' },
        },
        _count: {
          select: {
            users: true,
            employees: true,
          },
        },
      },
    });
  }

  findEnabledFeatures(id: string, db: PrismaDb = this.prisma) {
    return db.tenantFeature.findMany({
      where: {
        tenantId: id,
        isEnabled: true,
      },
      orderBy: { key: 'asc' },
    });
  }

  upsertSubscription(
    tenantId: string,
    data: {
      planId: string;
      billingCycle?: BillingCycle;
      basePrice?: Prisma.Decimal | number;
      discountType?: DiscountType;
      discountValue?: Prisma.Decimal | number;
      discountReason?: string | null;
      finalPrice?: Prisma.Decimal | number;
      currency?: string;
      status?: SubscriptionStatus;
      startDate?: Date;
      endDate?: Date | null;
      renewalDate?: Date | null;
      autoRenew?: boolean;
      stripeSubscriptionId?: string | null;
      actorUserId?: string;
    },
    db: PrismaDb = this.prisma,
  ) {
    return db.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: data.planId,
        billingCycle: data.billingCycle,
        basePrice: data.basePrice,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountReason: data.discountReason,
        finalPrice: data.finalPrice,
        currency: data.currency,
        status: data.status,
        startDate: data.startDate ?? new Date(),
        endDate: data.endDate,
        renewalDate: data.renewalDate,
        autoRenew: data.autoRenew,
        stripeSubscriptionId: data.stripeSubscriptionId,
        createdById: data.actorUserId,
        updatedById: data.actorUserId,
      },
      update: {
        planId: data.planId,
        billingCycle: data.billingCycle,
        basePrice: data.basePrice,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountReason: data.discountReason,
        finalPrice: data.finalPrice,
        currency: data.currency,
        status: data.status,
        startDate: data.startDate,
        endDate: data.endDate,
        renewalDate: data.renewalDate,
        autoRenew: data.autoRenew,
        stripeSubscriptionId: data.stripeSubscriptionId,
        updatedById: data.actorUserId,
      },
      include: {
        plan: true,
      },
    });
  }

  create(data: Prisma.TenantCreateInput, db: PrismaDb = this.prisma) {
    return db.tenant.create({ data });
  }
}
