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
 * 2. **Only Pakistan is open.** Future markets exist as configuration so the
 *    model is exercised and so opening one is a data change rather than a
 *    deploy, but they are `PLANNED`, disabled, and have no prices. Nothing
 *    about their presence implies availability.
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
    // USD, not PKR — deliberately.
    //
    // The only plan prices this repository holds evidence for are the USD
    // amounts in plans.catalog.ts (199/399/899 monthly). Seeding a PKR figure
    // would mean inventing what DijiPeople charges in its launch market, which
    // is a commercial decision no agent gets to make. PKR is listed as
    // supported so the price schedule can be added in Admin without a schema
    // or seed change; the market default moves to PKR at that point.
    //
    // Recorded as OWNER_DECISION_REQUIRED in the Wave 1 report.
    defaultCurrency: 'USD',
    supportedCurrencies: ['USD', 'PKR'],
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
    countryCodes: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
    dataRegion: null,
    taxProfileRef: null,
    legalDocumentSetRef: null,
    sortOrder: 30,
  },
] as const;

/**
 * Which market a plan's seeded prices belong to. Only the launch market gets
 * prices — a planned market with a published price would be purchasable the
 * moment someone enabled it, which is not a state anyone should be able to
 * reach by accident.
 */
export const SEEDED_PRICE_MARKET_CODE = 'PK';

/**
 * Sales model per seeded plan.
 *
 * Enterprise is SELF_SERVICE on purpose. The requirement is explicit that a
 * standard published Enterprise plan stays self-service and is not hardcoded to
 * "Contact sales"; routing to sales is a configuration decision made per plan
 * or per price, not a property of the word "enterprise".
 */
export const DEFAULT_PLAN_SALES_MODELS: Record<string, CommercialSalesModel> = {
  starter: CommercialSalesModel.SELF_SERVICE,
  growth: CommercialSalesModel.SELF_SERVICE,
  enterprise: CommercialSalesModel.SELF_SERVICE,
};
