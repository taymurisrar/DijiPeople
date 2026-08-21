import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  PlatformEventResult,
  PlatformEventSource,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import {
  isNotifiable,
  toNotification,
  type PlatformNotification,
} from './platform-notifications';

export type RecordPlatformEventInput = {
  eventCode: string;
  source: PlatformEventSource;
  result?: PlatformEventResult;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  correlationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  tenantId?: string | null;
  customerAccountId?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class PlatformEventsService {
  private readonly logger = new Logger(PlatformEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordPlatformEventInput) {
    try {
      return await this.prisma.platformEvent.create({
        data: {
          eventCode: normalizeEventCode(input.eventCode),
          source: input.source,
          result: input.result ?? PlatformEventResult.SUCCEEDED,
          severity: input.severity ?? 'INFO',
          environment: process.env.NODE_ENV ?? 'development',
          correlationId:
            input.correlationId?.trim().slice(0, 128) ?? `evt_${randomUUID()}`,
          entityType: input.entityType?.slice(0, 100) ?? null,
          entityId: input.entityId?.slice(0, 160) ?? null,
          tenantId: input.tenantId ?? null,
          customerAccountId: input.customerAccountId ?? null,
          actorType: input.actorType?.slice(0, 80) ?? null,
          actorId: input.actorId?.slice(0, 160) ?? null,
          route: input.route?.slice(0, 300) ?? null,
          metadata: input.metadata
            ? (sanitizeMetadata(input.metadata) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
    } catch (error) {
      // Telemetry must never turn a successful business operation into a failure.
      this.logger.warn(
        `Unable to persist ${input.eventCode}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * The operator-facing slice of the event stream.
   *
   * Not a second event log. `PlatformEvent` holds everything this platform
   * does; this returns only what somebody should act on or would want to know,
   * as decided by `platform-notifications.ts`. Filtering happens after the
   * fetch rather than in SQL because the rules are regex over event codes and
   * belong in one readable place — the window is bounded to keep that honest.
   */
  async notifications(
    user: AuthenticatedUser,
    options: { limit?: number } = {},
  ): Promise<{
    items: PlatformNotification[];
    unreadCount: number;
    readAt: string | null;
  }> {
    this.assertRead(user);
    const limit = Math.min(100, Math.max(1, options.limit ?? 30));

    const platformUserId = user.platform?.id ?? null;
    const reader = platformUserId
      ? await this.prisma.platformUser.findUnique({
          where: { id: platformUserId },
          select: { notificationsReadAt: true },
        })
      : null;
    const readAt = reader?.notificationsReadAt ?? null;

    /*
     * A bounded window rather than the whole table. Ninety days is long enough
     * that a failure cannot silently age out of view before anyone looks, and
     * short enough that this stays one indexed range scan.
     */
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.platformEvent.findMany({
      where: { occurredAt: { gte: since } },
      orderBy: { occurredAt: 'desc' },
      /*
       * Over-fetch, then filter to the notifiable subset. Most events are not
       * notifiable, so taking exactly `limit` rows would routinely return a
       * near-empty feed while unread failures sat just past the cut.
       */
      take: limit * 20,
      select: {
        id: true,
        eventCode: true,
        result: true,
        occurredAt: true,
        entityType: true,
        entityId: true,
        tenantId: true,
        customerAccountId: true,
        metadata: true,
      },
    });

    const items = rows
      .filter((row) =>
        isNotifiable({ eventCode: row.eventCode, result: String(row.result) }),
      )
      .map((row) => toNotification(row, readAt))
      .filter((item): item is PlatformNotification => item !== null);

    return {
      /*
       * The unread count is computed over everything in the window, not over
       * the page — a badge that said "3" because the page held three would be
       * lying about the thing the badge exists to state.
       */
      unreadCount: items.filter((item) => item.unread).length,
      items: items.slice(0, limit),
      readAt: readAt?.toISOString() ?? null,
    };
  }

  /** Mark the feed read, as of now. */
  async markNotificationsRead(user: AuthenticatedUser) {
    this.assertRead(user);
    const platformUserId = user.platform?.id;
    if (!platformUserId) return { readAt: null };
    const updated = await this.prisma.platformUser.update({
      where: { id: platformUserId },
      data: { notificationsReadAt: new Date() },
      select: { notificationsReadAt: true },
    });
    return { readAt: updated.notificationsReadAt?.toISOString() ?? null };
  }

  async list(
    user: AuthenticatedUser,
    query: Record<string, string | undefined>,
  ) {
    this.assertRead(user);
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(100, positiveInt(query.pageSize, 25));
    const from = parseDate(query.from);
    const to = parseDate(query.to);
    const where: Prisma.PlatformEventWhereInput = {
      ...(query.source && isEnumValue(PlatformEventSource, query.source)
        ? { source: query.source as PlatformEventSource }
        : {}),
      ...(query.result && isEnumValue(PlatformEventResult, query.result)
        ? { result: query.result as PlatformEventResult }
        : {}),
      ...(query.severity ? { severity: query.severity.toUpperCase() } : {}),
      ...(query.environment ? { environment: query.environment } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: endOfDay(to) } : {}),
            },
          }
        : {}),
      ...(query.correlationId
        ? { correlationId: { contains: query.correlationId } }
        : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.customerAccountId
        ? { customerAccountId: query.customerAccountId }
        : {}),
      ...(query.eventCode
        ? { eventCode: { contains: query.eventCode, mode: 'insensitive' } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { eventCode: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search, mode: 'insensitive' } },
              {
                correlationId: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.platformEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.platformEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async overview(user: AuthenticatedUser) {
    this.assertRead(user);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [bySource, byResult, recent] = await Promise.all([
      this.prisma.platformEvent.groupBy({
        by: ['source'],
        where: { occurredAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.platformEvent.groupBy({
        by: ['result'],
        where: { occurredAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.platformEvent.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 10,
      }),
    ]);
    return {
      window: '24h',
      bySource: Object.fromEntries(
        bySource.map((item) => [item.source, item._count._all]),
      ),
      byResult: Object.fromEntries(
        byResult.map((item) => [item.result, item._count._all]),
      ),
      recent,
    };
  }

  private assertRead(user: AuthenticatedUser) {
    if (
      !user.platform?.id ||
      !userHasPlatformPermission(user, 'monitoring.read')
    )
      throw new ForbiddenException('Platform monitoring access is required.');
  }
}

function normalizeEventCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[depth-limited]';
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  if (!value || typeof value !== 'object')
    return typeof value === 'string' ? value.slice(0, 1000) : value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key]) =>
          !/(password|secret|token|authorization|cookie|signaturedata|card)/i.test(
            key,
          ),
      )
      .slice(0, 50)
      .map(([key, item]) => [key, sanitizeMetadata(item, depth + 1)]),
  );
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isEnumValue(values: object, value: string) {
  return Object.values(values).includes(value);
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}
