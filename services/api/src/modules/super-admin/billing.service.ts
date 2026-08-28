import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingCycle,
  BillingModel,
  CommercialPublicationStatus,
  DiscountType,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateSubscriptionPricing(input: {
    planId: string;
    planPriceId?: string | null;
    purchasedSeats?: number;
    billingCycle: BillingCycle;
    discountType?: DiscountType;
    discountValue?: number;
    manualFinalPrice?: number;
    currency?: string;
  }) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found.');
    }

    // An explicitly chosen price wins. Otherwise resolve the published price in
    // force for the requested cycle, rather than falling through to the legacy
    // Plan columns — see below.
    const planPrice = input.planPriceId
      ? await this.prisma.planPrice.findFirst({
          where: {
            id: input.planPriceId,
            planId: input.planId,
            isActive: true,
          },
        })
      : await this.resolveEffectivePlanPrice(
          input.planId,
          input.billingCycle,
          input.currency,
        );
    if (input.planPriceId && !planPrice)
      throw new BadRequestException('Selected plan price is not available.');
    if (
      planPrice?.billingModel === BillingModel.PER_SEAT &&
      (input.purchasedSeats ?? 0) < planPrice.minimumSeats
    )
      throw new BadRequestException(
        `Licensed seats must be at least ${planPrice.minimumSeats}.`,
      );
    if (
      planPrice?.billingModel === BillingModel.PER_SEAT &&
      planPrice.maximumSeats !== null &&
      (input.purchasedSeats ?? 0) > planPrice.maximumSeats
    )
      throw new BadRequestException(
        `Licensed seats cannot exceed ${planPrice.maximumSeats}.`,
      );
    const billingCycle = planPrice?.billingCycle ?? input.billingCycle;
    const quantity =
      planPrice?.billingModel === BillingModel.PER_SEAT
        ? (input.purchasedSeats ?? 1)
        : 1;
    // BUG-0027 — this used to fall back to Plan.annualBasePrice /
    // Plan.monthlyBasePrice when no PlanPrice resolved, and the result was
    // written straight into Subscription.basePrice and finalPrice. That made
    // the legacy columns an independent pricing authority in a real money path,
    // not merely a display value: a plan with no PlanPrice (which is what the
    // seed produced) billed the legacy number.
    //
    // It now fails closed. An operator who sees this needs to configure a
    // published price for the plan, which is a deliberate commercial act — the
    // alternative is charging an amount nobody chose.
    if (!planPrice) {
      throw new BadRequestException(
        `Plan "${plan.key}" has no published ${billingCycle.toLowerCase()} price` +
          `${input.currency ? ` in ${input.currency.toUpperCase()}` : ''}. ` +
          'Configure and publish a price for this plan before creating a subscription.',
      );
    }

    const basePrice = Number(planPrice.unitAmount) * quantity;
    const discountType = input.discountType ?? DiscountType.NONE;
    const discountValue = input.discountValue ?? 0;

    if (discountValue < 0) {
      throw new BadRequestException('Discount value cannot be negative.');
    }

    if (discountType === DiscountType.PERCENTAGE && discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100.');
    }

    let discountedPrice = basePrice;

    if (discountType === DiscountType.PERCENTAGE) {
      discountedPrice = basePrice - basePrice * (discountValue / 100);
    }

    if (discountType === DiscountType.FLAT) {
      discountedPrice = basePrice - discountValue;
    }

    const finalPrice =
      input.manualFinalPrice !== undefined
        ? input.manualFinalPrice
        : discountedPrice;

    if (finalPrice < 0) {
      throw new BadRequestException('Final price cannot be negative.');
    }

    return {
      plan,
      planPrice,
      billingCycle,
      billingModel: planPrice?.billingModel ?? BillingModel.FLAT,
      quantity,
      basePrice,
      discountType,
      discountValue,
      finalPrice,
      currency: (
        planPrice?.currency ??
        input.currency ??
        plan.currency
      ).toUpperCase(),
    };
  }

  /**
   * The published price in force for a plan and billing cycle.
   *
   * Ordered by `effectiveFrom` descending, not by `version`: versions record
   * authoring order while effective dates record commercial intent, so a v3
   * staged for next quarter must not displace the v2 in force today. Matches
   * `selectEffectivePrice` in the billing module's commercial-offer resolver —
   * this is the operator-channel path, which is market-agnostic because an
   * operator arranging a deal is not bound by self-service market gating.
   */
  private async resolveEffectivePlanPrice(
    planId: string,
    billingCycle: BillingCycle,
    currency?: string,
    effectiveAt: Date = new Date(),
  ) {
    return this.prisma.planPrice.findFirst({
      where: {
        planId,
        billingCycle,
        isActive: true,
        publicationStatus: CommercialPublicationStatus.PUBLISHED,
        effectiveFrom: { lte: effectiveAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveAt } }],
        ...(currency ? { currency: currency.toUpperCase() } : {}),
      },
      orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    });
  }

  resolveRenewalDate(startDate: Date, billingCycle: BillingCycle) {
    const renewalDate = new Date(startDate);
    renewalDate.setMonth(
      renewalDate.getMonth() + (billingCycle === BillingCycle.ANNUAL ? 12 : 1),
    );
    return renewalDate;
  }

  /*
   * The first billing period, so the row is never born without one.
   *
   * `currentPeriodStart` and `currentPeriodEnd` are nullable with no default,
   * and this method never set them — the only writer was the Stripe webhook.
   * A subscription created here therefore carried no period until an event
   * arrived, and every reader of those columns (renewal, dunning, the Renewal
   * column, any MRR figure) had nothing to read. BUG-1744.
   *
   * This is the platform's own view of the cycle, not Stripe's. The webhook
   * still overwrites both from the Stripe subscription as soon as one arrives,
   * because Stripe owns proration, trials and clock skew and this does not.
   */
  resolveInitialPeriod(startDate: Date, billingCycle: BillingCycle) {
    return {
      currentPeriodStart: startDate,
      currentPeriodEnd: this.resolveRenewalDate(startDate, billingCycle),
    };
  }

  async createOrUpdateSubscription(
    db: PrismaDb,
    input: {
      tenantId: string;
      planId: string;
      planPriceId?: string | null;
      billingCycle: BillingCycle;
      status?: SubscriptionStatus;
      startDate?: Date;
      endDate?: Date | null;
      discountType?: DiscountType;
      discountValue?: number;
      discountReason?: string | null;
      manualFinalPrice?: number;
      currency?: string;
      autoRenew?: boolean;
      renewalDate?: Date | null;
      stripeSubscriptionId?: string | null;
      purchasedSeats?: number;
      actorUserId?: string;
    },
  ) {
    const startDate = input.startDate ?? new Date();
    const pricing = await this.calculateSubscriptionPricing({
      planId: input.planId,
      planPriceId: input.planPriceId,
      purchasedSeats: input.purchasedSeats,
      billingCycle: input.billingCycle,
      discountType: input.discountType,
      discountValue: input.discountValue,
      manualFinalPrice: input.manualFinalPrice,
      currency: input.currency,
    });

    const subscription = await db.subscription.upsert({
      where: { tenantId: input.tenantId },
      create: {
        tenantId: input.tenantId,
        planId: input.planId,
        planPriceId: pricing.planPrice?.id,
        billingCycle: pricing.billingCycle,
        basePrice: pricing.basePrice,
        discountType: pricing.discountType,
        discountValue: pricing.discountValue,
        discountReason: input.discountReason,
        finalPrice: pricing.finalPrice,
        currency: pricing.currency,
        status: input.status ?? SubscriptionStatus.TRIALING,
        startDate,
        endDate: input.endDate,
        renewalDate:
          input.renewalDate ??
          this.resolveRenewalDate(startDate, pricing.billingCycle),
        ...this.resolveInitialPeriod(startDate, pricing.billingCycle),
        autoRenew: input.autoRenew ?? true,
        stripeSubscriptionId: input.stripeSubscriptionId,
        purchasedSeats: input.purchasedSeats ?? 1,
        createdById: input.actorUserId,
        updatedById: input.actorUserId,
      },
      update: {
        planId: input.planId,
        planPriceId: pricing.planPrice?.id,
        billingCycle: pricing.billingCycle,
        basePrice: pricing.basePrice,
        discountType: pricing.discountType,
        discountValue: pricing.discountValue,
        discountReason: input.discountReason,
        finalPrice: pricing.finalPrice,
        currency: pricing.currency,
        status: input.status,
        startDate,
        endDate: input.endDate,
        renewalDate:
          input.renewalDate ??
          this.resolveRenewalDate(startDate, pricing.billingCycle),
        autoRenew: input.autoRenew,
        stripeSubscriptionId:
          input.stripeSubscriptionId === undefined
            ? undefined
            : input.stripeSubscriptionId,
        purchasedSeats: input.purchasedSeats,
        updatedById: input.actorUserId,
      },
      include: {
        plan: true,
      },
    });

    return subscription;
  }

  async createInvoice(
    db: PrismaDb,
    input: {
      tenantId: string;
      subscriptionId: string;
      amount: number;
      currency: string;
      issueDate?: Date;
      dueDate?: Date;
      status?: InvoiceStatus;
      stripeInvoiceId?: string | null;
      actorUserId?: string;
    },
  ) {
    const issueDate = input.issueDate ?? new Date();
    const dueDate =
      input.dueDate ?? new Date(issueDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const datePart = issueDate.toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const entropy = String(Math.floor(Math.random() * 10_000)).padStart(
        4,
        '0',
      );
      const invoiceNumber = `INV-${datePart}-${entropy}`;

      try {
        return await db.invoice.create({
          data: {
            tenantId: input.tenantId,
            subscriptionId: input.subscriptionId,
            invoiceNumber,
            amount: input.amount,
            currency: input.currency,
            issueDate,
            dueDate,
            status: input.status ?? InvoiceStatus.ISSUED,
            stripeInvoiceId: input.stripeInvoiceId ?? null,
            createdById: input.actorUserId,
            updatedById: input.actorUserId,
          },
        });
      } catch (error) {
        const isUniqueViolation =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!isUniqueViolation) {
          throw error;
        }
      }
    }

    throw new BadRequestException(
      'Unable to generate a unique invoice number. Please retry.',
    );
  }

  async recordPayment(
    input: {
      tenantId: string;
      subscriptionId: string;
      invoiceId?: string;
      amount: number;
      currency: string;
      paymentMethod: PaymentMethod;
      status?: PaymentStatus;
      stripePaymentIntentId?: string | null;
      paidAt?: Date;
      actorUserId?: string;
    },
    db: PrismaDb = this.prisma,
  ) {
    const subscription = await db.subscription.findFirst({
      where: {
        id: input.subscriptionId,
        tenantId: input.tenantId,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found for this tenant.');
    }

    if (input.invoiceId) {
      const invoice = await db.invoice.findFirst({
        where: {
          id: input.invoiceId,
          tenantId: input.tenantId,
          subscriptionId: input.subscriptionId,
        },
      });

      if (!invoice) {
        throw new NotFoundException(
          'Invoice not found for this tenant subscription.',
        );
      }
    }

    const executeWrite = async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: input.tenantId,
          subscriptionId: input.subscriptionId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          paymentMethod: input.paymentMethod,
          status: input.status ?? PaymentStatus.SUCCEEDED,
          stripePaymentIntentId: input.stripePaymentIntentId ?? null,
          paidAt:
            input.paidAt ??
            ((input.status ?? PaymentStatus.SUCCEEDED) ===
            PaymentStatus.SUCCEEDED
              ? new Date()
              : null),
          createdById: input.actorUserId,
          updatedById: input.actorUserId,
        },
      });

      if (
        input.invoiceId &&
        (input.status ?? PaymentStatus.SUCCEEDED) === PaymentStatus.SUCCEEDED
      ) {
        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: {
            status: InvoiceStatus.PAID,
            updatedById: input.actorUserId,
          },
        });
      }

      return payment;
    };

    if ('$transaction' in db) {
      return db.$transaction(async (tx) => executeWrite(tx));
    }

    return executeWrite(db);
  }

  async createStripeCustomer(input: { customerAccountId: string }) {
    return {
      ready: false,
      provider: 'stripe',
      scope: 'customer',
      customerAccountId: input.customerAccountId,
      message: 'Stripe customer creation is prepared but not enabled yet.',
    };
  }

  async createStripeSubscription(input: { subscriptionId: string }) {
    return {
      ready: false,
      provider: 'stripe',
      scope: 'subscription',
      subscriptionId: input.subscriptionId,
      message: 'Stripe subscription creation is prepared but not enabled yet.',
    };
  }

  async handleStripeWebhook() {
    return {
      accepted: true,
      provider: 'stripe',
      mode: 'placeholder',
    };
  }
}
