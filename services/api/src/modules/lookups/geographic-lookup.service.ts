import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

type CountryApiRecord = {
  cca2?: string;
  cca3?: string;
  name?: {
    common?: string;
    official?: string;
  };
};

type StateApiResponse = {
  error?: boolean;
  data?: {
    name?: string;
    iso2?: string;
    iso3?: string;
    states?: Array<{
      name?: string;
      state_code?: string;
    }>;
  };
};

type CityApiResponse = {
  error?: boolean;
  data?: string[];
};

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

@Injectable()
export class GeographicLookupService {
  private readonly logger = new Logger(GeographicLookupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async listCountries(search?: string) {
    await this.syncCountriesIfNeeded();

    return this.prisma.country.findMany({
      where: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' } },
                { code: { contains: search.trim().toUpperCase(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listStates(countryId?: string, search?: string) {
    if (countryId) {
      await this.syncStatesForCountry(countryId);
    } else {
      await this.syncCountriesIfNeeded();
    }

    return this.prisma.stateProvince.findMany({
      where: {
        isActive: true,
        ...(countryId ? { countryId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' } },
                { code: { contains: search.trim().toUpperCase(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listCities(countryId?: string, stateProvinceId?: string, search?: string) {
    if (countryId && stateProvinceId) {
      await this.syncCitiesForState(countryId, stateProvinceId);
    } else if (countryId) {
      await this.syncStatesForCountry(countryId);
    } else {
      await this.syncCountriesIfNeeded();
    }

    return this.prisma.city.findMany({
      where: {
        isActive: true,
        ...(countryId ? { countryId } : {}),
        ...(stateProvinceId ? { stateProvinceId } : {}),
        ...(search
          ? { name: { contains: search.trim(), mode: 'insensitive' } }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  private async syncCountriesIfNeeded() {
    const count = await this.prisma.country.count();
    const latest = await this.prisma.country.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    if (count > 0 && latest && Date.now() - latest.updatedAt.getTime() < ONE_DAY_MS) {
      return;
    }

    try {
      const endpoint = this.configService.get<string>(
        'GEOGRAPHY_COUNTRIES_API_URL',
        'https://restcountries.com/v3.1/all?fields=name,cca2,cca3',
      );
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Countries API returned ${response.status}`);
      }

      const payload = (await response.json()) as CountryApiRecord[];
      const countries = payload
        .map((record) => ({
          code: record.cca2?.trim().toUpperCase() ?? null,
          name: record.name?.common?.trim() ?? null,
          officialName: record.name?.official?.trim() ?? null,
        }))
        .filter(
          (record): record is { code: string; name: string; officialName: string | null } =>
            Boolean(record.code && record.name),
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      for (const [index, country] of countries.entries()) {
        await this.prisma.country.upsert({
          where: { code: country.code },
          create: {
            code: country.code,
            name: country.name,
            sortOrder: index,
          },
          update: {
            name: country.name,
            sortOrder: index,
            isActive: true,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Unable to refresh internet-backed countries. Falling back to cached records. ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async syncStatesForCountry(countryId: string) {
    await this.syncCountriesIfNeeded();

    const country = await this.prisma.country.findFirst({
      where: { id: countryId, isActive: true },
      select: { id: true, name: true, updatedAt: true },
    });

    if (!country) {
      return;
    }

    const latestState = await this.prisma.stateProvince.findFirst({
      where: { countryId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    if (latestState && Date.now() - latestState.updatedAt.getTime() < ONE_DAY_MS) {
      return;
    }

    try {
      const endpoint = this.configService.get<string>(
        'GEOGRAPHY_STATES_API_URL',
        'https://countriesnow.space/api/v0.1/countries/states',
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: country.name }),
      });

      if (!response.ok) {
        throw new Error(`States API returned ${response.status}`);
      }

      const payload = (await response.json()) as StateApiResponse;
      const states = payload.data?.states ?? [];

      for (const [index, state] of states.entries()) {
        const code = (state.state_code?.trim() || slugify(state.name)).toUpperCase();
        const name = state.name?.trim();
        if (!code || !name) {
          continue;
        }

        await this.prisma.stateProvince.upsert({
          where: {
            countryId_code: {
              countryId,
              code,
            },
          },
          create: {
            countryId,
            code,
            name,
            sortOrder: index,
          },
          update: {
            name,
            sortOrder: index,
            isActive: true,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Unable to refresh states for ${country.name}. Using cached records. ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async syncCitiesForState(countryId: string, stateProvinceId: string) {
    await this.syncStatesForCountry(countryId);

    const [country, state] = await Promise.all([
      this.prisma.country.findFirst({
        where: { id: countryId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.stateProvince.findFirst({
        where: { id: stateProvinceId, countryId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    if (!country || !state) {
      return;
    }

    const latestCity = await this.prisma.city.findFirst({
      where: { countryId, stateProvinceId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    if (latestCity && Date.now() - latestCity.updatedAt.getTime() < ONE_DAY_MS) {
      return;
    }

    try {
      const endpoint = this.configService.get<string>(
        'GEOGRAPHY_CITIES_API_URL',
        'https://countriesnow.space/api/v0.1/countries/state/cities',
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: country.name, state: state.name }),
      });

      if (!response.ok) {
        throw new Error(`Cities API returned ${response.status}`);
      }

      const payload = (await response.json()) as CityApiResponse;
      const cities = payload.data ?? [];

      for (const [index, cityName] of cities.entries()) {
        const name = cityName.trim();
        if (!name) {
          continue;
        }

        const existing = await this.prisma.city.findFirst({
          where: {
            countryId,
            stateProvinceId,
            name,
          },
          select: { id: true },
        });

        if (existing) {
          await this.prisma.city.update({
            where: { id: existing.id },
            data: { isActive: true, sortOrder: index },
          });
          continue;
        }

        await this.prisma.city.create({
          data: {
            countryId,
            stateProvinceId,
            name,
            sortOrder: index,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Unable to refresh cities for ${state.name}, ${country.name}. Using cached records. ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}

function slugify(value?: string) {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}
