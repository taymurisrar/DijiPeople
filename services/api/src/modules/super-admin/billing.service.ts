import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingCycle,
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

    const basePrice =
      input.billingCycle === BillingCycle.ANNUAL
        ? Number(plan.annualBasePrice)
        : Number(plan.monthlyBasePrice);
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
      basePrice,
      discountType,
      discountValue,
      finalPrice,
      currency: (input.currency ?? plan.currency).toUpperCase(),
    };
  }

  resolveRenewalDate(startDate: Date, billingCycle: BillingCycle) {
    const renewalDate = new Date(startDate);
    renewalDate.setMonth(
      renewalDate.getMonth() + (billingCycle === BillingCycle.ANNUAL ? 12 : 1),
    );
    return renewalDate;
  }

  async createOrUpdateSubscription(
    db: PrismaDb,
    input: {
      tenantId: string;
      planId: string;
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
      actorUserId?: string;
    },
  ) {
    const startDate = input.startDate ?? new Date();
    const pricing = await this.calculateSubscriptionPricing({
      planId: input.planId,
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
        billingCycle: input.billingCycle,
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
          this.resolveRenewalDate(startDate, input.billingCycle),
        autoRenew: input.autoRenew ?? true,
        stripeSubscriptionId: input.stripeSubscriptionId,
        createdById: input.actorUserId,
        updatedById: input.actorUserId,
      },
      update: {
        planId: input.planId,
        billingCycle: input.billingCycle,
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
          this.resolveRenewalDate(startDate, input.billingCycle),
        autoRenew: input.autoRenew,
        stripeSubscriptionId:
          input.stripeSubscriptionId === undefined
            ? undefined
            : input.stripeSubscriptionId,
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
