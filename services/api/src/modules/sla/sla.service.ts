import { Injectable } from '@nestjs/common';
import { Prisma, SlaEventType, SlaStatus, SlaTargetType } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  async listTrackings(user: AuthenticatedUser, query: Record<string, string>) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const where = {
      tenantId: user.tenantId,
      ...(query.targetType
        ? { targetType: query.targetType as SlaTargetType }
        : {}),
      ...(query.status ? { status: query.status as SlaStatus } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.slaTracking.findMany({
        where,
        include: { eventLogs: { orderBy: { eventAtUtc: 'desc' }, take: 5 } },
        orderBy: [{ dueAtUtc: 'asc' }, { startedAtUtc: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.slaTracking.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async startTracking(input: {
    tenantId: string;
    slaPolicyId?: string | null;
    targetType: SlaTargetType;
    targetId: string;
    dueAtUtc?: Date | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const tracking = await this.prisma.slaTracking.upsert({
      where: {
        tenantId_targetType_targetId: {
          tenantId: input.tenantId,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      create: {
        tenantId: input.tenantId,
        slaPolicyId: input.slaPolicyId ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        dueAtUtc: input.dueAtUtc ?? null,
        metadata:
          input.metadata === undefined || input.metadata === null
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
      },
      update: {
        slaPolicyId: input.slaPolicyId ?? undefined,
        dueAtUtc: input.dueAtUtc ?? undefined,
        status: SlaStatus.ON_TRACK,
        completedAtUtc: null,
        metadata:
          input.metadata === undefined || input.metadata === null
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
      },
    });

    await this.logEvent(input.tenantId, tracking.id, SlaEventType.STARTED);
    return tracking;
  }

  async completeTracking(
    tenantId: string,
    targetType: SlaTargetType,
    targetId: string,
  ) {
    const tracking = await this.prisma.slaTracking.update({
      where: {
        tenantId_targetType_targetId: { tenantId, targetType, targetId },
      },
      data: { status: SlaStatus.NOT_APPLICABLE, completedAtUtc: new Date() },
    });
    await this.logEvent(tenantId, tracking.id, SlaEventType.COMPLETED);
    return tracking;
  }

  async markBreached(tenantId: string, trackingId: string) {
    const tracking = await this.prisma.slaTracking.update({
      where: { id: trackingId },
      data: { status: SlaStatus.BREACHED, breachedAtUtc: new Date() },
    });
    await this.logEvent(tenantId, tracking.id, SlaEventType.BREACHED);
    return tracking;
  }

  private logEvent(
    tenantId: string,
    slaTrackingId: string,
    eventType: SlaEventType,
  ) {
    return this.prisma.slaEventLog.create({
      data: { tenantId, slaTrackingId, eventType },
    });
  }
}
