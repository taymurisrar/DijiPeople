import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const PLAN_LIST_INCLUDE = {
  features: {
    orderBy: { featureKey: 'asc' },
  },
  prices: {
    orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
    include: {
      _count: {
        select: {
          subscriptions: true,
        },
      },
    },
  },
  _count: {
    select: {
      subscriptions: true,
    },
  },
} satisfies Prisma.PlanInclude;

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(db: PrismaDb = this.prisma) {
    return db.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: PLAN_LIST_INCLUDE,
    });
  }

  /** One page of plans plus the filtered total (BUG-3175). */
  async findPage(
    args: {
      where: Prisma.PlanWhereInput;
      orderBy: Prisma.PlanOrderByWithRelationInput[];
      skip: number;
      take: number;
    },
    db: PrismaDb = this.prisma,
  ) {
    const [items, total] = await Promise.all([
      db.plan.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        include: PLAN_LIST_INCLUDE,
      }),
      db.plan.count({ where: args.where }),
    ]);
    return { items, total };
  }

  findById(id: string, db: PrismaDb = this.prisma) {
    return db.plan.findUnique({
      where: { id },
      include: {
        features: {
          orderBy: { featureKey: 'asc' },
        },
        prices: {
          orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
          include: {
            _count: {
              select: {
                subscriptions: true,
              },
            },
          },
        },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  findByKey(key: string, db: PrismaDb = this.prisma) {
    return db.plan.findUnique({
      where: { key },
      include: {
        features: true,
      },
    });
  }

  create(data: Prisma.PlanCreateInput, db: PrismaDb = this.prisma) {
    return db.plan.create({
      data,
      include: {
        features: {
          orderBy: { featureKey: 'asc' },
        },
        prices: {
          orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
          include: {
            _count: {
              select: {
                subscriptions: true,
              },
            },
          },
        },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  update(id: string, data: Prisma.PlanUpdateInput, db: PrismaDb = this.prisma) {
    return db.plan.update({
      where: { id },
      data,
      include: {
        features: {
          orderBy: { featureKey: 'asc' },
        },
        prices: {
          orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
          include: {
            _count: {
              select: {
                subscriptions: true,
              },
            },
          },
        },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }
}
