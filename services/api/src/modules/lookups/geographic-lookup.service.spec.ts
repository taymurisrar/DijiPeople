import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DEFAULT_COUNTRIES } from './lookups.catalog';
import { GeographicLookupService } from './geographic-lookup.service';

describe('GeographicLookupService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ensures local country defaults before returning lookup values', async () => {
    const countries = DEFAULT_COUNTRIES.map((country, index) => ({
      id: `country-${index}`,
      ...country,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const upsert = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue(countries);
    const prisma = {
      country: {
        upsert,
        count: jest.fn().mockResolvedValue(countries.length),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ updatedAt: new Date() })
          .mockResolvedValueOnce(null),
        findMany,
      },
    } as unknown as PrismaService;
    const configService = {
      get: jest.fn(),
    } as unknown as ConfigService;
    const service = new GeographicLookupService(prisma, configService);
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await service.listCountries();

    expect(upsert).toHaveBeenCalledTimes(DEFAULT_COUNTRIES.length);
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual(countries);
  });

  it('returns local defaults when the countries provider is unavailable', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const countries = DEFAULT_COUNTRIES.map((country, index) => ({
      id: `country-${index}`,
      ...country,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const prisma = {
      country: {
        upsert,
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue(countries),
      },
    } as unknown as PrismaService;
    const configService = {
      get: jest.fn().mockReturnValue('https://geography.invalid/countries'),
    } as unknown as ConfigService;
    const service = new GeographicLookupService(prisma, configService);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network blocked'));

    const result = await service.listCountries();

    expect(upsert).toHaveBeenCalledTimes(DEFAULT_COUNTRIES.length);
    expect(result).toEqual(countries);
  });

  it('imports countries from the CountriesNow ISO payload', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      country: {
        upsert,
        count: jest.fn().mockResolvedValue(0),
        createMany,
        findFirst: jest.fn().mockResolvedValue(null),
        findMany,
      },
    } as unknown as PrismaService;
    const configService = {
      get: jest
        .fn()
        .mockReturnValue('https://countriesnow.space/api/v0.1/countries/iso'),
    } as unknown as ConfigService;
    const service = new GeographicLookupService(prisma, configService);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        error: false,
        data: [
          { name: 'Pakistan', Iso2: 'PK', Iso3: 'PAK' },
          { name: 'Saudi Arabia', Iso2: 'SA', Iso3: 'SAU' },
        ],
      }),
    } as Response);

    await service.listCountries();

    /*
     * `sortOrder: 0` for both, not 0 and 1 — BUG-1305.
     *
     * This assertion used to pin the alphabetical index the import wrote, which
     * is exactly the behaviour that collided with the priority ranks in
     * DEFAULT_COUNTRIES. Imported countries are now unpinned, and the `name`
     * tiebreak in the `findMany` below already orders them alphabetically, so
     * nothing is lost by not numbering them.
     */
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { code: 'PK', name: 'Pakistan', sortOrder: 0 },
        { code: 'SA', name: 'Saudi Arabia', sortOrder: 0 },
      ],
      skipDuplicates: true,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });
});

/*
 * BUG-1305 — `sortOrder` had two writers filling the same range.
 *
 * The ISO import numbered all 250 countries 0..249 by alphabetical position;
 * DEFAULT_COUNTRIES gave the eight priority markets 10, 20, .. 80 as ranks. The
 * ranges overlapped, so `sortOrder: 10` was held by both Argentina and the
 * United States and, under [sortOrder asc, name asc], "United States" rendered
 * between Argentina and Armenia. Exactly eight values collided, and they were
 * the eight markets that matter most.
 *
 * These assert the invariant that makes the collision impossible rather than
 * re-checking the eight numbers: the priority band is negative, the unpinned
 * default is 0, and the two cannot meet.
 */
describe('country sort bands', () => {
  it('pins every priority market with a negative sortOrder', () => {
    for (const country of DEFAULT_COUNTRIES) {
      expect(country.sortOrder).toBeLessThan(0);
    }
  });

  it('gives the priority markets distinct positions', () => {
    const orders = DEFAULT_COUNTRIES.map((country) => country.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  // The reserved band is what keeps the two writers apart. An ISO-imported
  // country is written with sortOrder 0, so any non-negative priority value
  // would put a pinned market back inside the unpinned range.
  it('cannot collide with the unpinned default of 0', () => {
    const UNPINNED = 0;
    for (const country of DEFAULT_COUNTRIES) {
      expect(country.sortOrder).not.toBe(UNPINNED);
      expect(country.sortOrder).toBeLessThan(UNPINNED);
    }
  });

  it('orders the priority markets ahead of an unpinned country', () => {
    const rows = [
      ...DEFAULT_COUNTRIES.map((country) => ({ ...country })),
      { code: 'AR', name: 'Argentina', sortOrder: 0 },
      { code: 'AM', name: 'Armenia', sortOrder: 0 },
    ];

    // The same comparison Prisma is asked for: [sortOrder asc, name asc].
    const ordered = [...rows].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
    );

    expect(
      ordered.slice(0, DEFAULT_COUNTRIES.length).map((row) => row.code),
    ).toEqual(DEFAULT_COUNTRIES.map((country) => country.code));
    // The regression in one line: the US must not land mid-alphabet again.
    expect(ordered[ordered.length - 2].code).toBe('AR');
    expect(ordered[ordered.length - 1].code).toBe('AM');
  });
});
