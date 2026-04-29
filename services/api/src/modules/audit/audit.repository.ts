import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient | PrismaClient;

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.AuditLogUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.auditLog.create({ data });
  }

  async findByTenant(
    tenantId: string,
    query: AuditLogQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.action ? { action: query.action.trim() } : {}),
      ...(query.entityType ? { entityType: query.entityType.trim() } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...buildDateRange(query.fromDate, query.toDate),
    };

    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: {
          actorUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.auditLog.count({ where }),
    ]);

    return { items, total };
  }

  async getFilterMetadata(tenantId: string, db: PrismaDb = this.prisma) {
    const [actions, entityTypes, actors] = await Promise.all([
      db.auditLog.findMany({
        where: { tenantId },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      db.auditLog.findMany({
        where: { tenantId },
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
      db.user.findMany({
        where: {
          tenantId,
          auditLogs: {
            some: {},
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);

    return {
      actions: actions.map((item) => item.action),
      entityTypes: entityTypes.map((item) => item.entityType),
      actors,
    };
  }
}

function buildDateRange(fromDate?: string, toDate?: string) {
  if (!fromDate && !toDate) {
    return {};
  }

  const createdAt: Prisma.DateTimeFilter = {};

  if (fromDate) {
    createdAt.gte = new Date(fromDate);
  }

  if (toDate) {
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);
    createdAt.lte = endDate;
  }

  return { createdAt };
}
