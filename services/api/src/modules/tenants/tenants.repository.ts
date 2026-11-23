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

/*
 * Shared by the full and the paged super-admin tenant list so both project the
 * same shape — mapTenantSummary reads either.
 */
const SUPER_ADMIN_TENANT_INCLUDE = {
  customerAccount: true,
  tenantBranding: true,
  tenantDomains: true,
  ownerUser: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      isServiceAccount: true,
      lastLoginAt: true,
      userRoles: {
        select: {
          role: {
            select: {
              id: true,
              key: true,
              name: true,
            },
          },
        },
      },
    },
  },
  subscription: {
    include: {
      plan: true,
      planPrice: true,
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
      organizations: true,
      businessUnits: true,
    },
  },
} satisfies Prisma.TenantInclude;

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, db: PrismaDb = this.prisma) {
    return db.tenant.findUnique({
      where: { id },
      include: {
        customerAccount: true,
        tenantBranding: true,
        tenantDomains: true,
        ownerUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            isServiceAccount: true,
            lastLoginAt: true,
            userRoles: {
              select: {
                role: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
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
        tenantBranding: true,
        tenantDomains: true,
        /*
         * Attribution is shown as a business label on the tenant record, so the
         * lead and partner travel with it. Returning only the foreign keys is
         * what forced the record page to render them as raw ids.
         */
        originatingLead: {
          select: { id: true, companyName: true, fullName: true, status: true },
        },
        originatingPartner: {
          select: { id: true, displayName: true, status: true },
        },
        ownerUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            isServiceAccount: true,
            lastLoginAt: true,
            userRoles: {
              select: {
                role: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        users: {
          where: { isServiceAccount: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            isServiceAccount: true,
            lastLoginAt: true,
            userRoles: {
              select: {
                role: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        },
        subscription: {
          include: {
            plan: true,
            planPrice: true,
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
            organizations: true,
            businessUnits: true,
          },
        },
      },
    });
  }

  findAllForSuperAdmin(
    db: PrismaDb = this.prisma,
    filter: { customerAccountId?: string } = {},
  ) {
    return db.tenant.findMany({
      where: filter.customerAccountId
        ? { customerAccountId: filter.customerAccountId }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: SUPER_ADMIN_TENANT_INCLUDE,
    });
  }

  /** One page of the super-admin tenant list plus the filtered total (BUG-3175). */
  async findPageForSuperAdmin(
    args: {
      where: Prisma.TenantWhereInput;
      orderBy: Prisma.TenantOrderByWithRelationInput[];
      skip: number;
      take: number;
    },
    db: PrismaDb = this.prisma,
  ) {
    const [items, total] = await Promise.all([
      db.tenant.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: SUPER_ADMIN_TENANT_INCLUDE,
      }),
      db.tenant.count({ where: args.where }),
    ]);
    return { items, total };
  }

  findBySlug(slug: string, db: PrismaDb = this.prisma) {
    return db.tenant.findUnique({
      where: { slug },
    });
  }

  findBySlugExcludingId(
    slug: string,
    tenantId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.tenant.findFirst({
      where: {
        slug,
        id: { not: tenantId },
      },
      select: { id: true },
    });
  }

  updateSlug(
    tenantId: string,
    slug: string,
    actorUserId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.tenant.update({
      where: { id: tenantId },
      data: {
        slug,
        updatedById: actorUserId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        updatedAt: true,
      },
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
        tenantBranding: true,
        tenantDomains: true,
        ownerUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            isServiceAccount: true,
            lastLoginAt: true,
            userRoles: {
              select: {
                role: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        users: {
          where: { isServiceAccount: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            isServiceAccount: true,
            lastLoginAt: true,
            userRoles: {
              select: {
                role: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        },
        subscription: {
          include: {
            plan: true,
            planPrice: true,
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
            organizations: true,
            businessUnits: true,
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
