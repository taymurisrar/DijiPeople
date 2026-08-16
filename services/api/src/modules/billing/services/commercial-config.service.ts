import { Injectable, Logger } from '@nestjs/common';
import {
  BillingInterval,
  CommercialPublicationStatus,
  CommercialSalesModel,
  MarketLaunchStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  isPublicSafeReason,
  resolveCommercialOffer,
  selectEffectivePrice,
  type CommercialOfferResult,
  type ResolvableMarket,
  type ResolvablePlan,
  type ResolvablePrice,
} from '../commercial-offer.resolver';

/**
 * Published commercial configuration — the single thing the public site,
 * Platform Admin and checkout all read.
 *
 * Before this existed the same question had several answers: the landing bundle
 * decided currency from a hardcoded country table (BUG-0028), Admin read legacy
 * `Plan` columns and checkout read `PlanPrice` (BUG-0027). Everything here
 * resolves through `resolveCommercialOffer`, so there is one set of rules and
 * one place to change them.
 */
@Injectable()
export class CommercialConfigService {
  private readonly logger = new Logger(CommercialConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the market serving a country.
   *
   * Returns null rather than guessing. A country nobody has mapped is a country
   * DijiPeople does not sell in yet, and inventing a market for it would be the
   * hardcoded-currency-table defect in a new location.
   */
  async resolveMarketForCountry(countryCode?: string | null) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || normalized.length !== 2) return null;

    const mapping = await this.prisma.marketCountry.findUnique({
      where: { countryCode: normalized },
      include: { market: true },
    });

    return mapping?.market ?? null;
  }

  /** The market a visitor with no resolvable country falls back to. */
  async resolveDefaultMarket() {
    return this.prisma.market.findFirst({
      where: {
        publicationStatus: CommercialPublicationStatus.PUBLISHED,
        isEnabled: true,
        launchStatus: {
          in: [MarketLaunchStatus.LAUNCHED, MarketLaunchStatus.PILOT],
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * The public commercial catalogue for one market.
   *
   * Only published, market-scoped, in-force prices appear. Unpublished
   * configuration is not merely hidden by the UI — it never leaves the API, so
   * a frontend mistake cannot expose next quarter's pricing.
   */
  async getPublicCommercialConfig(input: {
    countryCode?: string | null;
    /**
     * Development/test override. Ignored unless explicitly enabled, because a
     * public query parameter that selects a pricing market is a way to be
     * quoted another region's prices.
     */
    marketCodeOverride?: string | null;
    allowMarketOverride?: boolean;
    effectiveAt?: Date;
  }) {
    const effectiveAt = input.effectiveAt ?? new Date();

    const market =
      (input.allowMarketOverride && input.marketCodeOverride
        ? await this.prisma.market.findUnique({
            where: { code: input.marketCodeOverride.trim().toUpperCase() },
          })
        : null) ??
      (await this.resolveMarketForCountry(input.countryCode)) ??
      (await this.resolveDefaultMarket());

    if (!market) {
      // No market at all is a configuration problem, not a normal browse.
      this.logger.warn(
        `No commercial market resolved (country=${input.countryCode ?? 'unknown'}) and no default is published.`,
      );
      return {
        market: null,
        currency: null,
        plans: [],
        billingIntervals: [],
      };
    }

    const plans = await this.prisma.plan.findMany({
      where: {
        publicationStatus: CommercialPublicationStatus.PUBLISHED,
        isActive: true,
        isPublic: true,
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        features: { where: { isEnabled: true }, select: { featureKey: true } },
        prices: {
          where: {
            marketId: market.id,
            publicationStatus: CommercialPublicationStatus.PUBLISHED,
            isActive: true,
          },
        },
      },
    });

    const resolvableMarket = toResolvableMarket(market);

    const publicPlans = plans.map((plan) => {
      const resolvablePlan = toResolvablePlan(plan);
      const resolvablePrices = plan.prices.map(toResolvablePrice);

      const offers = [BillingInterval.MONTH, BillingInterval.YEAR].map(
        (billingInterval) => {
          const result = resolveCommercialOffer({
            plan: resolvablePlan,
            market: resolvableMarket,
            prices: resolvablePrices,
            currency: market.defaultCurrency,
            billingInterval,
            // Minimum-seat rules are surfaced separately; quoting the catalogue
            // should not fail merely because the caller named no team size.
            quantity: resolvablePrices[0]?.minimumSeats ?? 1,
            effectiveAt,
            channel: 'SELF_SERVICE',
          });

          return { billingInterval, result };
        },
      );

      return {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        description: plan.description,
        sortOrder: plan.sortOrder,
        salesModel: plan.salesModel,
        metadata: (plan.metadataJson as Record<string, unknown> | null) ?? null,
        features: plan.features.map((feature) => feature.featureKey),
        offers: offers.map(({ billingInterval, result }) => ({
          billingInterval,
          ...toPublicOffer(result),
        })),
      };
    });

    return {
      market: {
        code: market.code,
        name: market.name,
        selfServiceEnabled: market.selfServiceEnabled,
        launchStatus: market.launchStatus,
      },
      currency: market.defaultCurrency.toUpperCase(),
      billingIntervals: [BillingInterval.MONTH, BillingInterval.YEAR],
      plans: publicPlans,
    };
  }

  /**
   * The authoritative offer for a specific purchase intent. Checkout calls
   * this; the browser's idea of the price is never trusted.
   */
  async resolveOffer(input: {
    planId: string;
    countryCode?: string | null;
    marketCode?: string | null;
    currency?: string | null;
    billingInterval: BillingInterval;
    quantity: number;
    effectiveAt?: Date;
    channel: 'SELF_SERVICE' | 'OPERATOR';
  }): Promise<CommercialOfferResult> {
    const effectiveAt = input.effectiveAt ?? new Date();

    const market = input.marketCode
      ? await this.prisma.market.findUnique({
          where: { code: input.marketCode.trim().toUpperCase() },
        })
      : ((await this.resolveMarketForCountry(input.countryCode)) ??
        (await this.resolveDefaultMarket()));

    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
    });

    const prices = market
      ? await this.prisma.planPrice.findMany({
          where: { planId: input.planId, marketId: market.id },
        })
      : [];

    return resolveCommercialOffer({
      plan: plan ? toResolvablePlan(plan) : null,
      market: market ? toResolvableMarket(market) : null,
      prices: prices.map(toResolvablePrice),
      currency: input.currency,
      billingInterval: input.billingInterval,
      quantity: input.quantity,
      effectiveAt,
      channel: input.channel,
    });
  }

  /** Exposed for Admin so an operator can see what a market currently resolves. */
  async previewEffectivePrice(
    planId: string,
    marketId: string,
    currency: string,
    billingInterval: BillingInterval,
  ) {
    const prices = await this.prisma.planPrice.findMany({
      where: {
        planId,
        marketId,
        currency: currency.toUpperCase(),
        billingInterval,
      },
    });
    return selectEffectivePrice(prices.map(toResolvablePrice), new Date());
  }
}

type PlanRow = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  publicationStatus: CommercialPublicationStatus;
  salesModel: CommercialSalesModel;
};

function toResolvablePlan(plan: PlanRow): ResolvablePlan {
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    isActive: plan.isActive,
    publicationStatus: plan.publicationStatus,
    salesModel: plan.salesModel,
  };
}

function toResolvableMarket(market: {
  id: string;
  code: string;
  publicationStatus: CommercialPublicationStatus;
  launchStatus: MarketLaunchStatus;
  isEnabled: boolean;
  selfServiceEnabled: boolean;
  defaultCurrency: string;
  supportedCurrencies: string[];
}): ResolvableMarket {
  return {
    id: market.id,
    code: market.code,
    publicationStatus: market.publicationStatus,
    launchStatus: market.launchStatus,
    isEnabled: market.isEnabled,
    selfServiceEnabled: market.selfServiceEnabled,
    defaultCurrency: market.defaultCurrency,
    supportedCurrencies: market.supportedCurrencies,
  };
}

function toResolvablePrice(price: {
  id: string;
  planId: string;
  marketId: string | null;
  currency: string;
  billingInterval: BillingInterval;
  billingModel: 'PER_SEAT' | 'FLAT';
  unitAmount: unknown;
  minimumSeats: number;
  maximumSeats: number | null;
  includedSeats: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  version: number;
  publicationStatus: CommercialPublicationStatus;
  salesModel: CommercialSalesModel;
  isActive: boolean;
}): ResolvablePrice {
  return {
    ...price,
    unitAmount: Number(price.unitAmount),
  };
}

/**
 * Narrow an internal resolution result to what an anonymous visitor may see.
 *
 * Only reasons classified public-safe carry through; everything else becomes an
 * unspecific unavailability, because naming the failing precondition would
 * describe the shape of the commercial configuration to anyone who asked.
 */
function toPublicOffer(result: CommercialOfferResult) {
  if (result.available) {
    return {
      available: true as const,
      currency: result.currency,
      unitAmount: result.unitAmount,
      billingModel: result.billingModel,
      minimumSeats: result.minimumSeats,
      maximumSeats: result.maximumSeats,
      includedSeats: result.includedSeats,
      selfServiceEligible: result.selfServiceEligible,
      priceVersion: result.priceVersion,
    };
  }

  return {
    available: false as const,
    reason: isPublicSafeReason(result.reason) ? result.reason : 'UNAVAILABLE',
    message: isPublicSafeReason(result.reason)
      ? result.message
      : 'Pricing for this plan is arranged with our team.',
  };
}
