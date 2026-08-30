import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { parseTargetKey } from './report-execution.service';

/**
 * Favourites and recently-viewed reports.
 *
 * Both are per-user product state, not an audit trail, and are stored under one
 * canonical `targetKey` string (`std:` / `def:` / `srf:`) rather than three
 * nullable foreign keys — in PostgreSQL a nullable composite unique does not
 * constrain, because NULLs compare distinct, so `(user, null, null)` would not
 * collide with itself and a user could favourite the same report repeatedly.
 */
@Injectable()
export class ReportFavoriteService {
  private readonly logger = new Logger(ReportFavoriteService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listFavorites(user: AuthenticatedUser): Promise<string[]> {
    const rows = await this.prisma.reportFavorite.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      orderBy: { createdAt: 'desc' },
      select: { targetKey: true },
      take: 200,
    });
    return rows.map((row) => row.targetKey);
  }

  async addFavorite(user: AuthenticatedUser, targetKey: string) {
    parseTargetKey(targetKey); // rejects an unrecognised reference
    await this.prisma.reportFavorite.upsert({
      where: {
        tenantId_userId_targetKey: {
          tenantId: user.tenantId,
          userId: user.userId,
          targetKey,
        },
      },
      create: { tenantId: user.tenantId, userId: user.userId, targetKey },
      update: {},
    });
    return { targetKey, favorite: true };
  }

  async removeFavorite(user: AuthenticatedUser, targetKey: string) {
    await this.prisma.reportFavorite.deleteMany({
      where: { tenantId: user.tenantId, userId: user.userId, targetKey },
    });
    return { targetKey, favorite: false };
  }

  async listRecent(user: AuthenticatedUser, limit = 8) {
    const rows = await this.prisma.reportRecentView.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      orderBy: { viewedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 25),
    });
    return rows.map((row) => ({
      targetKey: row.targetKey,
      viewedAt: row.viewedAt.toISOString(),
      viewCount: row.viewCount,
    }));
  }

  /**
   * Record that a report was opened.
   *
   * Deliberately fire-and-forget: a failure to record a recent view must never
   * fail the report the user actually asked for. This is convenience state, not
   * an audit record — the audit trail covers exports, sharing and schedules,
   * where something leaves the product.
   */
  async touchRecent(user: AuthenticatedUser, targetKey: string): Promise<void> {
    try {
      parseTargetKey(targetKey);
      await this.prisma.reportRecentView.upsert({
        where: {
          tenantId_userId_targetKey: {
            tenantId: user.tenantId,
            userId: user.userId,
            targetKey,
          },
        },
        create: {
          tenantId: user.tenantId,
          userId: user.userId,
          targetKey,
          viewCount: 1,
        },
        update: { viewedAt: new Date(), viewCount: { increment: 1 } },
      });
    } catch (error) {
      this.logger.warn(
        `reporting.recent.touch_failed target=${targetKey} reason=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
