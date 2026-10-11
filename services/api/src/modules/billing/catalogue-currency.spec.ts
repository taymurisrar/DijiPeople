import {
  CommercialPublicationStatus,
  CommercialSalesModel,
} from '@prisma/client';
import {
  CommercialConfigService,
  resolveCatalogueCurrency,
} from './services/commercial-config.service';

/**
 * REG — Pakistan saw USD and "Pricing on request"; the US saw "Pricing on
 * request" too (production, 2026-10-11).
 *
 * Both fixtures below are the production rows as read on that date:
 *
 * - `PK` market: `defaultCurrency: USD`, `supportedCurrencies: [USD, PKR]`,
 *   every price PKR. The catalogue quoted the default currency, found nothing
 *   priced in it, and refused every plan.
 * - `US` country → `US` market, which is DRAFT / PLANNED / disabled. The
 *   visitor was pinned to a market that can sell nothing instead of falling
 *   back to the published INTL USD schedule.
 */
describe('public catalogue currency and market', () => {
  const published = {
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    isActive: true,
  };

  it('quotes a market in the supported currency it is actually priced in', () => {
    expect(
      resolveCatalogueCurrency(
        { defaultCurrency: 'USD', supportedCurrencies: ['USD', 'PKR'] },
        [
          {
            ...published,
            currency: 'PKR',
            salesModel: CommercialSalesModel.SELF_SERVICE,
          },
          {
            ...published,
            currency: 'PKR',
            salesModel: CommercialSalesModel.SALES_ASSISTED,
          },
        ],
      ),
    ).toBe('PKR');
  });

  it('keeps the default currency when it is priced', () => {
    expect(
      resolveCatalogueCurrency(
        { defaultCurrency: 'QAR', supportedCurrencies: ['QAR', 'USD'] },
        [
          {
            ...published,
            currency: 'USD',
            salesModel: CommercialSalesModel.SELF_SERVICE,
          },
          {
            ...published,
            currency: 'QAR',
            salesModel: CommercialSalesModel.SELF_SERVICE,
          },
        ],
      ),
    ).toBe('QAR');
  });

  it('ignores sales-assisted and unpublished rows when choosing', () => {
    expect(
      resolveCatalogueCurrency(
        { defaultCurrency: 'USD', supportedCurrencies: ['USD', 'PKR'] },
        [
          {
            ...published,
            currency: 'PKR',
            salesModel: CommercialSalesModel.SALES_ASSISTED,
          },
          {
            ...published,
            publicationStatus: CommercialPublicationStatus.DRAFT,
            currency: 'PKR',
            salesModel: CommercialSalesModel.SELF_SERVICE,
          },
        ],
      ),
    ).toBe('USD');
  });

  function serviceWithMapping(market: Record<string, unknown>) {
    const instance = Object.create(
      CommercialConfigService.prototype,
    ) as CommercialConfigService;
    (instance as unknown as { prisma: unknown }).prisma = {
      marketCountry: {
        findUnique: () => Promise.resolve({ market }),
      },
    };
    return instance;
  }

  it('does not pin a country to a market that is not selling', async () => {
    const service = serviceWithMapping({
      code: 'US',
      publicationStatus: 'DRAFT',
      launchStatus: 'PLANNED',
      isEnabled: false,
    });
    await expect(service.resolveMarketForCountry('US')).resolves.toBeNull();
  });

  it('still resolves a country to its launched market', async () => {
    const service = serviceWithMapping({
      code: 'PK',
      publicationStatus: 'PUBLISHED',
      launchStatus: 'LAUNCHED',
      isEnabled: true,
    });
    await expect(service.resolveMarketForCountry('pk')).resolves.toMatchObject({
      code: 'PK',
    });
  });
});
