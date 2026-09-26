import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  PlanChangeStatus,
  PlatformEventResult,
  PlatformEventSource,
  Prisma,
  SubscriptionOrderStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PlatformEventsService } from '../../platform-events/platform-events.service';
import { resolveBillableSeats } from '../billing-seat-pricing';
import {
  addBillingInterval,
  addDays,
  periodBoundaryTransition,
  renewalDiscount,
  type InvoicePurpose,
} from '../managed-billing.rules';
import {
  buildInvoiceNumber,
  PaymentSettlementService,
} from './payment-settlement.service';
import { TaxBasisService } from './tax-basis.service';

const DEFAULT_GRACE_DAYS = 7;
const DEFAULT_RENEWAL_NOTICE_DAYS = 7;
const BATCH_SIZE = 200;

/** A pending payment younger than this is left for the webhook to settle. */
const VERIFY_AFTER_MS = 2 * 60 * 1000;
/** A pending payment older than this was abandoned on the provider's page. */
const ABANDON_AFTER_MS = 48 * 60 * 60 * 1000;
/** A payment row that never got a provider page within this is dead. */
const NEVER_OPENED_AFTER_MS = 10 * 60 * 1000;

const OPEN_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.PAYMENT_FAILED,
];

/** Every provider whose renewals DijiPeople runs — everything but Stripe. */
const MANAGED_PROVIDERS: PaymentProvider[] = Object.values(
  PaymentProvider,
).filter((provider) => provider !== PaymentProvider.STRIPE);

/**
 * The recurring half of DijiPeople-billed subscriptions.
 *
 * Safepay's native subscriptions cannot be created by API and would move the
 * source of truth for renewals to Safepay, so DijiPeople runs them instead:
 * issue the renewal invoice ahead of the period end, let the customer pay it
 * through the same hosted checkout, and move the subscription through
 * `periodBoundaryTransition` when the clock passes a boundary. No card is
 * stored and nothing is charged without the customer.
 *
 * Also the safety net for settlement: a webhook that never arrived and a
 * buyer who closed the tab both leave a PENDING payment that only this
 * re-verifies.
 */
@Injectable()
export class ManagedRenewalService {
  private readonly logger = new Logger(ManagedRenewalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly taxBasis: TaxBasisService,
    private readonly settlement: PaymentSettlementService,
    private readonly audit: AuditService,
    @Optional() private readonly platformEvents?: PlatformEventsService,
  ) {}

  /** One full pass, in the order the steps depend on each other. */
  async runOnce(now = new Date()) {
    const settled = await this.reconcilePending(now);
    const issued = await this.issueRenewalInvoices(now);
    const transitioned = await this.applyPeriodBoundaries(now);
    return { ...settled, issued, transitioned };
  }

  /**
   * Re-verify payments nobody has confirmed. This is what covers a lost
   * webhook, a buyer who never returned, and an API timeout after the
   * provider had already taken the money.
   */
  async reconcilePending(now = new Date()) {
    const verifyBefore = new Date(now.getTime() - VERIFY_AFTER_MS);

    // Never reached the provider: nothing can be paid on these.
    const neverOpened = await this.prisma.payment.updateMany({
      where: {
        paymentProvider: { in: MANAGED_PROVIDERS },
        status: PaymentStatus.PENDING,
        providerPaymentId: null,
        createdAt: { lt: new Date(now.getTime() - NEVER_OPENED_AFTER_MS) },
      },
      data: {
        status: PaymentStatus.FAILED,
        failureCode: 'PROVIDER_CHECKOUT_FAILED',
        failureMessage: 'No provider checkout was opened for this payment.',
      },
    });

    const pending = await this.prisma.payment.findMany({
      where: {
        paymentProvider: { in: MANAGED_PROVIDERS },
        status: PaymentStatus.PENDING,
        providerPaymentId: { not: null },
        createdAt: { lt: verifyBefore },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    let verified = 0;
    let abandoned = 0;
    for (const payment of pending) {
      try {
        const status = await this.settlement.settlePayment(payment.id, 'SWEEP');
        verified += 1;
        if (
          status === PaymentStatus.PENDING &&
          now.getTime() - payment.createdAt.getTime() > ABANDON_AFTER_MS
        ) {
          // FAILED is not final: a webhook for a late payment still credits
          // it, because settlement accepts FAILED as well as PENDING.
          const moved = await this.prisma.payment.updateMany({
            where: { id: payment.id, status: PaymentStatus.PENDING },
            data: {
              status: PaymentStatus.FAILED,
              failureCode: 'CHECKOUT_EXPIRED',
              failureMessage: 'The checkout was not completed.',
            },
          });
          abandoned += moved.count;
        }
      } catch (error) {
        this.logFailure('payment', payment.id, error);
      }
    }

    const orders = await this.prisma.subscriptionOrder.findMany({
      where: {
        paymentProvider: { in: MANAGED_PROVIDERS },
        status: {
          in: [
            SubscriptionOrderStatus.PENDING_PAYMENT,
            // Aged out by the order sweeper, yet possibly paid on the page
            // the buyer still had open.
            SubscriptionOrderStatus.ABANDONED,
          ],
        },
        providerPaymentId: { not: null },
        updatedAt: {
          lt: verifyBefore,
          gt: new Date(now.getTime() - ABANDON_AFTER_MS),
        },
      },
      select: { id: true },
      take: BATCH_SIZE,
    });
    for (const order of orders) {
      try {
        await this.settlement.settleOrder(order.id, 'SWEEP');
        verified += 1;
      } catch (error) {
        this.logFailure('order', order.id, error);
      }
    }

    return { verified, abandoned, neverOpened: neverOpened.count };
  }

  /** Issue next period's invoice for subscriptions approaching renewal. */
  async issueRenewalInvoices(now = new Date()): Promise<number> {
    const horizon = addDays(now, this.renewalNoticeDays());
    const due = await this.prisma.subscription.findMany({
      where: {
        paymentProvider: { in: MANAGED_PROVIDERS },
        status: SubscriptionStatus.ACTIVE,
        autoRenew: true,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { not: null, lte: horizon },
      },
      select: { id: true },
      take: BATCH_SIZE,
    });

    let issued = 0;
    for (const { id } of due) {
      try {
        if (await this.issueRenewalInvoice(id, now)) issued += 1;
      } catch (error) {
        this.logFailure('renewal', id, error);
      }
    }
    return issued;
  }

  /** Move subscriptions across the boundaries the clock has passed. */
  async applyPeriodBoundaries(now = new Date()): Promise<number> {
    const graceDays = this.graceDays();
    const candidates = await this.prisma.subscription.findMany({
      where: {
        paymentProvider: { in: MANAGED_PROVIDERS },
        OR: [
          {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: { lte: now },
          },
          {
            status: SubscriptionStatus.PAST_DUE,
            gracePeriodEndsAt: { lte: now },
          },
        ],
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        gracePeriodEndsAt: true,
      },
      take: BATCH_SIZE,
    });

    let moved = 0;
    for (const subscription of candidates) {
      const transition = periodBoundaryTransition(subscription, now, graceDays);
      if (!transition) continue;

      await this.prisma.$transaction(async (tx) => {
        /*
         * Conditional on every field the transition was decided from, not the
         * status alone. A renewal paid a moment ago leaves the status ACTIVE
         * and moves `currentPeriodEnd` out; a resume clears
         * `cancelAtPeriodEnd`. Matching on status alone would let this stale
         * read expire a tenant who had just paid.
         */
        const updated = await tx.subscription.updateMany({
          where: {
            id: subscription.id,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            gracePeriodEndsAt: subscription.gracePeriodEndsAt,
          },
          data:
            transition.status === SubscriptionStatus.PAST_DUE
              ? transition
              : { ...transition, autoRenew: false },
        });
        if (updated.count === 0) return;
        moved += 1;

        if (transition.status === SubscriptionStatus.PAST_DUE) {
          await tx.invoice.updateMany({
            where: {
              subscriptionId: subscription.id,
              status: {
                in: [InvoiceStatus.ISSUED, InvoiceStatus.PAYMENT_FAILED],
              },
              periodStart: subscription.currentPeriodEnd,
            },
            data: { status: InvoiceStatus.OVERDUE },
          });
        } else {
          // Ended for good: an open renewal for a period the tenant will not
          // have is withdrawn, so it cannot be paid by mistake later — a late
          // payment on it becomes a refund, not a backdated period.
          await tx.invoice.updateMany({
            where: {
              subscriptionId: subscription.id,
              status: { in: OPEN_INVOICE_STATUSES },
              metadataJson: { path: ['kind'], equals: 'RENEWAL' },
            },
            data: { status: InvoiceStatus.VOIDED, voidedAt: now },
          });
        }

        await this.audit.log(
          {
            tenantId: subscription.tenantId,
            action: `SUBSCRIPTION_${transition.status}`,
            entityType: 'Subscription',
            entityId: subscription.id,
            sourceModule: 'billing',
            beforeSnapshot: {
              status: subscription.status,
              currentPeriodEnd: subscription.currentPeriodEnd,
              gracePeriodEndsAt: subscription.gracePeriodEndsAt,
            },
            afterSnapshot: transition,
          },
          tx,
        );
      });

      await this.platformEvents?.record({
        eventCode: `BILLING_SUBSCRIPTION_${transition.status}`,
        source: PlatformEventSource.BACKGROUND,
        result:
          transition.status === SubscriptionStatus.CANCELED
            ? PlatformEventResult.SUCCEEDED
            : PlatformEventResult.FAILED,
        severity:
          transition.status === SubscriptionStatus.EXPIRED
            ? 'ERROR'
            : 'WARNING',
        tenantId: subscription.tenantId,
        entityType: 'Subscription',
        entityId: subscription.id,
        metadata: { ...transition },
      });
    }
    return moved;
  }

  /**
   * A tenant stopping renewal. Access continues to the paid-through date and
   * the period-boundary sweep ends it — the same outcome Stripe's
   * `cancel_at_period_end` gives a Stripe tenant.
   */
  async cancelAtPeriodEnd(tenantId: string, userId: string) {
    const subscription = await this.requireManagedSubscription(tenantId);
    if (
      subscription.status !== SubscriptionStatus.ACTIVE &&
      subscription.status !== SubscriptionStatus.PAST_DUE
    ) {
      throw new BadRequestException('This subscription is not active.');
    }
    await this.setRenewal(subscription, userId, false);
    return {
      cancelAtPeriodEnd: true,
      accessEndsAt: subscription.currentPeriodEnd,
    };
  }

  async resumeRenewal(tenantId: string, userId: string) {
    const subscription = await this.requireManagedSubscription(tenantId);
    if (
      subscription.status !== SubscriptionStatus.ACTIVE ||
      !subscription.cancelAtPeriodEnd
    ) {
      throw new BadRequestException('There is no pending cancellation.');
    }
    await this.setRenewal(subscription, userId, true);
    return { cancelAtPeriodEnd: false };
  }

  private async issueRenewalInvoice(
    subscriptionId: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`billing-renewal:${subscriptionId}`}))`,
      );

      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        include: {
          tenant: {
            select: { customerAccount: { select: { country: true } } },
          },
          promotionApplications: {
            where: { isActive: true },
            include: { promotion: true },
            orderBy: { appliedAt: 'desc' },
            take: 1,
          },
        },
      });
      const periodStart = subscription.currentPeriodEnd;
      if (!periodStart || subscription.status !== SubscriptionStatus.ACTIVE) {
        return false;
      }

      const existing = await tx.invoice.findFirst({
        where: {
          subscriptionId,
          periodStart,
          status: { not: InvoiceStatus.VOIDED },
        },
        select: { id: true },
      });
      if (existing) return false;

      // A plan change scheduled for this boundary is what the next period
      // is sold at — the renewal must bill the plan the customer moves to.
      const change = await tx.planChangeRequest.findFirst({
        where: {
          subscriptionId,
          status: PlanChangeStatus.SCHEDULED,
          effectiveAt: { lte: periodStart },
        },
        orderBy: { effectiveAt: 'desc' },
        select: { toPlanId: true, toPlanPriceId: true },
      });
      const planPriceId = change?.toPlanPriceId ?? subscription.planPriceId;
      if (!planPriceId) {
        this.logger.warn(
          `Subscription ${subscriptionId} has no plan price; no renewal invoice issued.`,
        );
        return false;
      }
      const planPrice = await tx.planPrice.findUniqueOrThrow({
        where: { id: planPriceId },
        include: { market: true },
      });

      const seats =
        subscription.scheduledSeats &&
        subscription.scheduledSeatsEffectiveAt &&
        subscription.scheduledSeatsEffectiveAt <= periodStart
          ? subscription.scheduledSeats
          : subscription.purchasedSeats;
      const subtotal = planPrice.unitAmount.mul(
        resolveBillableSeats(planPrice, seats),
      );
      const application = subscription.promotionApplications[0];
      const discount = application
        ? renewalDiscount(
            application.promotion,
            application.appliedAt,
            periodStart,
            subtotal,
            planPrice.currency,
          )
        : new Prisma.Decimal(0);
      const tax = this.taxBasis.resolve({
        subtotalAmount: subtotal,
        discountAmount: discount,
        currency: planPrice.currency,
        country: subscription.tenant.customerAccount.country,
        marketCode: planPrice.market?.code ?? null,
        taxProfileRef: planPrice.market?.taxProfileRef ?? null,
      });
      if (!tax.totalAmount.greaterThan(0)) {
        this.logger.warn(
          `Subscription ${subscriptionId} renews at zero; no invoice issued.`,
        );
        return false;
      }

      const purpose: InvoicePurpose = {
        kind: 'RENEWAL',
        planId: change?.toPlanId ?? planPrice.planId,
        planPriceId: planPrice.id,
        seats,
        promotionId: discount.greaterThan(0)
          ? (application?.promotionId ?? null)
          : null,
      };
      const invoice = await tx.invoice.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId,
          invoiceNumber: buildInvoiceNumber(now),
          amount: tax.totalAmount,
          currency: planPrice.currency,
          issueDate: now,
          dueDate: periodStart,
          status: InvoiceStatus.ISSUED,
          subtotal,
          tax: tax.taxAmount,
          total: tax.totalAmount,
          amountPaid: 0,
          amountDue: tax.totalAmount,
          periodStart,
          periodEnd: addBillingInterval(periodStart, planPrice.billingInterval),
          metadataJson: purpose as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, invoiceNumber: true },
      });

      await this.audit.log(
        {
          tenantId: subscription.tenantId,
          action: 'RENEWAL_INVOICE_ISSUED',
          entityType: 'Invoice',
          entityId: invoice.id,
          sourceModule: 'billing',
          afterSnapshot: {
            invoiceNumber: invoice.invoiceNumber,
            amount: tax.totalAmount.toString(),
            currency: planPrice.currency,
            periodStart,
          },
        },
        tx,
      );
      return true;
    });
  }

  private async requireManagedSubscription(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        paymentProvider: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
      },
    });
    if (!subscription) {
      throw new NotFoundException('This workspace has no subscription.');
    }
    if (
      !subscription.paymentProvider ||
      !MANAGED_PROVIDERS.includes(subscription.paymentProvider)
    ) {
      throw new BadRequestException(
        'This subscription is managed through the billing portal.',
      );
    }
    return subscription;
  }

  private async setRenewal(
    subscription: { id: string; cancelAtPeriodEnd: boolean },
    userId: string,
    renew: boolean,
  ) {
    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: !renew,
        autoRenew: renew,
        canceledAt: renew ? null : new Date(),
        updatedById: userId,
      },
      select: { tenantId: true },
    });
    // An unpaid renewal for a period the customer will no longer have is
    // withdrawn, so it cannot be paid by mistake.
    if (!renew) {
      await this.prisma.invoice.updateMany({
        where: {
          subscriptionId: subscription.id,
          status: InvoiceStatus.ISSUED,
          metadataJson: { path: ['kind'], equals: 'RENEWAL' },
        },
        data: { status: InvoiceStatus.VOIDED, voidedAt: new Date() },
      });
    }
    await this.audit.log({
      tenantId: updated.tenantId,
      actorUserId: userId,
      action: renew
        ? 'SUBSCRIPTION_RENEWAL_RESUMED'
        : 'SUBSCRIPTION_CANCEL_AT_PERIOD_END',
      entityType: 'Subscription',
      entityId: subscription.id,
      sourceModule: 'billing',
      beforeSnapshot: { cancelAtPeriodEnd: subscription.cancelAtPeriodEnd },
      afterSnapshot: { cancelAtPeriodEnd: !renew },
    });
  }

  private graceDays() {
    return this.readDays('MANAGED_BILLING_GRACE_DAYS', DEFAULT_GRACE_DAYS);
  }

  private renewalNoticeDays() {
    return this.readDays(
      'MANAGED_BILLING_RENEWAL_NOTICE_DAYS',
      DEFAULT_RENEWAL_NOTICE_DAYS,
    );
  }

  private readDays(key: string, fallback: number) {
    const raw = Number(this.configService.get<string>(key));
    return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : fallback;
  }

  private logFailure(kind: string, id: string, error: unknown) {
    this.logger.error(
      JSON.stringify({
        event: 'billing.managed.sweep_failed',
        kind,
        id,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
