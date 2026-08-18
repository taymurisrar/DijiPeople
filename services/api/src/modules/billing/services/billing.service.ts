import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingInterval,
  BillingModel,
  CustomerAccountStatus,
  LeadStatus,
  Prisma,
  StripeEnvironment,
  StripeSyncStatus,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TENANT_FEATURE_DEFINITIONS } from '../../tenant-settings/tenant-settings.catalog';
import {
  assertValidTenantSlug,
  suggestTenantSlug,
} from '../../../common/utils/slug.util';
import { generateTenantCode } from '../../../common/utils/tenant-code.util';
import { StripeBillingService } from './stripe-billing.service';
import { SubscriptionOrderService } from './subscription-order.service';
import {
  calculateSeatPricing,
  buildRecurringCheckoutLineItem,
  deriveCheckoutReadiness,
  normalizePurchasedSeats,
  stripeEnvironmentFromMode,
} from '../billing-seat-pricing';

const RECENT_CHECKOUT_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeBillingService: StripeBillingService,
    private readonly configService: ConfigService,
    private readonly subscriptionOrders: SubscriptionOrderService,
  ) {}

  async getPublicPlans() {
    const featureCatalog = TENANT_FEATURE_DEFINITIONS.map((feature, index) => ({
      key: feature.key,
      label: feature.label,
      description: feature.description,
      categoryKey: feature.categoryKey ?? 'core',
      categoryLabel: feature.categoryLabel ?? 'Core HR',
      categoryOrder: feature.categoryOrder ?? 10,
      sortOrder: feature.sortOrder ?? index + 1,
      icon: feature.icon ?? 'check-circle',
      isVisible: feature.isVisible ?? true,
    }));
    const featureCatalogByKey = new Map<
      string,
      (typeof featureCatalog)[number]
    >(featureCatalog.map((feature) => [feature.key, feature]));

    const plans = await this.prisma.plan.findMany({
      where: {
        isActive: true,
        isPublic: true,
      },
      include: {
        features: {
          orderBy: { featureKey: 'asc' },
        },
        prices: {
          where: { isActive: true },
          orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const expectedStripeEnvironment = stripeEnvironmentFromMode(
      this.stripeBillingService.getRuntimeMode(),
    );
    const publicPlans = plans.map((plan) => {
      const metadata = normalizeJsonObject(plan.metadataJson);
      const billingCyclesByCurrency = new Map<string, Set<string>>();

      for (const price of plan.prices) {
        const currency = price.currency.toUpperCase();
        const cycles = billingCyclesByCurrency.get(currency) ?? new Set();
        cycles.add(price.billingCycle);
        billingCyclesByCurrency.set(currency, cycles);
      }

      return {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        description: plan.description,
        isActive: plan.isActive,
        isPublic: plan.isPublic,
        sortOrder: plan.sortOrder,
        currency: plan.currency,
        monthlyBasePrice: Number(plan.monthlyBasePrice),
        annualBasePrice: Number(plan.annualBasePrice),
        prices: plan.prices.map((price) => {
          const contract = mapSeatPriceContract(price);
          const readiness = deriveCheckoutReadiness(
            {
              ...contract,
              isActive: price.isActive,
              effectiveFrom: price.effectiveFrom,
              stripeProductId: price.stripeProductId,
              stripePriceId: price.stripePriceId,
              stripeEnvironment: price.stripeEnvironment,
              stripeSyncStatus: price.stripeSyncStatus,
              stripeActive: price.stripeActive,
              stripeUsageType: price.stripeUsageType,
              stripeRecurringInterval: price.stripeRecurringInterval,
              stripeVerifiedAt: price.stripeVerifiedAt,
            },
            expectedStripeEnvironment,
          );

          return {
            id: price.id,
            billingCycle: price.billingCycle,
            billingModel: price.billingModel,
            billingInterval: price.billingInterval,
            currency: price.currency.toUpperCase(),
            unitAmount: Number(price.unitAmount),
            pricePerSeat:
              price.billingModel === BillingModel.PER_SEAT
                ? Number(price.unitAmount)
                : null,
            minimumSeats: price.minimumSeats,
            maximumSeats: price.maximumSeats,
            includedSeats: price.includedSeats,
            effectiveFrom: price.effectiveFrom,
            isActive: price.isActive,
            stripeProductId: price.stripeProductId,
            hasStripePrice: Boolean(price.stripePriceId),
            checkoutReady: readiness.checkoutReady,
            isCheckoutReady: readiness.checkoutReady,
            checkoutReadinessReasons: readiness.reasons,
            stripeEnvironment: price.stripeEnvironment,
            stripeSyncStatus: price.stripeSyncStatus,
            stripeVerifiedAt: price.stripeVerifiedAt,
          };
        }),
        availableBillingCyclesByCurrency: Array.from(
          billingCyclesByCurrency.entries(),
        ).map(([currency, cycles]) => ({
          currency,
          billingCycles: Array.from(cycles).sort(),
        })),
        features: plan.features
          .map((feature) => {
            const catalogItem = featureCatalogByKey.get(feature.featureKey);
            return {
              id: feature.id,
              key: feature.featureKey,
              label: catalogItem?.label ?? toTitleCase(feature.featureKey),
              description: catalogItem?.description ?? null,
              categoryKey: catalogItem?.categoryKey ?? 'other',
              categoryLabel: catalogItem?.categoryLabel ?? 'Other',
              categoryOrder: catalogItem?.categoryOrder ?? 999,
              sortOrder: catalogItem?.sortOrder ?? 999,
              icon: catalogItem?.icon ?? 'check-circle',
              isVisible: catalogItem?.isVisible ?? true,
              isEnabled: feature.isEnabled,
            };
          })
          .filter((feature) => feature.isVisible),
        metadata,
        isPopular: readMetadataBoolean(metadata, ['isPopular', 'popular']),
        isRecommended: readMetadataBoolean(metadata, [
          'isRecommended',
          'recommended',
        ]),
      };
    });

    return {
      plans: publicPlans,
      featureCatalog,
      featureCategories: Array.from(
        new Map(
          featureCatalog.map((feature) => [
            feature.categoryKey,
            {
              key: feature.categoryKey,
              label: feature.categoryLabel,
              sortOrder: feature.categoryOrder,
            },
          ]),
        ).values(),
      ).sort((left, right) => left.sortOrder - right.sortOrder),
      presentation: {
        allowPlanComparison: true,
        allowSelfServiceUpgrade: true,
        showUpgradeOptions: true,
        showPricing: true,
        showDescriptions: true,
        contactLabel: 'Contact Administrator',
      },
      availableCurrencies: Array.from(
        new Set(
          publicPlans.flatMap((plan) =>
            plan.prices.map((price) => price.currency.toUpperCase()),
          ),
        ),
      ).sort(),
    };
  }

  async createPublicSubscriptionCheckout(input: {
    planPriceId: string;
    seatQuantity: number;
    companyName: string;
    contactName: string;
    email: string;
    phone?: string;
    country: string;
    message?: string;
    website?: string;
    detectedCountry?: string | null;
  }) {
    if (input.website?.trim()) {
      return { submitted: true };
    }

    const planPrice = await this.prisma.planPrice.findUnique({
      where: { id: input.planPriceId },
      include: { plan: true },
    });

    if (
      !planPrice ||
      !planPrice.isActive ||
      !planPrice.plan.isActive ||
      !planPrice.plan.isPublic
    ) {
      throw new NotFoundException('Plan price not found.');
    }

    const purchasedSeats = normalizePurchasedSeats(
      input.seatQuantity,
      planPrice,
    );
    const verifiedPrice = await this.verifyAndPersistPlanPrice(planPrice);
    if (!verifiedPrice.checkoutReady || !planPrice.stripePriceId) {
      throw new BadRequestException(
        `This price is not checkout-ready: ${verifiedPrice.reasons.join(' ')}`,
      );
    }
    const seatPricing = calculateSeatPricing(
      mapSeatPriceContract(planPrice),
      purchasedSeats,
    );

    const contactName = input.contactName.trim();
    const [firstName, ...lastNameParts] = contactName.split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'Owner';
    const companyName = input.companyName.trim();
    const email = input.email.trim().toLowerCase();
    const country = input.country.trim();
    const message = input.message?.trim() || null;

    /*
     * The order is opened BEFORE anything else is written, because it is what
     * makes this path idempotent. Previously every submission — a refresh, a
     * double click, a retried abandoned checkout — created a fresh Lead,
     * CustomerAccount, Tenant and Subscription, permanently consuming a tenant
     * slug each time. openOrder deduplicates the customer and returns the
     * existing order for a repeated submission.
     */
    const order = await this.subscriptionOrders.openOrder({
      planPriceId: planPrice.id,
      seatQuantity: purchasedSeats,
      companyName,
      contactName,
      email,
      phone: input.phone?.trim() || null,
      country,
      message,
    });

    // A repeated submission that already has a live Stripe session is sent
    // back to that session rather than being given a second one.
    if (order.reused && order.stripeCheckoutSessionId) {
      const existingSession =
        await this.stripeBillingService.client.checkout.sessions.retrieve(
          order.stripeCheckoutSessionId,
        );
      const existingOrder =
        await this.prisma.subscriptionOrder.findUniqueOrThrow({
          where: { id: order.orderId },
          select: { tenantId: true, leadId: true },
        });
      return {
        submitted: true,
        checkoutSessionId: existingSession.id,
        url: existingSession.url,
        tenantId: existingOrder.tenantId,
        leadId: existingOrder.leadId,
        orderNumber: order.orderNumber,
        reused: true,
      };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          contactFirstName: firstName,
          contactLastName: lastName,
          fullName: contactName,
          companyName,
          workEmail: email,
          phoneNumber: input.phone?.trim() || null,
          industry: 'Unknown',
          companySize: 'Unknown',
          country,
          requirementsSummary: message,
          message,
          interestedPlan: planPrice.plan.name,
          source: 'DijiPeople Public Subscribe',
          status: LeadStatus.QUALIFIED,
          subStatus: 'Subscription checkout started',
          isQualified: true,
        },
      });

      const customer = await tx.customerAccount.create({
        data: {
          companyName,
          primaryContactFirstName: firstName,
          primaryContactLastName: lastName,
          primaryContactEmail: email,
          primaryContactPhone: input.phone?.trim() || null,
          contactEmail: email,
          contactPhone: input.phone?.trim() || null,
          billingContactEmail: email,
          industry: 'Unknown',
          companySize: 'Unknown',
          country,
          selectedPlanId: planPrice.planId,
          preferredBillingCycle: planPrice.billingCycle,
          leadId: lead.id,
          status: CustomerAccountStatus.PROSPECT,
          subStatus: 'Pending Stripe checkout',
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          customerAccountId: customer.id,
          tenantCode: await generateTenantCode(tx),
          name: companyName,
          displayName: companyName,
          slug: await this.resolveUniqueTenantSlug(tx, companyName),
          status: TenantStatus.INACTIVE,
          subStatus: 'Pending payment',
          tenantBranding: {
            create: buildDefaultTenantBranding(companyName, email),
          },
        },
      });

      const subscription = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: planPrice.planId,
          planPriceId: planPrice.id,
          billingCycle: planPrice.billingCycle,
          basePrice: planPrice.unitAmount,
          finalPrice:
            seatPricing.estimatedMonthlyCharge ?? planPrice.unitAmount,
          currency: planPrice.currency,
          purchasedSeats,
          stripeQuantity: purchasedSeats,
          status: SubscriptionStatus.INCOMPLETE,
          startDate: new Date(),
          autoRenew: true,
        },
      });

      await tx.auditLog.createMany({
        data: [
          {
            tenantId: tenant.id,
            action: 'PUBLIC_SUBSCRIBE_FORM_SUBMITTED',
            entityType: 'Lead',
            entityId: lead.id,
            sourceModule: 'public-subscription',
            afterSnapshot: toPrismaJson({
              companyName,
              email,
              country,
              detectedCountry: input.detectedCountry,
              planPriceId: planPrice.id,
            }),
          },
          {
            tenantId: tenant.id,
            action: 'PUBLIC_TENANT_CREATED_INACTIVE',
            entityType: 'Tenant',
            entityId: tenant.id,
            sourceModule: 'public-subscription',
            afterSnapshot: toPrismaJson({
              tenantStatus: tenant.status,
              customerAccountId: customer.id,
              subscriptionId: subscription.id,
            }),
          },
        ],
      });

      return { lead, customer, tenant, subscription };
    });

    const stripeCustomer =
      await this.stripeBillingService.client.customers.create({
        name: companyName,
        email,
        phone: input.phone?.trim() || undefined,
        metadata: {
          tenantId: created.tenant.id,
          tenantSlug: created.tenant.slug,
          customerAccountId: created.customer.id,
          leadId: created.lead.id,
          source: 'public_website',
        },
      });

    await this.prisma.customerAccount.update({
      where: { id: created.customer.id },
      data: { stripeCustomerId: stripeCustomer.id },
    });

    const metadata = {
      tenantId: created.tenant.id,
      customerAccountId: created.customer.id,
      planId: planPrice.planId,
      planPriceId: planPrice.id,
      leadId: created.lead.id,
      publicSubscription: 'true',
      source: 'public_website',
      seatQuantity: String(purchasedSeats),
    };

    const session =
      await this.stripeBillingService.client.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomer.id,
        line_items: [
          buildRecurringCheckoutLineItem(
            planPrice.stripePriceId,
            purchasedSeats,
            planPrice.billingModel,
          ),
        ],
        success_url: this.resolvePublicCheckoutUrl(
          '/subscribe/success?session_id={CHECKOUT_SESSION_ID}',
        ),
        cancel_url: this.resolvePublicCheckoutUrl(
          `/subscribe/cancel?planPriceId=${planPrice.id}`,
        ),
        client_reference_id: created.tenant.id,
        metadata,
        subscription_data: { metadata },
        allow_promotion_codes: true,
      });

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: created.subscription.id },
        data: {
          stripeCustomerId: stripeCustomer.id,
          stripeCheckoutSessionId: session.id,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: created.tenant.id,
          action: 'STRIPE_CHECKOUT_SESSION_CREATED',
          entityType: 'Subscription',
          entityId: created.subscription.id,
          sourceModule: 'public-subscription',
          afterSnapshot: toPrismaJson({
            checkoutSessionId: session.id,
            stripeCustomerId: stripeCustomer.id,
            planPriceId: planPrice.id,
          }),
        },
      });
    });

    // The order now points at what payment will activate. Until WP-07 moves
    // tenant creation behind the payment, the tenant already exists here; the
    // order is still the record that survives an abandoned checkout.
    await this.prisma.subscriptionOrder.update({
      where: { id: order.orderId },
      data: {
        tenantId: created.tenant.id,
        subscriptionId: created.subscription.id,
        leadId: created.lead.id,
        stripeCustomerId: stripeCustomer.id,
        stripeCheckoutSessionId: session.id,
      },
    });

    return {
      submitted: true,
      checkoutSessionId: session.id,
      url: session.url,
      tenantId: created.tenant.id,
      leadId: created.lead.id,
      orderNumber: order.orderNumber,
      reused: false,
    };
  }

  async getBillingHealth(tenantId: string) {
    const [
      activePublicPlansCount,
      candidatePlanPrices,
      tenant,
      subscription,
      recentWebhookFailuresCount,
      lastSuccessfulWebhook,
      lastFailedWebhook,
    ] = await Promise.all([
      this.prisma.plan.count({
        where: {
          isActive: true,
          isPublic: true,
        },
      }),
      this.prisma.planPrice.findMany({
        where: {
          isActive: true,
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
      this.prisma.stripeWebhookEvent.findFirst({
        where: { processingStatus: 'PROCESSED' },
        orderBy: { processedAt: 'desc' },
        select: { processedAt: true, stripeEventId: true, type: true },
      }),
      this.prisma.stripeWebhookEvent.findFirst({
        where: { processingStatus: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        select: {
          updatedAt: true,
          stripeEventId: true,
          type: true,
          errorMessage: true,
        },
      }),
    ]);

    const portalConfiguredCheck = await this.checkPortalConfiguration();
    const expectedEnvironment = stripeEnvironmentFromMode(
      this.stripeBillingService.getRuntimeMode(),
    );
    const checkoutReadyPlanPricesCount = candidatePlanPrices.filter(
      (price) =>
        deriveCheckoutReadiness(
          {
            ...mapSeatPriceContract(price),
            isActive: price.isActive,
            effectiveFrom: price.effectiveFrom,
            stripeProductId: price.stripeProductId,
            stripePriceId: price.stripePriceId,
            stripeEnvironment: price.stripeEnvironment,
            stripeSyncStatus: price.stripeSyncStatus,
            stripeActive: price.stripeActive,
            stripeUsageType: price.stripeUsageType,
            stripeRecurringInterval: price.stripeRecurringInterval,
            stripeVerifiedAt: price.stripeVerifiedAt,
          },
          expectedEnvironment,
        ).checkoutReady,
    ).length;
    const connection = await this.stripeBillingService
      .verifyConnection()
      .catch(() => null);
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
      enabled: this.stripeBillingService.isSecretKeyConfigured(),
      mode: this.stripeBillingService.getRuntimeMode(),
      stripeConfigured: this.stripeBillingService.isSecretKeyConfigured(),
      keysConfigured: {
        secretKey: this.stripeBillingService.isSecretKeyConfigured(),
        webhookSecret: this.stripeBillingService.isWebhookSecretConfigured(),
      },
      stripeAccountId: connection?.accountId ?? null,
      lastVerification: connection?.verifiedAt ?? null,
      webhookSecretConfigured:
        this.stripeBillingService.isWebhookSecretConfigured(),
      webhookConfigured: this.stripeBillingService.isWebhookSecretConfigured(),
      lastSuccessfulWebhook,
      lastFailedWebhook,
      portalConfiguredCheck,
      checkoutSuccessUrl: this.resolveCheckoutUrl(
        'STRIPE_CHECKOUT_SUCCESS_URL',
        '/settings/subscription/success?session_id={CHECKOUT_SESSION_ID}',
      ),
      checkoutCancelUrl: this.resolveCheckoutUrl(
        'STRIPE_CHECKOUT_CANCEL_URL',
        '/settings/subscription/cancel',
      ),
      customerPortalReturnUrl: this.resolveCheckoutUrl(
        'STRIPE_PORTAL_RETURN_URL',
        '/settings/subscription/overview',
      ),
      activePublicPlansCount,
      checkoutReadyPlanPricesCount,
      currentTenantHasStripeCustomer: Boolean(
        tenant?.customerAccount?.stripeCustomerId,
      ),
      currentTenantHasSubscription: Boolean(subscription),
      warnings,
    };
  }

  async reconcileSubscriptionSeats(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });
    if (!subscription?.stripeSubscriptionId)
      throw new NotFoundException('Stripe subscription was not found.');
    const remote =
      await this.stripeBillingService.client.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );
    const item = remote.items.data[0];
    const stripeQuantity = item?.quantity ?? 1;
    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripeSubscriptionItemId: item?.id ?? null,
        stripeQuantity,
        purchasedSeats: stripeQuantity,
        seatsLastReconciledAt: new Date(),
      },
    });
    const usedSeats = await this.prisma.user.count({
      where: { tenantId, status: UserStatus.ACTIVE },
    });
    return {
      subscriptionId: updated.id,
      purchasedSeats: updated.purchasedSeats,
      usedSeats,
      availableSeats: Math.max(updated.purchasedSeats - usedSeats, 0),
      stripeQuantity: updated.stripeQuantity,
      reconciledAt: updated.seatsLastReconciledAt,
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
    seatQuantity: number;
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

    const purchasedSeats = normalizePurchasedSeats(
      input.seatQuantity,
      planPrice,
    );
    const verifiedPrice = await this.verifyAndPersistPlanPrice(planPrice);
    if (!verifiedPrice.checkoutReady || !planPrice.stripePriceId)
      throw new BadRequestException(
        `This price is not checkout-ready: ${verifiedPrice.reasons.join(' ')}`,
      );

    const existingCheckout = await this.resolveCheckoutState(
      input.tenantId,
      purchasedSeats,
    );
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
      seatQuantity: String(purchasedSeats),
    };

    const session =
      await this.stripeBillingService.client.checkout.sessions.create({
        mode: 'subscription',
        customer: customer.stripeCustomerId,
        line_items: [
          buildRecurringCheckoutLineItem(
            planPrice.stripePriceId,
            purchasedSeats,
            planPrice.billingModel,
          ),
        ],
        success_url: this.resolveCheckoutUrl(
          'STRIPE_CHECKOUT_SUCCESS_URL',
          '/settings/subscription/success?session_id={CHECKOUT_SESSION_ID}',
        ),
        cancel_url: this.resolveCheckoutUrl(
          'STRIPE_CHECKOUT_CANCEL_URL',
          '/settings/subscription/cancel',
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
          '/settings/subscription/overview',
        ),
      });

    return {
      url: session.url,
    };
  }

  async getCurrentSubscription(tenantId: string) {
    const [subscription, usedSeats] = await Promise.all([
      this.prisma.subscription.findUnique({
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
              billingModel: true,
              billingInterval: true,
              currency: true,
              unitAmount: true,
              minimumSeats: true,
              maximumSeats: true,
              includedSeats: true,
              isActive: true,
            },
          },
        },
      }),
      this.prisma.user.count({
        where: { tenantId, status: UserStatus.ACTIVE },
      }),
    ]);

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      status: subscription.status,
      stripeStatus: subscription.stripeStatus,
      hasStripeCustomer: Boolean(subscription.stripeCustomerId),
      isStripeBacked: Boolean(subscription.stripeSubscriptionId),
      billingCycle: subscription.billingCycle,
      basePrice: Number(subscription.basePrice),
      finalPrice: Number(subscription.finalPrice),
      ...calculateSeatPricing(
        subscription.planPrice
          ? mapSeatPriceContract(subscription.planPrice)
          : {
              billingModel: BillingModel.FLAT,
              billingInterval:
                subscription.billingCycle === 'ANNUAL'
                  ? BillingInterval.YEAR
                  : BillingInterval.MONTH,
              unitAmount: Number(subscription.finalPrice),
              currency: subscription.currency,
              minimumSeats: 1,
              maximumSeats: null,
              includedSeats: 0,
            },
        subscription.purchasedSeats,
        usedSeats,
      ),
      stripeQuantity: subscription.stripeQuantity,
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

  private async resolveCheckoutState(tenantId: string, purchasedSeats: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        stripeSubscriptionId: true,
        stripeCheckoutSessionId: true,
        stripeCustomerId: true,
        updatedAt: true,
        purchasedSeats: true,
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
      subscription.purchasedSeats === purchasedSeats &&
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

  private async verifyAndPersistPlanPrice(price: {
    id: string;
    stripePriceId: string | null;
    stripeProductId: string | null;
    currency: string;
    unitAmount: Prisma.Decimal;
    billingModel: BillingModel;
    billingInterval: BillingInterval;
    minimumSeats: number;
    maximumSeats: number | null;
    includedSeats: number;
    effectiveFrom: Date;
    isActive: boolean;
  }) {
    const expectedEnvironment = stripeEnvironmentFromMode(
      this.stripeBillingService.getRuntimeMode(),
    );
    if (!price.stripePriceId) {
      return { checkoutReady: false, reasons: ['Stripe Price ID is missing.'] };
    }

    try {
      const verified = await this.stripeBillingService.verifyRecurringPrice({
        stripePriceId: price.stripePriceId,
        expectedProductId: price.stripeProductId,
        expectedCurrency: price.currency,
        expectedUnitAmount: Number(price.unitAmount),
        expectedBillingInterval: price.billingInterval,
      });
      const environment = verified.livemode
        ? StripeEnvironment.LIVE
        : StripeEnvironment.TEST;
      const syncStatus =
        environment !== expectedEnvironment
          ? StripeSyncStatus.ENVIRONMENT_MISMATCH
          : verified.valid
            ? StripeSyncStatus.SYNCED
            : StripeSyncStatus.FAILED;
      await this.prisma.planPrice.update({
        where: { id: price.id },
        data: {
          stripeProductId: verified.productId,
          stripeEnvironment: environment,
          stripeSyncStatus: syncStatus,
          stripeActive: verified.active,
          stripeUsageType: verified.usageType,
          stripeRecurringInterval: verified.recurringInterval,
          stripeVerifiedAt: verified.verifiedAt,
          stripeVerificationError: verified.reasons.join(' ') || null,
        },
      });
      return deriveCheckoutReadiness(
        {
          ...mapSeatPriceContract(price),
          isActive: price.isActive,
          effectiveFrom: price.effectiveFrom,
          stripeProductId: verified.productId,
          stripePriceId: price.stripePriceId,
          stripeEnvironment: environment,
          stripeSyncStatus: syncStatus,
          stripeActive: verified.active,
          stripeUsageType: verified.usageType,
          stripeRecurringInterval: verified.recurringInterval,
          stripeVerifiedAt: verified.verifiedAt,
        },
        expectedEnvironment,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Stripe verification failed.';
      await this.prisma.planPrice.update({
        where: { id: price.id },
        data: {
          stripeSyncStatus: StripeSyncStatus.FAILED,
          stripeActive: false,
          stripeVerifiedAt: new Date(),
          stripeVerificationError: message,
        },
      });
      return { checkoutReady: false, reasons: [message] };
    }
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

  private resolvePublicCheckoutUrl(path: string) {
    const configuredUrl =
      this.configService.get<string>('LANDING_APP_URL')?.trim() ||
      this.configService.get<string>('PUBLIC_APP_URL')?.trim() ||
      this.configService.get<string>('WEB_APP_URL')?.trim();

    if (!configuredUrl) {
      throw new BadRequestException(
        'LANDING_APP_URL or WEB_APP_URL must be configured for public checkout.',
      );
    }

    assertHttpUrl(configuredUrl, 'LANDING_APP_URL');
    return `${configuredUrl.replace(/\/+$/, '')}${path}`;
  }

  private async resolveUniqueTenantSlug(
    tx: Prisma.TransactionClient,
    companyName: string,
  ) {
    const base = assertValidTenantSlug(
      suggestTenantSlug(companyName) || 'workspace',
    );

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
      const candidate = assertValidTenantSlug(
        `${base.slice(0, 63 - suffix.length)}${suffix}`,
      );
      const existing = await tx.tenant.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }

    throw new ConflictException('Unable to allocate a tenant slug.');
  }
}

function buildDefaultTenantBranding(
  companyName: string,
  supportEmail?: string,
) {
  const brandName = companyName.trim() || 'DijiPeople';

  return {
    appTitle: 'DijiPeople',
    brandName,
    shortBrandName: brandName.split(/\s+/)[0] || brandName,
    portalTagline: 'People operations made simple',
    loginTitle: `Welcome to ${brandName} HR Portal`,
    loginSubtitle:
      'Sign in after your subscription is activated to manage HR operations.',
    loginFooterText: 'Powered by DijiPeople',
    supportEmail: supportEmail || null,
    primaryColor: '#0f766e',
    secondaryColor: '#115e59',
    accentColor: '#14b8a6',
    backgroundColor: '#f8fafc',
    surfaceColor: '#ffffff',
    textColor: '#0f172a',
    mutedTextColor: '#64748b',
    fontFamily: 'Inter',
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeJsonObject(value: Prisma.JsonValue | null) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, unknown>;
}

function readMetadataBoolean(
  metadata: Record<string, unknown> | null,
  keys: string[],
) {
  if (!metadata) return false;

  return keys.some((key) => metadata[key] === true);
}

function toTitleCase(value: string) {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\w\S*/g, (part) => part.charAt(0).toUpperCase() + part.slice(1));
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

function mapSeatPriceContract(price: {
  billingModel: BillingModel;
  billingInterval: BillingInterval;
  unitAmount: Prisma.Decimal | number;
  currency: string;
  minimumSeats: number;
  maximumSeats: number | null;
  includedSeats: number;
}) {
  return {
    billingModel: price.billingModel,
    billingInterval: price.billingInterval,
    unitAmount: Number(price.unitAmount),
    currency: price.currency,
    minimumSeats: price.minimumSeats,
    maximumSeats: price.maximumSeats,
    includedSeats: price.includedSeats,
  };
}
