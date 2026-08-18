import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RetentionHoldType, RetentionStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

/**
 * Holds that suspend automatic erasure.
 *
 * Several holds can exist at once for different reasons and different owners —
 * a legal hold from counsel and a billing-dispute hold from finance are not the
 * same fact, and releasing one must not release the other. That is why this is
 * a table of rows rather than a flag on the retention record: a single boolean
 * is how data gets erased in the middle of litigation because somebody cleared
 * "the hold" meaning theirs.
 *
 * Placing and releasing are both audited, because the interesting question
 * afterwards is never "was there a hold" but "who removed it, and when".
 */
@Injectable()
export class RetentionHoldService {
  private readonly logger = new Logger(RetentionHoldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async placeHold(input: {
    tenantId: string;
    type: RetentionHoldType;
    reason: string;
    placedByPlatformUser: string;
  }) {
    const retention = await this.prisma.tenantRetention.findUnique({
      where: { tenantId: input.tenantId },
      select: { id: true, status: true },
    });

    if (!retention) {
      throw new BadRequestException(
        'This workspace is not in a retention window, so there is nothing to hold.',
      );
    }

    if (retention.status === RetentionStatus.ERASED) {
      // Nothing to protect. Saying so plainly is better than accepting a hold
      // that can never do anything.
      throw new BadRequestException(
        'This workspace has already been erased; a hold cannot be placed.',
      );
    }

    const hold = await this.prisma.$transaction(async (tx) => {
      const created = await tx.retentionHold.create({
        data: {
          tenantRetentionId: retention.id,
          tenantId: input.tenantId,
          type: input.type,
          reason: input.reason,
          placedByPlatformUser: input.placedByPlatformUser,
        },
        select: { id: true, type: true, placedAt: true },
      });

      await tx.tenantRetention.update({
        where: { id: retention.id },
        data: { status: RetentionStatus.ON_HOLD },
      });

      return created;
    });

    await this.auditService.log({
      tenantId: input.tenantId,
      action: 'RETENTION_HOLD_PLACED',
      entityType: 'RetentionHold',
      entityId: hold.id,
      sourceModule: 'billing',
      afterSnapshot: {
        type: input.type,
        reason: input.reason,
        placedBy: input.placedByPlatformUser,
      },
    });

    return hold;
  }

  /**
   * Release one hold.
   *
   * Retention only returns to `RETAINING` when **no** unreleased hold remains.
   * Checking that here rather than assuming this was the last one is the whole
   * reason holds are separate rows.
   */
  async releaseHold(input: {
    holdId: string;
    releasedByPlatformUser: string;
    releaseReason: string;
  }) {
    const hold = await this.prisma.retentionHold.findUniqueOrThrow({
      where: { id: input.holdId },
      select: {
        id: true,
        tenantId: true,
        tenantRetentionId: true,
        releasedAt: true,
        type: true,
      },
    });

    if (hold.releasedAt) {
      throw new BadRequestException('That hold has already been released.');
    }

    const remaining = await this.prisma.$transaction(async (tx) => {
      await tx.retentionHold.update({
        where: { id: hold.id },
        data: {
          releasedAt: new Date(),
          releasedByPlatformUser: input.releasedByPlatformUser,
          releaseReason: input.releaseReason,
        },
      });

      const stillHeld = await tx.retentionHold.count({
        where: { tenantRetentionId: hold.tenantRetentionId, releasedAt: null },
      });

      if (stillHeld === 0) {
        await tx.tenantRetention.update({
          where: { id: hold.tenantRetentionId },
          data: { status: RetentionStatus.RETAINING },
        });
      }

      return stillHeld;
    });

    await this.auditService.log({
      tenantId: hold.tenantId,
      action: 'RETENTION_HOLD_RELEASED',
      entityType: 'RetentionHold',
      entityId: hold.id,
      sourceModule: 'billing',
      afterSnapshot: {
        type: hold.type,
        releasedBy: input.releasedByPlatformUser,
        reason: input.releaseReason,
        remainingHolds: remaining,
      },
    });

    return { released: true, remainingHolds: remaining };
  }

  /** Every hold currently keeping a workspace's data alive. */
  async listActiveHolds(tenantId: string) {
    return this.prisma.retentionHold.findMany({
      where: { tenantId, releasedAt: null },
      orderBy: { placedAt: 'asc' },
    });
  }
}
