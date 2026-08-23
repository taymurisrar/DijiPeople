import { CommercialConfigService } from './services/commercial-config.service';
import {
  DEFAULT_MARKET_DEFINITIONS,
  FALLBACK_MARKET_CODE,
} from '../super-admin/markets.catalog';

/**
 * REG — an unmapped country is quoted in USD, not in whatever sorts first.
 *
 * The requirement is plain: Qatar sees QAR, Pakistan sees PKR, the United
 * States sees USD, and anywhere else falls back to USD.
 *
 * The first three are `MarketCountry` rows. The fourth was
 * `resolveDefaultMarket`, which took the first published, enabled, LAUNCHED
 * market ordered by `sortOrder` — and that is `PK` at 10, not `INTL` at 25. So
 * a visitor in Germany would have been quoted PKR.
 *
 * It was invisible in production for a different reason: `MarketCountry` was
 * empty, so *every* visitor fell through to the default and the default
 * happened to be the only market resolving at all. Everyone saw QAR, including
 * Pakistan and the US. Restoring the country mappings — the obvious fix — is
 * precisely what would have surfaced the fallback bug, on the same deploy, as
 * a new symptom. Hence this test alongside that repair rather than after it.
 *
 * `sortOrder` is a display concern. It must not decide what an unrecognised
 * visitor is charged in.
 */
describe('market fallback', () => {
  /*
   * Returned as the class itself, with the injected doubles written through a
   * separate alias.
   *
   * Intersecting `CommercialConfigService` with `{ prisma: unknown }` — the
   * obvious way to write this — makes the whole type unresolvable to
   * typescript-eslint, so every call on it raised `no-unsafe-*`. Eight
   * warnings, which is enough to breach the repository's warning ceiling on
   * its own. The ceiling is a ratchet and the instruction above it is explicit:
   * reduce the warnings rather than raise the number.
   */
  function service(
    markets: Array<Record<string, unknown>>,
  ): CommercialConfigService {
    const instance = Object.create(
      CommercialConfigService.prototype,
    ) as CommercialConfigService;

    const internals = instance as unknown as {
      prisma: unknown;
      logger: unknown;
    };

    internals.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    internals.prisma = {
      market: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          const selling = markets.filter(
            (market) =>
              market.publicationStatus === 'PUBLISHED' &&
              market.isEnabled === true &&
              ['LAUNCHED', 'PILOT'].includes(String(market.launchStatus)),
          );
          if (typeof where.code === 'string') {
            return selling.find((market) => market.code === where.code) ?? null;
          }
          return (
            [...selling].sort(
              (a, b) => Number(a.sortOrder) - Number(b.sortOrder),
            )[0] ?? null
          );
        },
      },
    };

    return instance;
  }

  /** The catalog as seeded, so the test moves when the catalog does. */
  const seeded = DEFAULT_MARKET_DEFINITIONS.map((definition) => ({
    code: definition.code,
    defaultCurrency: definition.defaultCurrency,
    sortOrder: definition.sortOrder,
    isEnabled: definition.isEnabled,
    launchStatus: definition.launchStatus,
    publicationStatus: definition.published ? 'PUBLISHED' : 'DRAFT',
  }));

  it('falls back to the named market, in USD', async () => {
    const market = await service(seeded).resolveDefaultMarket();

    expect(market).toMatchObject({
      code: FALLBACK_MARKET_CODE,
      defaultCurrency: 'USD',
    });
  });

  it('does not fall back to whichever market sorts first', async () => {
    /*
     * The assertion that would have caught the defect. `PK` is published,
     * enabled, LAUNCHED and sorts lowest, so it is what the old implementation
     * returned — and PKR is not what an unrecognised visitor should be quoted.
     */
    const lowestSorted = [...seeded]
      .filter(
        (market) =>
          market.publicationStatus === 'PUBLISHED' &&
          market.isEnabled &&
          market.launchStatus === 'LAUNCHED',
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];

    expect(lowestSorted?.code).not.toBe(FALLBACK_MARKET_CODE);

    const market = await service(seeded).resolveDefaultMarket();
    expect(market?.code).not.toBe(lowestSorted?.code);
  });

  it('still serves a price when the named fallback is missing', async () => {
    /*
     * Degrading to the sweep rather than to nothing. A database whose `INTL`
     * market was never seeded, or was deliberately unpublished, should still
     * quote somebody — returning null would take the public catalogue down for
     * every unmapped country at once.
     */
    const withoutIntl = seeded.filter(
      (market) => market.code !== FALLBACK_MARKET_CODE,
    );

    const market = await service(withoutIntl).resolveDefaultMarket();

    expect(market).not.toBeNull();
    expect(market?.code).not.toBe(FALLBACK_MARKET_CODE);
  });

  it('the catalog can actually satisfy the requirement', () => {
    /*
     * The mappings the requirement names, checked against the catalog rather
     * than against the database — a country claimed by no market resolves to
     * the fallback, which for PK or US would be the wrong currency.
     */
    const marketFor = (country: string) =>
      DEFAULT_MARKET_DEFINITIONS.find((definition) =>
        (definition.countryCodes as readonly string[]).includes(country),
      );

    expect(marketFor('QA')?.defaultCurrency).toBe('QAR');
    expect(marketFor('PK')?.defaultCurrency).toBe('PKR');
    expect(marketFor('US')?.defaultCurrency).toBe('USD');

    const fallback = DEFAULT_MARKET_DEFINITIONS.find(
      (definition) => definition.code === FALLBACK_MARKET_CODE,
    );
    expect(fallback?.defaultCurrency).toBe('USD');
    // A catch-all that claimed countries would collide with every market added
    // later, since `MarketCountry.countryCode` is globally unique.
    expect(fallback?.countryCodes).toEqual([]);
  });
});
