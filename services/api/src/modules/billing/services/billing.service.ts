import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StripeBillingService } from './stripe-billing.service';

const RECENT_CHECKOUT_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeBillingService: StripeBillingService,
    private readonly configService: ConfigService,
  ) {}

  async getPublicPlans() {
    const plans = await this.prisma.plan.findMany({
      where: {
        isActive: true,
        isPublic: true,
      },
      include: {
        features: {
          where: { isEnabled: true },
          orderBy: { featureKey: 'asc' },
        },
        prices: {
          where: { isActive: true },
          orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return plans.map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      currency: plan.currency,
      monthlyBasePrice: Number(plan.monthlyBasePrice),
      annualBasePrice: Number(plan.annualBasePrice),
      prices: plan.prices.map((price) => ({
        id: price.id,
        billingCycle: price.billingCycle,
        currency: price.currency,
        unitAmount: Number(price.unitAmount),
        hasStripePrice: Boolean(price.stripePriceId),
        isCheckoutReady: Boolean(price.stripePriceId),
      })),
      features: plan.features.map((feature) => ({
        key: feature.featureKey,
      })),
    }));
  }

  async getBillingHealth(tenantId: string) {
    const [
      activePublicPlansCount,
      checkoutReadyPlanPricesCount,
      tenant,
      subscription,
      recentWebhookFailuresCount,
    ] = await Promise.all([
      this.prisma.plan.count({
        where: {
          isActive: true,
          isPublic: true,
        },
      }),
      this.prisma.planPrice.count({
        where: {
          isActive: true,
          stripePriceId: { not: null },
          plan: {
            isActive: true,
            isPublic: true,
          },
        },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { customerAccount: true },
      }),
      this.prisma.subscription.findUnique({
        where: { tenantId },
        select: { id: true },
      }),
      this.prisma.stripeWebhookEvent.count({
        where: {
          processingStatus: 'FAILED',
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const portalConfiguredCheck = await this.checkPortalConfiguration();
    const warnings: string[] = [];

    if (!this.stripeBillingService.isWebhookSecretConfigured()) {
      warnings.push('Stripe webhook secret is not configured.');
    }
    if (activePublicPlansCount === 0) {
      warnings.push('No active public plans are available for tenants.');
    }
    if (checkoutReadyPlanPricesCount === 0) {
      warnings.push('No active public PlanPrice rows have Stripe Price IDs.');
    }
    if (portalConfiguredCheck === false) {
      warnings.push('Stripe Customer Portal configuration was not found.');
    }
    if (recentWebhookFailuresCount > 0) {
      warnings.push(
        `${recentWebhookFailuresCount} Stripe webhook failure${recentWebhookFailuresCount === 1 ? '' : 's'} occurred in the last 7 days.`,
      );
    }

    return {
      stripeConfigured: this.stripeBillingService.isSecretKeyConfigured(),
      webhookSecretConfigured:
        this.stripeBillingService.isWebhookSecretConfigured(),
      portalConfiguredCheck,
      activePublicPlansCount,
      checkoutReadyPlanPricesCount,
      currentTenantHasStripeCustomer: Boolean(
        tenant?.customerAccount?.stripeCustomerId,
      ),
      currentTenantHasSubscription: Boolean(subscription),
      warnings,
    };
  }

  async getStripeCustomerForTenant(tenantId: string) {
    const tenant = await this.findTenantBillingContext(tenantId);
    const stripeCustomerId = tenant.customerAccount.stripeCustomerId;

    if (stripeCustomerId) {
      return {
        tenantId: tenant.id,
        customerAccountId: tenant.customerAccount.id,
        stripeCustomerId,
      };
    }

    return this.createStripeCustomer({ tenantId });
  }

  async createStripeCustomer(input: { tenantId: string }) {
    const tenant = await this.findTenantBillingContext(input.tenantId);
    const existingStripeCustomerId = tenant.customerAccount.stripeCustomerId;

    if (existingStripeCustomerId) {
      return {
        tenantId: tenant.id,
        customerAccountId: tenant.customerAccount.id,
        stripeCustomerId: existingStripeCustomerId,
      };
    }

    const customer = await this.stripeBillingService.client.customers.create({
      name:
        tenant.customerAccount.legalCompanyName ??
        tenant.customerAccount.companyName,
      email:
        tenant.customerAccount.billingContactEmail ??
        tenant.customerAccount.primaryContactEmail ??
        tenant.customerAccount.contactEmail,
      phone:
        tenant.customerAccount.primaryContactPhone ??
        tenant.customerAccount.contactPhone ??
        undefined,
      metadata: {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        customerAccountId: tenant.customerAccount.id,
      },
    });

    await this.prisma.customerAccount.update({
      where: { id: tenant.customerAccount.id },
      data: {
        stripeCustomerId: customer.id,
      },
    });

    return {
      tenantId: tenant.id,
      customerAccountId: tenant.customerAccount.id,
      stripeCustomerId: customer.id,
    };
  }

  async createCheckoutSession(input: {
    tenantId: string;
    userId: string;
    planPriceId: string;
    promotionCode?: string;
  }) {
    const planPrice = await this.prisma.planPrice.findUnique({
      where: { id: input.planPriceId },
      include: {
        plan: true,
      },
    });

    if (!planPrice || !planPrice.isActive || !planPrice.plan.isActive) {
      throw new NotFoundException('Plan price not found.');
    }

    if (!planPrice.plan.isPublic) {
      throw new NotFoundException('Plan price not found.');
    }

    if (!planPrice.stripePriceId) {
      throw new BadRequestException(
        'This plan price is not connected to a Stripe Price ID.',
      );
    }

    const existingCheckout = await this.resolveCheckoutState(input.tenantId);
    if (existingCheckout) {
      return existingCheckout;
    }

    const customer = await this.getStripeCustomerForTenant(input.tenantId);
    const discounts = await this.resolveCheckoutDiscounts(input.promotionCode);
    const metadata = {
      tenantId: input.tenantId,
      customerAccountId: customer.customerAccountId,
      planId: planPrice.planId,
      planPriceId: planPrice.id,
      userId: input.userId,
    };

    const session =
      await this.stripeBillingService.client.checkout.sessions.create({
        mode: 'subscription',
        customer: customer.stripeCustomerId,
        line_items: [
          {
            price: planPrice.stripePriceId,
            quantity: 1,
          },
        ],
        success_url: this.resolveCheckoutUrl(
          'STRIPE_CHECKOUT_SUCCESS_URL',
          '/settings/billing/success?session_id={CHECKOUT_SESSION_ID}',
        ),
        cancel_url: this.resolveCheckoutUrl(
          'STRIPE_CHECKOUT_CANCEL_URL',
          '/settings/billing/cancel',
        ),
        client_reference_id: input.tenantId,
        metadata,
        subscription_data: {
          metadata,
        },
        discounts,
        allow_promotion_codes: discounts.length === 0,
      });

    return {
      id: session.id,
      url: session.url,
      reused: false,
    };
  }

  async createPortalSession(input: { tenantId: string }) {
    const tenant = await this.findTenantBillingContext(input.tenantId);
    const stripeCustomerId = tenant.customerAccount.stripeCustomerId;

    if (!stripeCustomerId) {
      throw new BadRequestException(
        'This tenant does not have a Stripe customer yet.',
      );
    }

    const session =
      await this.stripeBillingService.client.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: this.resolveCheckoutUrl(
          'STRIPE_PORTAL_RETURN_URL',
          '/settings/billing',
        ),
      });

    return {
      url: session.url,
    };
  }

  async getCurrentSubscription(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: {
          select: {
            id: true,
            key: true,
            name: true,
            description: true,
          },
        },
        planPrice: {
          select: {
            id: true,
            billingCycle: true,
            currency: true,
            unitAmount: true,
            isActive: true,
          },
        },
      },
    });

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      status: subscription.status,
      stripeStatus: subscription.stripeStatus,
      hasStripeCustomer: Boolean(subscription.stripeCustomerId),
      billingCycle: subscription.billingCycle,
      currency: subscription.currency,
      basePrice: Number(subscription.basePrice),
      finalPrice: Number(subscription.finalPrice),
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      renewalDate: subscription.renewalDate,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt,
      trialStart: subscription.trialStart,
      trialEnd: subscription.trialEnd,
      plan: subscription.plan,
      planPrice: subscription.planPrice
        ? {
            ...subscription.planPrice,
            unitAmount: Number(subscription.planPrice.unitAmount),
          }
        : null,
    };
  }

  async getInvoices(tenantId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      include: {
        subscription: {
          include: {
            plan: {
              select: { id: true, key: true, name: true },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    });

    return invoices.map((invoice) => mapTenantInvoice(invoice));
  }

  async getInvoiceDetail(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId,
      },
      include: {
        subscription: {
          include: {
            plan: {
              select: { id: true, key: true, name: true },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    return mapTenantInvoice(invoice);
  }

  verifyWebhookSignature(payload: Buffer, signature: string) {
    if (!Buffer.isBuffer(payload)) {
      throw new BadRequestException('Stripe webhook raw body is required.');
    }

    try {
      return this.stripeBillingService.client.webhooks.constructEvent(
        payload,
        signature,
        this.stripeBillingService.getWebhookSecret(),
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature.');
    }
  }

  retrieveStripeSubscription(stripeSubscriptionId: string) {
    return this.stripeBillingService.client.subscriptions.retrieve(
      stripeSubscriptionId,
    );
  }

  retrieveStripeInvoice(stripeInvoiceId: string) {
    return this.stripeBillingService.client.invoices.retrieve(stripeInvoiceId);
  }

  private async findTenantBillingContext(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        customerAccount: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    if (!tenant.customerAccount) {
      throw new BadRequestException(
        'Tenant is not linked to a customer account.',
      );
    }

    return tenant;
  }

  private async resolveCheckoutState(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        stripeSubscriptionId: true,
        stripeCheckoutSessionId: true,
        stripeCustomerId: true,
        updatedAt: true,
      },
    });

    if (
      subscription &&
      (
        [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
        ] as SubscriptionStatus[]
      ).includes(subscription.status)
    ) {
      throw new ConflictException(
        'This tenant already has an active subscription. Use billing management to change it.',
      );
    }

    if (
      subscription &&
      (
        [
          SubscriptionStatus.PAST_DUE,
          SubscriptionStatus.UNPAID,
        ] as SubscriptionStatus[]
      ).includes(subscription.status)
    ) {
      throw new ConflictException(
        subscription.stripeCustomerId
          ? 'This subscription has a payment issue. Use the billing portal to update payment details.'
          : 'This subscription has a payment issue and cannot start a new checkout session.',
      );
    }

    if (
      subscription?.status === SubscriptionStatus.INCOMPLETE &&
      subscription.stripeCheckoutSessionId &&
      Date.now() - subscription.updatedAt.getTime() < RECENT_CHECKOUT_WINDOW_MS
    ) {
      const session = await this.stripeBillingService.client.checkout.sessions
        .retrieve(subscription.stripeCheckoutSessionId)
        .catch(() => null);

      if (
        session &&
        session.status === 'open' &&
        typeof session.url === 'string' &&
        session.url
      ) {
        return {
          id: session.id,
          url: session.url,
          reused: true,
          message:
            'Returning the existing incomplete checkout session for this tenant.',
        };
      }
    }

    return null;
  }

  private async checkPortalConfiguration() {
    try {
      const configurations =
        await this.stripeBillingService.client.billingPortal.configurations.list(
          {
            active: true,
            limit: 1,
          },
        );

      return configurations.data.length > 0;
    } catch {
      return null;
    }
  }

  private async resolveCheckoutDiscounts(promotionCode?: string) {
    const code = promotionCode?.trim();

    if (!code) {
      return [] as Array<{ promotion_code: string }>;
    }

    const promotionCodes =
      await this.stripeBillingService.client.promotionCodes.list({
        active: true,
        code,
        limit: 1,
      });

    const promotion = promotionCodes.data[0];

    if (!promotion) {
      throw new BadRequestException('Promotion code is invalid or inactive.');
    }

    return [{ promotion_code: promotion.id }];
  }

  private resolveCheckoutUrl(envKey: string, fallbackPath: string) {
    const configuredUrl = this.configService.get<string>(envKey)?.trim();
    if (configuredUrl) {
      assertHttpUrl(configuredUrl, envKey);
      return configuredUrl;
    }

    const webAppUrl = this.configService.get<string>('WEB_APP_URL')?.trim();
    if (!webAppUrl) {
      throw new BadRequestException(
        `${envKey} or WEB_APP_URL must be configured for checkout.`,
      );
    }

    assertHttpUrl(webAppUrl, 'WEB_APP_URL');
    return `${webAppUrl.replace(/\/+$/, '')}${fallbackPath}`;
  }
}

function assertHttpUrl(value: string, key: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
  } catch {
    throw new BadRequestException(`${key} must be a valid http(s) URL.`);
  }
}

function mapTenantInvoice(invoice: {
  id: string;
  invoiceNumber: string;
  amount: { toString(): string } | number;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  stripeInvoiceId: string | null;
  stripeHostedInvoiceUrl: string | null;
  stripeInvoicePdfUrl: string | null;
  stripePaymentIntentId: string | null;
  subtotal: { toString(): string } | number | null;
  tax: { toString(): string } | number | null;
  total: { toString(): string } | number | null;
  amountPaid: { toString(): string } | number | null;
  amountDue: { toString(): string } | number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  subscription: {
    id: string;
    status: string;
    plan: { id: string; key: string; name: string };
  };
  payments: Array<{
    id: string;
    amount: { toString(): string } | number;
    currency: string;
    paymentMethod: string;
    status: string;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    paidAt: Date | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: Number(invoice.amount),
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    stripeInvoiceId: invoice.stripeInvoiceId,
    hostedInvoiceUrl: invoice.stripeHostedInvoiceUrl,
    invoicePdfUrl: invoice.stripeInvoicePdfUrl,
    stripePaymentIntentId: invoice.stripePaymentIntentId,
    subtotal: nullableNumber(invoice.subtotal),
    tax: nullableNumber(invoice.tax),
    total: nullableNumber(invoice.total),
    amountPaid: nullableNumber(invoice.amountPaid),
    amountDue: nullableNumber(invoice.amountDue),
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    subscription: {
      id: invoice.subscription.id,
      status: invoice.subscription.status,
      plan: invoice.subscription.plan,
    },
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      stripeChargeId: payment.stripeChargeId,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    })),
  };
}

function nullableNumber(value: { toString(): string } | number | null) {
  return value === null ? null : Number(value);
}
