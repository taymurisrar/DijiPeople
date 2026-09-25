import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  canonicalAuditAction,
  resolveAuditActionAliases,
} from '../../common/constants/audit-actions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PlatformAuditLogQueryDto } from './dto/platform-audit-log-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient | PrismaClient;

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTenantActor(
    tenantId: string,
    userId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });
  }

  findPlatformActor(userId: string, db: PrismaDb = this.prisma) {
    return db.platformUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
  }

  create(
    data: Prisma.AuditLogUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.auditLog.create({ data });
  }

  createPlatform(
    data: Prisma.PlatformAuditLogUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.platformAuditLog.create({ data });
  }

  async findByTenant(
    tenantId: string,
    query: AuditLogQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      /*
       * BUG-2046 - a filter on one action must find every stored spelling of
       * it. A tenant whose log spans the naming change holds rows under both
       * conventions, and an exact match would answer a compliance question with
       * half the evidence while looking like a complete answer.
       */
      ...(query.action
        ? { action: { in: resolveAuditActionAliases(query.action) } }
        : {}),
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

  findOneByTenant(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.auditLog.findFirst({
      where: { id, tenantId },
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
    });
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
      /*
       * BUG-2046 - deduplicated by canonical name so the filter offers one
       * entry per logical action rather than one per spelling. The value the
       * screen sends is expanded back to every spelling by `findByTenant`.
       */
      actions: [
        ...new Set(actions.map((item) => canonicalAuditAction(item.action))),
      ].sort(),
      entityTypes: entityTypes.map((item) => item.entityType),
      actors,
    };
  }

  findRecordTimeline(
    tenantId: string,
    entityType: string,
    entityId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.auditLog.findMany({
      where: { tenantId, entityType, entityId },
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
      take: 100,
    });
  }

  /*
   * BUG-3564. `PlatformAuditLog` had no reader at all — every write landed in
   * a table nothing ever queried. This mirrors `findByTenant` in shape
   * (server-side pagination, the same `resolveAuditActionAliases` expansion
   * for `action`), but the `where` is built as an `AND` array of clauses
   * rather than an object literal: `traceId` and `search` each contribute
   * their own `OR`, and two `OR` keys on one object literal silently
   * overwrite each other rather than combining (the same shape
   * `platform-monitoring.service.ts`'s event filters already avoid).
   */
  async findPlatformAudit(
    query: PlatformAuditLogQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const clauses: Prisma.PlatformAuditLogWhereInput[] = [];

    if (query.action) {
      clauses.push({ action: { in: resolveAuditActionAliases(query.action) } });
    }
    if (query.entityType) {
      clauses.push({ entityType: query.entityType.trim() });
    }
    if (query.entityId) {
      clauses.push({ entityId: query.entityId.trim() });
    }
    if (query.actorUserId) {
      clauses.push({ platformActorUserId: query.actorUserId });
    }
    if (query.traceId) {
      clauses.push({
        OR: [{ traceId: query.traceId }, { requestId: query.traceId }],
      });
    }
    if (query.search) {
      const term = query.search.trim();
      clauses.push({
        OR: [
          { action: { contains: term, mode: 'insensitive' } },
          { entityType: { contains: term, mode: 'insensitive' } },
        ],
      });
    }
    const dateRange = buildDateRange(query.fromDate, query.toDate);
    if (dateRange.createdAt) {
      clauses.push({ createdAt: dateRange.createdAt });
    }

    const where: Prisma.PlatformAuditLogWhereInput = clauses.length
      ? { AND: clauses }
      : {};

    const [items, total] = await Promise.all([
      db.platformAuditLog.findMany({
        where,
        include: {
          platformActorUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.platformAuditLog.count({ where }),
    ]);

    return { items, total };
  }

  findOnePlatformAudit(id: string, db: PrismaDb = this.prisma) {
    return db.platformAuditLog.findUnique({
      where: { id },
      include: {
        platformActorUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });
  }

  async getPlatformFilterMetadata(db: PrismaDb = this.prisma) {
    const [actions, entityTypes, actors] = await Promise.all([
      db.platformAuditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      db.platformAuditLog.findMany({
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
      db.platformUser.findMany({
        where: { auditLogs: { some: {} } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);

    return {
      actions: [
        ...new Set(actions.map((item) => canonicalAuditAction(item.action))),
      ].sort(),
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
