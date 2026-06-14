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
    const prisma = {
      country: {
        upsert: jest.fn().mockResolvedValue(undefined),
        count: jest.fn().mockResolvedValue(countries.length),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ updatedAt: new Date() })
          .mockResolvedValueOnce(null),
        findMany: jest.fn().mockResolvedValue(countries),
      },
    } as unknown as PrismaService;
    const configService = {
      get: jest.fn(),
    } as unknown as ConfigService;
    const service = new GeographicLookupService(prisma, configService);
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await service.listCountries();

    expect(prisma.country.upsert).toHaveBeenCalledTimes(
      DEFAULT_COUNTRIES.length,
    );
    expect(prisma.country.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual(countries);
  });

  it('returns local defaults when the countries provider is unavailable', async () => {
    const countries = DEFAULT_COUNTRIES.map((country, index) => ({
      id: `country-${index}`,
      ...country,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const prisma = {
      country: {
        upsert: jest.fn().mockResolvedValue(undefined),
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

    expect(prisma.country.upsert).toHaveBeenCalledTimes(
      DEFAULT_COUNTRIES.length,
    );
    expect(result).toEqual(countries);
  });
});
