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

    expect(createMany).toHaveBeenCalledWith({
      data: [
        { code: 'PK', name: 'Pakistan', sortOrder: 0 },
        { code: 'SA', name: 'Saudi Arabia', sortOrder: 1 },
      ],
      skipDuplicates: true,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });
});
