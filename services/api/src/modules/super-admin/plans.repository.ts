import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(db: PrismaDb = this.prisma) {
    return db.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        features: {
          orderBy: { featureKey: 'asc' },
        },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  findById(id: string, db: PrismaDb = this.prisma) {
    return db.plan.findUnique({
      where: { id },
      include: {
        features: {
          orderBy: { featureKey: 'asc' },
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
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  update(
    id: string,
    data: Prisma.PlanUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.plan.update({
      where: { id },
      data,
      include: {
        features: {
          orderBy: { featureKey: 'asc' },
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
