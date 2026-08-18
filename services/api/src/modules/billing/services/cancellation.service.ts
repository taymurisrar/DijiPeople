import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CancellationStatus,
  CancellationType,
  DeletionRequestOrigin,
  DeletionRequestStatus,
  DomainEventType,
  RetentionStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { buildIdempotencyKey } from '../../outbox/outbox.types';

/**
 * How long data is kept after access ends.
 *
 * 60 days is the platform default and a promise made to customers. It is
 * configurable, but the value in force is copied onto each `TenantRetention`
 * row at the moment it starts, so changing this never shortens a window
 * somebody was already told about.
 */
const DEFAULT_RETENTION_DAYS = 60;

@Injectable()
export class CancellationService {
  private readonly logger = new Logger(CancellationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Cancel a subscription.
   *
   * `CANCEL_RENEWAL` is the default and the overwhelmingly common case: stop
   * billing, keep working until the paid-through date. `TERMINATE_NOW` ends
   * access today and is deliberately harder to reach — it takes away something
   * the customer has already paid for, so it must be an explicit choice rather
   * than what a "cancel" button happens to do.
   */
  async requestCancellation(input: {
    tenantId: string;
    type?: CancellationType;
    reason?: string | null;
    feedback?: string | null;
    requestedByUserId?: string | null;
  }) {
    const type = input.type ?? CancellationType.CANCEL_RENEWAL;

    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId: input.tenantId },
      select: {
        id: true,
        status: true,
        currentPeriodEnd: true,
        renewalDate: true,
      },
    });

    if (!subscription) {
      throw new BadRequestException('This workspace has no subscription.');
    }

    const existing = await this.prisma.subscriptionCancellation.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: CancellationStatus.PENDING_PERIOD_END,
      },
      select: { id: true },
    });

    if (existing && type === CancellationType.CANCEL_RENEWAL) {
      throw new BadRequestException(
        'A cancellation is already pending for this subscription.',
      );
    }

    const paidThroughDate =
      subscription.currentPeriodEnd ?? subscription.renewalDate ?? null;
    const effectiveAt =
      type === CancellationType.TERMINATE_NOW
        ? new Date()
        : (paidThroughDate ?? new Date());

    return this.prisma.$transaction(async (tx) => {
      const cancellation = await tx.subscriptionCancellation.create({
        data: {
          tenantId: input.tenantId,
          subscriptionId: subscription.id,
          type,
          paidThroughDate,
          effectiveAt,
          reason: input.reason ?? null,
          feedback: input.feedback ?? null,
          requestedByUserId: input.requestedByUserId ?? null,
          status:
            type === CancellationType.TERMINATE_NOW
              ? CancellationStatus.TERMINATED
              : CancellationStatus.PENDING_PERIOD_END,
          terminatedAt:
            type === CancellationType.TERMINATE_NOW ? new Date() : null,
        },
        select: { id: true },
      });

      // Renewal stops in both cases. What differs is whether access stops too.
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          autoRenew: false,
          ...(type === CancellationType.TERMINATE_NOW
            ? { status: SubscriptionStatus.CANCELED, endDate: new Date() }
            : {}),
        },
      });

      if (type === CancellationType.TERMINATE_NOW) {
        await this.startRetentionWithin(tx, input.tenantId);
      }

      await this.outbox.emit(tx, {
        eventType: DomainEventType.CANCELLATION_REQUESTED,
        idempotencyKey: buildIdempotencyKey(
          DomainEventType.CANCELLATION_REQUESTED,
          cancellation.id,
        ),
        aggregateType: 'SubscriptionCancellation',
        aggregateId: cancellation.id,
        tenantId: input.tenantId,
        payload: {
          type,
          effectiveAt: effectiveAt.toISOString(),
          paidThroughDate: paidThroughDate?.toISOString() ?? null,
        },
      });

      return {
        cancellationId: cancellation.id,
        type,
        effectiveAt,
        paidThroughDate,
        // The thing the customer most wants to know.
        accessEndsAt: effectiveAt,
      };
    });
  }

  /**
   * Change their mind, before it takes effect.
   *
   * Only a `PENDING_PERIOD_END` cancellation can be revoked. A termination has
   * already happened and needs a restore, which is a different and more
   * deliberate operation.
   */
  async revokeCancellation(tenantId: string, revokedByUserId?: string | null) {
    const pending = await this.prisma.subscriptionCancellation.findFirst({
      where: { tenantId, status: CancellationStatus.PENDING_PERIOD_END },
      select: { id: true, subscriptionId: true },
    });

    if (!pending) {
      throw new BadRequestException('There is no pending cancellation.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionCancellation.update({
        where: { id: pending.id },
        data: {
          status: CancellationStatus.REVOKED,
          revokedAt: new Date(),
          revokedByUserId: revokedByUserId ?? null,
        },
      });
      await tx.subscription.update({
        where: { id: pending.subscriptionId },
        data: { cancelAtPeriodEnd: false, canceledAt: null, autoRenew: true },
      });
    });

    return { revoked: true };
  }

  /**
   * Terminate subscriptions whose paid-through date has passed, and start
   * their retention window.
   */
  async terminateDueCancellations(now = new Date()) {
    const due = await this.prisma.subscriptionCancellation.findMany({
      where: {
        status: CancellationStatus.PENDING_PERIOD_END,
        effectiveAt: { lte: now },
      },
      select: { id: true, tenantId: true, subscriptionId: true },
    });

    let terminated = 0;

    for (const cancellation of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscriptionCancellation.update({
          where: { id: cancellation.id },
          data: { status: CancellationStatus.TERMINATED, terminatedAt: now },
        });
        await tx.subscription.update({
          where: { id: cancellation.subscriptionId },
          data: { status: SubscriptionStatus.CANCELED, endDate: now },
        });
        await this.startRetentionWithin(tx, cancellation.tenantId, now);

        await this.outbox.emit(tx, {
          eventType: DomainEventType.SUBSCRIPTION_TERMINATED,
          idempotencyKey: buildIdempotencyKey(
            DomainEventType.SUBSCRIPTION_TERMINATED,
            cancellation.id,
          ),
          aggregateType: 'SubscriptionCancellation',
          aggregateId: cancellation.id,
          tenantId: cancellation.tenantId,
          payload: { terminatedAt: now.toISOString() },
        });
      });
      terminated += 1;
    }

    return { terminated };
  }

  /**
   * Start the retention window.
   *
   * The configured retention length is COPIED onto the row. A customer told
   * "60 days" must still get 60 days if somebody edits the default to 30 next
   * week, and a stored value is the only way to keep that promise.
   */
  private async startRetentionWithin(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    tenantId: string,
    now = new Date(),
  ) {
    const retentionDays = this.retentionDays();
    const scheduledErasureAt = new Date(
      now.getTime() + retentionDays * 24 * 60 * 60 * 1000,
    );

    const existing = await tx.tenantRetention.findUnique({
      where: { tenantId },
      select: { id: true },
    });

    if (existing) {
      // Already retaining — a second termination must not restart the clock,
      // which would silently extend how long data is kept.
      return;
    }

    await tx.tenantRetention.create({
      data: {
        tenantId,
        retentionStartedAt: now,
        scheduledErasureAt,
        retentionDays,
        policyVersion: this.configService.get<string>(
          'RETENTION_POLICY_VERSION',
        ),
        status: RetentionStatus.RETAINING,
      },
    });

    await this.outbox.emit(tx, {
      eventType: DomainEventType.RETENTION_STARTED,
      idempotencyKey: buildIdempotencyKey(
        DomainEventType.RETENTION_STARTED,
        tenantId,
      ),
      aggregateType: 'TenantRetention',
      aggregateId: tenantId,
      tenantId,
      payload: {
        retentionDays,
        scheduledErasureAt: scheduledErasureAt.toISOString(),
      },
    });
  }

  /**
   * A tenant owner asking for deletion.
   *
   * This creates a REQUEST. It never erases. An owner-initiated deletion that
   * executed immediately would make an angry afternoon permanent, and there is
   * no undo for a workspace.
   */
  async requestTenantDeletion(input: {
    tenantId: string;
    reason: string;
    requestedByUserId: string;
    confirmationPhrase: string;
  }) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: input.tenantId },
      select: { id: true, name: true },
    });

    // Typed confirmation, checked server-side. A client-side-only confirmation
    // is a speed bump, not a control.
    if (
      input.confirmationPhrase.trim().toLowerCase() !==
      tenant.name.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        'The confirmation phrase must exactly match the workspace name.',
      );
    }

    const existing = await this.prisma.tenantDeletionRequest.findFirst({
      where: {
        tenantId: input.tenantId,
        status: DeletionRequestStatus.REQUESTED,
      },
      select: { id: true },
    });

    if (existing) {
      return { requestId: existing.id, created: false };
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.tenantDeletionRequest.create({
        data: {
          tenantId: input.tenantId,
          origin: DeletionRequestOrigin.TENANT_OWNER,
          reason: input.reason,
          confirmationPhrase: input.confirmationPhrase,
          requestedByUserId: input.requestedByUserId,
          status: DeletionRequestStatus.REQUESTED,
        },
        select: { id: true },
      });

      await this.outbox.emit(tx, {
        eventType: DomainEventType.TENANT_DELETION_REQUESTED,
        idempotencyKey: buildIdempotencyKey(
          DomainEventType.TENANT_DELETION_REQUESTED,
          request.id,
        ),
        aggregateType: 'TenantDeletionRequest',
        aggregateId: request.id,
        tenantId: input.tenantId,
        payload: { origin: DeletionRequestOrigin.TENANT_OWNER },
      });

      return { requestId: request.id, created: true };
    });
  }

  /**
   * Which tenants are actually due for erasure.
   *
   * A tenant with **any** unreleased hold is excluded, whatever its date. That
   * is the entire purpose of a hold, and it is enforced here rather than left
   * to each caller to remember.
   *
   * THE HOLD ROWS ARE THE AUTHORITY, not `status`. Both `RETAINING` and
   * `ON_HOLD` are considered, and the verdict comes from whether an unreleased
   * hold exists. Filtering on `status = RETAINING` alone looks correct and is a
   * trap: `placeHold` moves the row to `ON_HOLD`, so held rows would vanish
   * from the query entirely — the count of "how many did we skip" would always
   * be zero, and any row whose status drifted out of step with its holds would
   * be silently mis-handled in whichever direction the drift went.
   *
   * Because the holds decide, a stale status is also corrected here rather than
   * left to rot.
   */
  async findTenantsDueForErasure(now = new Date()) {
    const candidates = await this.prisma.tenantRetention.findMany({
      where: {
        status: { in: [RetentionStatus.RETAINING, RetentionStatus.ON_HOLD] },
        scheduledErasureAt: { lte: now },
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        scheduledErasureAt: true,
        holds: {
          where: { releasedAt: null },
          select: { id: true, type: true },
        },
      },
    });

    const due = candidates.filter((row) => row.holds.length === 0);
    const held = candidates.filter((row) => row.holds.length > 0);

    if (held.length > 0) {
      this.logger.log(
        `${held.length} tenant(s) past their erasure date are held and will not be erased.`,
      );
      const misstated = held
        .filter((row) => row.status !== RetentionStatus.ON_HOLD)
        .map((row) => row.id);
      if (misstated.length > 0) {
        await this.prisma.tenantRetention.updateMany({
          where: { id: { in: misstated } },
          data: { status: RetentionStatus.ON_HOLD },
        });
      }
    }

    // A row marked ON_HOLD with nothing holding it is due, and its status is
    // repaired so an operator screen stops claiming a hold that ended.
    const releasedButStale = due
      .filter((row) => row.status === RetentionStatus.ON_HOLD)
      .map((row) => row.id);
    if (releasedButStale.length > 0) {
      await this.prisma.tenantRetention.updateMany({
        where: { id: { in: releasedButStale } },
        data: { status: RetentionStatus.RETAINING },
      });
    }

    return { due, heldCount: held.length };
  }

  private retentionDays(): number {
    const raw = Number(this.configService.get<string>('TENANT_RETENTION_DAYS'));
    return Number.isFinite(raw) && raw > 0
      ? Math.trunc(raw)
      : DEFAULT_RETENTION_DAYS;
  }
}
