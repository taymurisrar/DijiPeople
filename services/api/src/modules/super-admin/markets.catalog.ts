import { CommercialSalesModel, MarketLaunchStatus } from '@prisma/client';

/**
 * Seeded commercial markets.
 *
 * Two rules govern what appears here, and both matter more than completeness:
 *
 * 1. **No invented commercial or legal facts.** `taxProfileRef`,
 *    `legalDocumentSetRef` and `dataRegion` are left null wherever the
 *    repository holds no evidence for them. A null is a market that must not
 *    claim a tax registration, a legal entity or a residency guarantee it does
 *    not have — which is the difference between architecture that is ready for
 *    a market and a public claim that we operate in one.
 *
 * 2. **Only priced markets are open.** Pakistan, Qatar and International carry
 *    the schedule the owner set on 2026-08-20 and are `LAUNCHED`. `US` and
 *    `GCC` remain configuration only — `PLANNED`, disabled, no prices — so the
 *    model is exercised and opening one is a data change rather than a deploy.
 *    Nothing about their presence implies availability.
 *
 *    This rule used to read "Only Pakistan is open", which was true while the
 *    only prices this repository held evidence for were invented USD figures.
 */
export const DEFAULT_MARKET_DEFINITIONS = [
  {
    code: 'PK',
    name: 'Pakistan',
    description: 'Primary launch market.',
    launchStatus: MarketLaunchStatus.LAUNCHED,
    isEnabled: true,
    selfServiceEnabled: true,
    published: true,
    // PKR, as of 2026-08-20.
    //
    // This read USD until the owner supplied a real PKR schedule. The comment
    // it replaces said the default "moves to PKR at that point", and this is
    // that point — the condition it named has been met rather than overruled.
    // USD stays supported so an international buyer in Pakistan can still be
    // quoted in it.
    defaultCurrency: 'PKR',
    supportedCurrencies: ['PKR', 'USD'],
    countryCodes: ['PK'],
    dataRegion: null,
    taxProfileRef: null,
    legalDocumentSetRef: null,
    sortOrder: 10,
  },
  {
    code: 'US',
    name: 'United States',
    description: 'Planned expansion market. Not open for business.',
    launchStatus: MarketLaunchStatus.PLANNED,
    isEnabled: false,
    selfServiceEnabled: false,
    published: false,
    defaultCurrency: 'USD',
    supportedCurrencies: ['USD'],
    countryCodes: ['US'],
    dataRegion: null,
    taxProfileRef: null,
    legalDocumentSetRef: null,
    sortOrder: 20,
  },
  {
    code: 'GCC',
    name: 'Gulf Cooperation Council',
    description: 'Planned expansion market. Not open for business.',
    launchStatus: MarketLaunchStatus.PLANNED,
    isEnabled: false,
    selfServiceEnabled: false,
    published: false,
    // Each GCC state has its own currency; grouping them here reflects that
    // they are one commercial expansion decision, not one currency. The
    // per-country currency split becomes separate markets if and when the
    // commercial model actually differs between them.
    defaultCurrency: 'USD',
    supportedCurrencies: ['USD', 'AED', 'SAR', 'QAR'],
    // 'QA' deliberately absent: Qatar is its own launched market below.
    //
    // `MarketCountry.countryCode` is UNIQUE globally, not per market, so two
    // markets cannot both claim it — and `ensureMarkets` treats a unique
    // violation as benign, which means leaving it here would create the Qatar
    // market with no country row at all, silently. The migration
    // 20260820140000 moves the existing row on databases seeded before this.
    countryCodes: ['AE', 'SA', 'KW', 'BH', 'OM'],
    dataRegion: null,
    taxProfileRef: null,
    legalDocumentSetRef: null,
    sortOrder: 30,
  },
  {
    code: 'QA',
    name: 'Qatar',
    description: 'Launch market. Priced in QAR.',
    launchStatus: MarketLaunchStatus.LAUNCHED,
    isEnabled: true,
    selfServiceEnabled: true,
    published: true,
    defaultCurrency: 'QAR',
    supportedCurrencies: ['QAR', 'USD'],
    countryCodes: ['QA'],
    // Null for the same reason as every other market here: this repository
    // holds no evidence of a Qatari tax registration or legal entity, and a
    // non-null value would be a public claim rather than a configuration.
    dataRegion: null,
    taxProfileRef: null,
    legalDocumentSetRef: null,
    sortOrder: 15,
  },
  {
    code: 'INTL',
    name: 'International',
    description:
      'Launch market for buyers outside Pakistan and Qatar. Priced in USD.',
    launchStatus: MarketLaunchStatus.LAUNCHED,
    isEnabled: true,
    selfServiceEnabled: true,
    published: true,
    defaultCurrency: 'USD',
    supportedCurrencies: ['USD'],
    /*
     * No country codes, and that is the point.
     *
     * `MarketCountry.countryCode` is globally unique, so a catch-all market
     * cannot enumerate "everywhere else" without colliding with every market
     * added later. INTL is resolved as the fallback when no country-specific
     * market matches, not by listing countries.
     */
    countryCodes: [],
    dataRegion: null,
    taxProfileRef: null,
    legalDocumentSetRef: null,
    sortOrder: 25,
  },
] as const;

/**
 * The market a visitor falls back to when their country maps to nothing.
 *
 * Named, rather than derived from `sortOrder`. `resolveDefaultMarket` used to
 * take the first published, launched, enabled market by sort order — which is
 * `PK` at 10 — so every visitor outside a mapped country would have been quoted
 * PKR. That was invisible while `MarketCountry` was empty and *everything*
 * landed on the default, because the default happened to be the only market
 * that resolved at all.
 *
 * The requirement is that an unmapped country sees USD, and `INTL` is the
 * market that exists to serve exactly that: LAUNCHED, published, USD, and
 * deliberately claiming no countries. Sort order is a display concern and must
 * not decide what an unrecognised visitor is charged in.
 */
export const FALLBACK_MARKET_CODE = 'INTL';

/*
 * `SEEDED_PRICE_MARKET_CODE` and `PLACEHOLDER_PKR_PRICES` used to live here and
 * were removed on 2026-08-20.
 *
 * The first named the single market that carried prices — `'PK'` — which stopped
 * being true when Pakistan, Qatar and International were each given a schedule.
 * A constant asserting there is one priced market is worse than no constant at
 * all once there are three.
 *
 * The second was a DRAFT PKR schedule of round, deliberately-wrong numbers,
 * seeded so the local-currency path could be exercised before anyone had
 * decided what DijiPeople charges in Pakistan. That decision has been made, the
 * real schedule is in `pricing.catalog.ts`, and inventing numbers alongside real
 * ones is how the two get confused.
 */

export const DEFAULT_PLAN_SALES_MODELS: Record<string, CommercialSalesModel> = {
  starter: CommercialSalesModel.SELF_SERVICE,
  growth: CommercialSalesModel.SELF_SERVICE,
  enterprise: CommercialSalesModel.SELF_SERVICE,
  /*
   * Enterprise+ is the exception the paragraph above describes, and it is
   * CUSTOM_ONLY at the PLAN level rather than the price level — deliberately.
   *
   * `narrowestSalesModel` lets a plan's model narrow a price's but never widen
   * it, so no permissive price row can accidentally make Enterprise+
   * self-service. Above 250 employees the terms are negotiated; there is no
   * list price to publish.
   */
  'enterprise-plus': CommercialSalesModel.CUSTOM_ONLY,
};
