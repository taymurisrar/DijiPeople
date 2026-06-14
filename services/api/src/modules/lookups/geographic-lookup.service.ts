import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DEFAULT_CITIES,
  DEFAULT_COUNTRIES,
  DEFAULT_STATES,
} from './lookups.catalog';

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
const GEOGRAPHY_API_TIMEOUT_MS = 3_000;

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
                {
                  code: {
                    contains: search.trim().toUpperCase(),
                    mode: 'insensitive',
                  },
                },
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
                {
                  code: {
                    contains: search.trim().toUpperCase(),
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listCities(
    countryId?: string,
    stateProvinceId?: string,
    search?: string,
  ) {
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

    await this.ensureDefaultCountries();

    if (
      count > 0 &&
      latest &&
      Date.now() - latest.updatedAt.getTime() < ONE_DAY_MS
    ) {
      return;
    }

    try {
      const endpoint = this.configService.get<string>(
        'GEOGRAPHY_COUNTRIES_API_URL',
        'https://restcountries.com/v3.1/all?fields=name,cca2,cca3',
      );
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(GEOGRAPHY_API_TIMEOUT_MS),
      });
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
          (
            record,
          ): record is {
            code: string;
            name: string;
            officialName: string | null;
          } => Boolean(record.code && record.name),
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      await this.prisma.country.createMany({
        data: countries.map((country, index) => ({
          code: country.code,
          name: country.name,
          sortOrder: index,
        })),
        skipDuplicates: true,
      });
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

    await this.ensureDefaultStates(countryId);

    if (
      latestState &&
      Date.now() - latestState.updatedAt.getTime() < ONE_DAY_MS
    ) {
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
        signal: AbortSignal.timeout(GEOGRAPHY_API_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`States API returned ${response.status}`);
      }

      const payload = (await response.json()) as StateApiResponse;
      const states = payload.data?.states ?? [];

      await this.prisma.stateProvince.createMany({
        data: states.flatMap((state, index) => {
          const code = (
            state.state_code?.trim() || slugify(state.name)
          ).toUpperCase();
          const name = state.name?.trim();
          if (!code || !name) {
            return [];
          }

          return [{ countryId, code, name, sortOrder: index }];
        }),
        skipDuplicates: true,
      });
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

    await this.ensureDefaultCities(countryId, stateProvinceId);

    if (
      latestCity &&
      Date.now() - latestCity.updatedAt.getTime() < ONE_DAY_MS
    ) {
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
        signal: AbortSignal.timeout(GEOGRAPHY_API_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Cities API returned ${response.status}`);
      }

      const payload = (await response.json()) as CityApiResponse;
      const cities = payload.data ?? [];

      await this.prisma.city.createMany({
        data: cities.flatMap((cityName, index) => {
          const name = cityName.trim();
          return name
            ? [{ countryId, stateProvinceId, name, sortOrder: index }]
            : [];
        }),
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn(
        `Unable to refresh cities for ${state.name}, ${country.name}. Using cached records. ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async ensureDefaultCountries() {
    await Promise.all(
      DEFAULT_COUNTRIES.map((country) =>
        this.prisma.country.upsert({
          where: { code: country.code },
          create: country,
          update: {},
        }),
      ),
    );
  }

  private async ensureDefaultStates(countryId: string) {
    const country = await this.prisma.country.findUnique({
      where: { id: countryId },
      select: { code: true },
    });
    if (!country) {
      return;
    }

    const defaults = DEFAULT_STATES.filter(
      (state) => state.countryCode === country.code,
    );
    await Promise.all(
      defaults.map((state) =>
        this.prisma.stateProvince.upsert({
          where: {
            countryId_code: {
              countryId,
              code: state.code,
            },
          },
          create: {
            countryId,
            code: state.code,
            name: state.name,
            sortOrder: state.sortOrder,
          },
          update: {},
        }),
      ),
    );
  }

  private async ensureDefaultCities(
    countryId: string,
    stateProvinceId: string,
  ) {
    const [country, state] = await Promise.all([
      this.prisma.country.findUnique({
        where: { id: countryId },
        select: { code: true },
      }),
      this.prisma.stateProvince.findFirst({
        where: { id: stateProvinceId, countryId },
        select: { code: true },
      }),
    ]);
    if (!country || !state) {
      return;
    }

    const defaults = DEFAULT_CITIES.filter(
      (city) =>
        city.countryCode === country.code && city.stateCode === state.code,
    );
    await Promise.all(
      defaults.map((city) =>
        this.prisma.city.upsert({
          where: {
            countryId_stateProvinceId_name: {
              countryId,
              stateProvinceId,
              name: city.name,
            },
          },
          create: {
            countryId,
            stateProvinceId,
            name: city.name,
            sortOrder: city.sortOrder,
          },
          update: {},
        }),
      ),
    );
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
