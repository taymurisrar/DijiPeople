import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConfigurationStatus,
  ExchangeRateSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CURRENCY_OPTIONS,
  DEFAULT_DOCUMENT_CATEGORIES,
  DEFAULT_DOCUMENT_TYPES,
  DEFAULT_RELATION_TYPES,
} from './lookups.catalog';
import { GeographicLookupService } from './geographic-lookup.service';

@Injectable()
export class LookupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geographicLookupService: GeographicLookupService,
  ) {}

  listCountries(search?: string) {
    return this.geographicLookupService.listCountries(search);
  }

  async listStates(countryId?: string, search?: string) {
    const states = await this.geographicLookupService.listStates(
      countryId,
      search,
    );
    const countryIds = [...new Set(states.map((state) => state.countryId))];
    const countries = await this.prisma.country.findMany({
      where: { id: { in: countryIds } },
      select: { id: true, name: true },
    });
    const countryNames = new Map(countries.map((item) => [item.id, item.name]));
    return states.map((state) => ({
      ...state,
      countryName: countryNames.get(state.countryId) ?? '',
    }));
  }

  async listCities(
    countryId?: string,
    stateProvinceId?: string,
    search?: string,
  ) {
    const cities = await this.geographicLookupService.listCities(
      countryId,
      stateProvinceId,
      search,
    );
    const countryIds = [...new Set(cities.map((city) => city.countryId))];
    const stateIds = [
      ...new Set(cities.flatMap((city) => city.stateProvinceId ?? [])),
    ];
    const [countries, states] = await Promise.all([
      this.prisma.country.findMany({
        where: { id: { in: countryIds } },
        select: { id: true, name: true },
      }),
      this.prisma.stateProvince.findMany({
        where: { id: { in: stateIds } },
        select: { id: true, name: true },
      }),
    ]);
    const countryNames = new Map(countries.map((item) => [item.id, item.name]));
    const stateNames = new Map(states.map((item) => [item.id, item.name]));
    return cities.map((city) => ({
      ...city,
      countryName: countryNames.get(city.countryId) ?? '',
      stateProvinceName: city.stateProvinceId
        ? (stateNames.get(city.stateProvinceId) ?? '')
        : '',
    }));
  }

  async getCountry(idOrCode: string) {
    const country = await this.prisma.country.findFirst({
      where: { OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }] },
    });
    if (!country) throw new NotFoundException('Country was not found.');
    return country;
  }

  async getCountryUsage(idOrCode: string) {
    const country = await this.getCountry(idOrCode);
    return {
      countryId: country.id,
      usages: [
        await usage(
          'StateProvince',
          this.prisma.stateProvince.count({ where: { countryId: country.id } }),
        ),
        await usage(
          'City',
          this.prisma.city.count({ where: { countryId: country.id } }),
        ),
        await usage(
          'Employee',
          this.prisma.employee.count({ where: { countryId: country.id } }),
        ),
      ],
    };
  }

  async createState(body: Record<string, unknown>) {
    const data = await this.readStateData(body);
    return this.prisma.stateProvince.create({ data });
  }

  async getState(id: string) {
    const state = await this.prisma.stateProvince.findFirst({
      where: { id },
      include: { country: { select: { id: true, name: true, code: true } } },
    });
    if (!state) throw new NotFoundException('State / Province was not found.');
    return {
      ...state,
      countryName: state.country.name,
    };
  }

  async getStateUsage(id: string) {
    // Existence check: `getState` throws NotFoundException for an unknown id,
    // which is what turns a usage request for a deleted state into a 404 rather
    // than an empty report.
    await this.getState(id);
    return {
      stateProvinceId: id,
      usages: [
        await usage(
          'City',
          this.prisma.city.count({ where: { stateProvinceId: id } }),
        ),
        await usage(
          'Employee',
          this.prisma.employee.count({ where: { stateProvinceId: id } }),
        ),
      ],
    };
  }

  async updateState(id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.stateProvince.findFirst({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('State / Province was not found.');
    const data = await this.readStateData(body, existing);
    return this.prisma.stateProvince.update({ where: { id }, data });
  }

  async deleteState(id: string) {
    const existing = await this.prisma.stateProvince.findFirst({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('State / Province was not found.');
    const [cityCount, employeeCount] = await Promise.all([
      this.prisma.city.count({ where: { stateProvinceId: id } }),
      this.prisma.employee.count({ where: { stateProvinceId: id } }),
    ]);
    if (cityCount || employeeCount) {
      throw new ConflictException(
        'State / Province cannot be deleted because cities or employees reference it.',
      );
    }
    await this.prisma.stateProvince.update({
      where: { id },
      data: { isActive: false },
    });
    return { id, deleted: true };
  }

  async createCity(body: Record<string, unknown>) {
    const data = await this.readCityData(body);
    return this.prisma.city.create({ data });
  }

  async getCity(id: string) {
    const city = await this.prisma.city.findFirst({
      where: { id },
      include: {
        country: { select: { id: true, name: true, code: true } },
        stateProvince: { select: { id: true, name: true, code: true } },
      },
    });
    if (!city) throw new NotFoundException('City was not found.');
    return {
      ...city,
      countryName: city.country.name,
      stateProvinceName: city.stateProvince?.name ?? '',
    };
  }

  async getCityUsage(id: string) {
    await this.getCity(id);
    return {
      cityId: id,
      usages: [
        await usage(
          'Employee',
          this.prisma.employee.count({ where: { cityId: id } }),
        ),
      ],
    };
  }

  async updateCity(id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.city.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('City was not found.');
    const data = await this.readCityData(body, existing);
    return this.prisma.city.update({ where: { id }, data });
  }

  async deleteCity(id: string) {
    const existing = await this.prisma.city.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('City was not found.');
    const employeeCount = await this.prisma.employee.count({
      where: { cityId: id },
    });
    if (employeeCount) {
      throw new ConflictException(
        'City cannot be deleted because employees reference it.',
      );
    }
    await this.prisma.city.update({ where: { id }, data: { isActive: false } });
    return { id, deleted: true };
  }

  private async readStateData(
    body: Record<string, unknown>,
    existing?: {
      countryId: string;
      code: string;
      name: string;
      isActive: boolean;
      sortOrder: number;
    },
  ) {
    const countryId = requiredString(
      body.countryId ?? existing?.countryId,
      'Country is required.',
    );
    const country = await this.prisma.country.findFirst({
      where: { id: countryId, isActive: true },
      select: { id: true },
    });
    if (!country) throw new BadRequestException('Country was not found.');
    return {
      countryId,
      code: requiredString(
        body.code ?? existing?.code,
        'State / Province code is required.',
      ).toUpperCase(),
      name: requiredString(
        body.name ?? existing?.name,
        'State / Province name is required.',
      ),
      isActive: readBoolean(body.isActive) ?? existing?.isActive ?? true,
      sortOrder: readNumber(body.sortOrder) ?? existing?.sortOrder ?? 0,
    };
  }

  private async readCityData(
    body: Record<string, unknown>,
    existing?: {
      countryId: string;
      stateProvinceId: string | null;
      name: string;
      isActive: boolean;
      sortOrder: number;
    },
  ) {
    const stateProvinceId =
      body.stateProvinceId !== undefined
        ? readString(body.stateProvinceId)
        : (existing?.stateProvinceId ?? null);
    const stateProvince = stateProvinceId
      ? await this.prisma.stateProvince.findFirst({
          where: { id: stateProvinceId, isActive: true },
          select: { id: true, countryId: true },
        })
      : null;
    if (stateProvinceId && !stateProvince) {
      throw new BadRequestException('State / Province was not found.');
    }
    const countryId =
      readString(body.countryId) ??
      stateProvince?.countryId ??
      existing?.countryId;
    if (!countryId) {
      throw new BadRequestException('Country is required.');
    }
    const country = await this.prisma.country.findFirst({
      where: { id: countryId, isActive: true },
      select: { id: true },
    });
    if (!country) throw new BadRequestException('Country was not found.');
    if (stateProvinceId) {
      if (stateProvince?.countryId !== countryId) {
        throw new BadRequestException(
          'State / Province was not found for the selected country.',
        );
      }
    }
    return {
      countryId,
      stateProvinceId,
      name: requiredString(
        body.name ?? existing?.name,
        'City name is required.',
      ),
      isActive: readBoolean(body.isActive) ?? existing?.isActive ?? true,
      sortOrder: readNumber(body.sortOrder) ?? existing?.sortOrder ?? 0,
    };
  }

  listTimezones() {
    const ids = [
      'UTC',
      'Asia/Qatar',
      'Asia/Riyadh',
      'Asia/Dubai',
      'Asia/Karachi',
      'Asia/Kolkata',
      'Europe/London',
      'Europe/Berlin',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
    ];

    return {
      items: ids.map((id) => ({ id, value: id, name: id, label: id })),
    };
  }

  getTimezone(id: string) {
    const decoded = decodeURIComponent(id);
    const timezone = this.listTimezones().items.find(
      (item) => item.id === decoded || item.value === decoded,
    );
    if (!timezone) throw new NotFoundException('Timezone was not found.');
    return timezone;
  }

  async listCurrencies(tenantId: string, query: Record<string, unknown> = {}) {
    await this.ensureCurrencyDefaults(tenantId);
    const search = readString(query.search);
    const activeOnly = readBoolean(query.activeOnly) ?? false;
    const where: Prisma.CurrencyWhereInput = {
      tenantId,
      ...(activeOnly ? { status: ConfigurationStatus.ACTIVE } : {}),
    };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { symbol: { contains: search, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.currency.findMany({
      where,
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
      take: Math.min(readNumber(query.take) ?? 500, 1000),
    });

    return {
      items: items.map((currency) => ({
        ...currency,
        value: currency.code,
        label: currency.name,
        decimalDigits: currency.decimalPlaces,
        decimalPlaces: currency.decimalPlaces,
        isActive: currency.status === ConfigurationStatus.ACTIVE,
      })),
    };
  }

  async getCurrency(tenantId: string, idOrCode: string) {
    await this.ensureCurrencyDefaults(tenantId);
    const currency = await this.prisma.currency.findFirst({
      where: this.currencyIdentityWhere(tenantId, idOrCode),
    });
    if (!currency) throw new NotFoundException('Currency was not found.');
    return this.mapCurrencyRecord(currency);
  }

  async getCurrencyRateSummary(tenantId: string, idOrCode: string) {
    const currency = await this.getCurrencyRecord(tenantId, idOrCode);
    const fromCurrency = await this.resolveTenantDefaultCurrency(tenantId);
    const toCurrency = currency.code;
    if (fromCurrency === toCurrency) {
      return {
        fromCurrency,
        toCurrency,
        rate: '1',
        source: 'Tenant Default Currency',
        provider: '',
        lastFetchedAt: null,
        fetchStatus: 'Current',
        lastError: '',
      };
    }

    const manual = await this.findActiveManualRate(
      tenantId,
      fromCurrency,
      toCurrency,
    );
    if (manual) {
      return {
        fromCurrency,
        toCurrency,
        rate: manual.rate.toString(),
        source: 'Manual Override',
        provider: '',
        lastFetchedAt: manual.updatedAt,
        fetchStatus: 'Current',
        lastError: '',
      };
    }

    let providerRate = await this.findLatestProviderRate(
      tenantId,
      fromCurrency,
      toCurrency,
    );
    let lastError = '';

    if (!providerRate || this.isRateStale(providerRate.lastFetchedAt)) {
      try {
        providerRate = await this.fetchAndStoreProviderRate(
          tenantId,
          fromCurrency,
          toCurrency,
        );
      } catch (error) {
        lastError =
          error instanceof Error
            ? error.message
            : `Exchange rate is missing for ${fromCurrency} to ${toCurrency}. Please refresh rates or add a manual override.`;
      }
    }

    return {
      fromCurrency,
      toCurrency,
      rate: providerRate?.rate.toString() ?? '',
      source: providerRate ? 'Provider' : '',
      provider: providerRate?.provider ?? '',
      lastFetchedAt: providerRate?.lastFetchedAt ?? null,
      fetchStatus: providerRate ? 'Current' : 'Failed',
      lastError,
    };
  }

  async getCurrencyManualOverride(tenantId: string, idOrCode: string) {
    const currency = await this.getCurrencyRecord(tenantId, idOrCode);
    const fromCurrency = await this.resolveTenantDefaultCurrency(tenantId);
    const override =
      fromCurrency === currency.code
        ? null
        : await this.findActiveManualRate(
            tenantId,
            fromCurrency,
            currency.code,
          );

    return {
      fromCurrency,
      toCurrency: currency.code,
      overrideRate: override?.rate.toString() ?? '',
      overrideReason: override?.overrideReason ?? '',
      active: Boolean(override),
      notes: override?.description ?? '',
    };
  }

  async updateCurrencyManualOverride(
    currentUser: AuthenticatedUser,
    idOrCode: string,
    body: Record<string, unknown>,
  ) {
    const currency = await this.getCurrencyRecord(
      currentUser.tenantId,
      idOrCode,
    );
    const fromCurrency = await this.resolveTenantDefaultCurrency(
      currentUser.tenantId,
    );
    if (fromCurrency === currency.code) {
      throw new BadRequestException(
        'Manual override is not needed for the tenant default currency.',
      );
    }
    const active = readBoolean(body.active) ?? false;

    await this.prisma.exchangeRateSnapshot.updateMany({
      where: {
        tenantId: currentUser.tenantId,
        fromCurrency,
        toCurrency: currency.code,
        source: ExchangeRateSource.MANUAL,
        isManual: true,
        status: ConfigurationStatus.ACTIVE,
      },
      data: {
        status: ConfigurationStatus.INACTIVE,
        subStatus: 'REPLACED',
        effectiveEndDate: new Date(),
        updatedById: currentUser.userId,
      },
    });

    if (active) {
      const rate = readNumber(body.overrideRate);
      if (!rate || rate <= 0) {
        throw new BadRequestException(
          'Override rate must be greater than zero.',
        );
      }
      const overrideReason = requiredString(
        body.overrideReason,
        'Override reason is required for manual exchange rate overrides.',
      );
      await this.prisma.exchangeRateSnapshot.create({
        data: {
          tenantId: currentUser.tenantId,
          fromCurrency,
          toCurrency: currency.code,
          rate: new Prisma.Decimal(rate),
          source: ExchangeRateSource.MANUAL,
          isManual: true,
          lockedRate: false,
          overrideReason,
          description: readString(body.notes),
          subStatus: 'MANUAL_OVERRIDE',
          status: ConfigurationStatus.ACTIVE,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
      });
    }

    return this.getCurrencyManualOverride(currentUser.tenantId, currency.id);
  }

  async getCurrencyUsage(tenantId: string, idOrCode: string) {
    const currency = await this.getCurrencyRecord(tenantId, idOrCode);
    const usages = await this.getCurrencyUsageCounts(tenantId, currency.code);
    return {
      currencyCode: currency.code,
      usages,
    };
  }

  async createCurrency(
    currentUser: AuthenticatedUser,
    body: Record<string, unknown>,
  ) {
    const data = this.readCurrencyData(body);
    try {
      const currency = await this.prisma.currency.create({
        data: {
          tenantId: currentUser.tenantId,
          ...data,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
          ownerUserId: currentUser.userId,
          integrationKey: data.code,
        },
      });
      return this.mapCurrencyRecord(currency);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Currency ISO code is already in use.');
      }
      throw error;
    }
  }

  async updateCurrency(
    currentUser: AuthenticatedUser,
    idOrCode: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.getCurrencyRecord(
      currentUser.tenantId,
      idOrCode,
    );
    if (!existing) throw new NotFoundException('Currency was not found.');
    const data = this.readCurrencyData(body, existing);
    try {
      const currency = await this.prisma.currency.update({
        where: { id: existing.id },
        data: {
          ...data,
          updatedById: currentUser.userId,
          integrationKey: data.code,
        },
      });
      return this.mapCurrencyRecord(currency);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Currency ISO code is already in use.');
      }
      throw error;
    }
  }

  async deleteCurrency(currentUser: AuthenticatedUser, idOrCode: string) {
    const existing = await this.getCurrencyRecord(
      currentUser.tenantId,
      idOrCode,
    );
    await this.assertCurrencyCanDeactivate(currentUser.tenantId, existing.code);
    const currency = await this.prisma.currency.update({
      where: { id: existing.id },
      data: {
        status: ConfigurationStatus.INACTIVE,
        subStatus: 'ARCHIVED',
        updatedById: currentUser.userId,
      },
    });
    return { id: currency.id, deleted: true };
  }

  private currencyIdentityWhere(tenantId: string, idOrCode: string) {
    return {
      tenantId,
      OR: [{ id: idOrCode }, { code: idOrCode.trim().toUpperCase() }],
    };
  }

  private async getCurrencyRecord(tenantId: string, idOrCode: string) {
    await this.ensureCurrencyDefaults(tenantId);
    const currency = await this.prisma.currency.findFirst({
      where: this.currencyIdentityWhere(tenantId, idOrCode),
    });
    if (!currency) throw new NotFoundException('Currency was not found.');
    return currency;
  }

  private async ensureCurrencyDefaults(tenantId: string) {
    const existingCount = await this.prisma.currency.count({
      where: { tenantId },
    });
    if (existingCount > 0) return;

    await this.prisma.currency.createMany({
      data: CURRENCY_OPTIONS.map((currency) => ({
        tenantId,
        name: currency.name,
        code: currency.code,
        symbol: currency.symbol,
        decimalPlaces: currency.decimals ?? 2,
        status: ConfigurationStatus.ACTIVE,
        subStatus: 'AVAILABLE',
        integrationKey: currency.code,
      })),
      skipDuplicates: true,
    });
  }

  private readCurrencyData(
    body: Record<string, unknown>,
    existing?: {
      name: string;
      code: string;
      symbol: string | null;
      decimalPlaces: number;
      status: ConfigurationStatus;
      subStatus: string | null;
      ownerUserId: string | null;
      description: string | null;
    },
  ) {
    const code = normalizeCurrencyCode(
      requiredString(body.code ?? existing?.code, 'ISO Code is required.'),
    );
    const decimalPlaces = readNumber(body.decimalPlaces ?? body.decimalDigits);
    if (!existing && decimalPlaces === null) {
      throw new BadRequestException('Decimal Places is required.');
    }
    const resolvedDecimalPlaces = decimalPlaces ?? existing?.decimalPlaces ?? 2;
    if (!Number.isInteger(resolvedDecimalPlaces) || resolvedDecimalPlaces < 0) {
      throw new BadRequestException('Decimal places cannot be negative.');
    }
    if (!existing && body.status === undefined) {
      throw new BadRequestException('Status is required.');
    }
    const status =
      readEnum(body.status, ConfigurationStatus) ??
      existing?.status ??
      ConfigurationStatus.ACTIVE;
    const subStatus =
      body.subStatus !== undefined
        ? (readString(body.subStatus) ?? null)
        : (existing?.subStatus ?? 'AVAILABLE');
    this.assertValidCurrencySubStatus(status, subStatus);

    return {
      name: requiredString(
        body.name ?? existing?.name,
        'Currency name is required.',
      ),
      code,
      symbol:
        body.symbol !== undefined
          ? (readString(body.symbol) ?? null)
          : (existing?.symbol ?? null),
      decimalPlaces: resolvedDecimalPlaces,
      status,
      subStatus,
      ownerUserId:
        body.ownerUserId !== undefined
          ? (readString(body.ownerUserId) ?? null)
          : (existing?.ownerUserId ?? null),
      description:
        body.description !== undefined
          ? (readString(body.description) ?? null)
          : (existing?.description ?? null),
    };
  }

  private mapCurrencyRecord(currency: {
    id: string;
    tenantId: string;
    name: string;
    code: string;
    symbol: string | null;
    decimalPlaces: number;
    status: ConfigurationStatus;
    subStatus: string | null;
    ownerUserId: string | null;
    description: string | null;
    integrationKey: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdById: string | null;
    updatedById: string | null;
  }) {
    return {
      ...currency,
      value: currency.code,
      label: currency.name,
      decimalDigits: currency.decimalPlaces,
      isActive: currency.status === ConfigurationStatus.ACTIVE,
    };
  }

  private async assertCurrencyCanDeactivate(tenantId: string, code: string) {
    const usages = await this.getCurrencyUsageCounts(tenantId, code);
    const blockingCount = usages
      .filter((usage) => usage.blocksDelete)
      .reduce((sum, usage) => sum + usage.count, 0);

    if (blockingCount > 0) {
      throw new ConflictException(
        'Currency cannot be deleted because it is referenced by tenant profile, payroll, salary packages, claims, travel, loans, reports, dashboards, or currency rate history.',
      );
    }
  }

  private assertValidCurrencySubStatus(
    status: ConfigurationStatus,
    subStatus: string | null,
  ) {
    if (!subStatus) return;
    const allowed =
      status === ConfigurationStatus.ACTIVE
        ? ['AVAILABLE', 'DEFAULT', 'UNDER_REVIEW']
        : ['DEPRECATED', 'REPLACED', 'ARCHIVED'];
    if (!allowed.includes(subStatus)) {
      throw new BadRequestException(
        'Sub Status must belong to the selected Status.',
      );
    }
  }

  private async resolveTenantDefaultCurrency(tenantId: string) {
    const [organizationCurrency, systemCurrency] = await Promise.all([
      this.prisma.tenantSetting.findUnique({
        where: {
          tenantId_category_key: {
            tenantId,
            category: 'organization',
            key: 'currency',
          },
        },
      }),
      this.prisma.tenantSetting.findUnique({
        where: {
          tenantId_category_key: {
            tenantId,
            category: 'system',
            key: 'defaultCurrency',
          },
        },
      }),
    ]);
    return normalizeCurrencyCode(
      jsonString(organizationCurrency?.value) ||
        jsonString(systemCurrency?.value) ||
        'USD',
    );
  }

  private findActiveManualRate(
    tenantId: string,
    fromCurrency: string,
    toCurrency: string,
  ) {
    return this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        fromCurrency,
        toCurrency,
        source: ExchangeRateSource.MANUAL,
        isManual: true,
        status: ConfigurationStatus.ACTIVE,
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  private findLatestProviderRate(
    tenantId: string,
    fromCurrency: string,
    toCurrency: string,
  ) {
    return this.prisma.exchangeRateSnapshot.findFirst({
      where: {
        tenantId,
        fromCurrency,
        toCurrency,
        source: ExchangeRateSource.API,
        isManual: false,
        status: ConfigurationStatus.ACTIVE,
      },
      orderBy: [{ lastFetchedAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  private isRateStale(lastFetchedAt: Date | null) {
    if (!lastFetchedAt) return true;
    return Date.now() - lastFetchedAt.getTime() > 12 * 60 * 60 * 1000;
  }

  private async fetchAndStoreProviderRate(
    tenantId: string,
    fromCurrency: string,
    toCurrency: string,
  ) {
    const response = await fetch(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(fromCurrency)}`,
    );
    if (!response.ok) {
      throw new BadRequestException(
        `Exchange rate is missing for ${fromCurrency} to ${toCurrency}. Please refresh rates or add a manual override.`,
      );
    }
    const payload = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };
    const rate = payload.rates?.[toCurrency];
    if (payload.result !== 'success' || !rate || rate <= 0) {
      throw new BadRequestException(
        `Exchange rate is missing for ${fromCurrency} to ${toCurrency}. Please refresh rates or add a manual override.`,
      );
    }
    await this.prisma.exchangeRateSnapshot.updateMany({
      where: {
        tenantId,
        fromCurrency,
        toCurrency,
        source: ExchangeRateSource.API,
        isManual: false,
        status: ConfigurationStatus.ACTIVE,
      },
      data: {
        status: ConfigurationStatus.INACTIVE,
        subStatus: 'REPLACED',
        effectiveEndDate: new Date(),
      },
    });
    return this.prisma.exchangeRateSnapshot.create({
      data: {
        tenantId,
        fromCurrency,
        toCurrency,
        rate: new Prisma.Decimal(rate),
        source: ExchangeRateSource.API,
        isManual: false,
        provider: 'open.er-api.com',
        lastFetchedAt: new Date(),
        subStatus: 'PROVIDER_SYNCED',
        status: ConfigurationStatus.ACTIVE,
        providerRawResponse: payload as Prisma.InputJsonValue,
      },
    });
  }

  private async getCurrencyUsageCounts(tenantId: string, code: string) {
    const counts = await Promise.all([
      usage(
        'Tenant Profile default currency',
        this.prisma.tenantSetting.count({
          where: { tenantId, value: { equals: code } },
        }),
      ),
      usage(
        'Currency rates/history',
        this.prisma.exchangeRateSnapshot.count({
          where: {
            tenantId,
            OR: [{ fromCurrency: code }, { toCurrency: code }],
          },
        }),
      ),
      usage(
        'Payroll calendars',
        this.prisma.payrollCalendar.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Payroll regions',
        this.prisma.payrollRegion.count({
          where: {
            tenantId,
            OR: [{ currencyCode: code }, { reportingCurrencyCode: code }],
          },
        }),
      ),
      usage(
        'Payroll records',
        this.prisma.payrollRunEmployee.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Payroll line items',
        this.prisma.payrollRunLineItem.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Payroll bank exports',
        this.prisma.payrollBankExport.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Payslips',
        this.prisma.payslip.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Salary packages',
        this.prisma.employeeCompensation.count({
          where: { tenantId, currency: code },
        }),
      ),
      usage(
        'Salary history',
        this.prisma.employeeCompensationHistory.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Claims',
        this.prisma.claimRequest.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Claim lines',
        this.prisma.claimLineItem.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Travel requests',
        this.prisma.businessTrip.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Travel policies',
        this.prisma.travelAllowancePolicy.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Travel rules',
        this.prisma.travelAllowanceRule.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Travel allowances',
        this.prisma.businessTripAllowance.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Loans',
        this.prisma.loanRequest.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Loan policies',
        this.prisma.loanPolicy.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Reports and approval rules',
        this.prisma.approvalMatrix.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Dashboards and projects',
        this.prisma.project.count({
          where: {
            tenantId,
            OR: [{ currencyCode: code }, { budgetCurrencyCode: code }],
          },
        }),
      ),
      usage(
        'Project assignments',
        this.prisma.projectAssignment.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Timesheet entries',
        this.prisma.timesheetEntry.count({
          where: { tenantId, currencyCode: code },
        }),
      ),
      usage(
        'Subscriptions',
        this.prisma.subscription.count({
          where: { tenantId, currency: code },
        }),
      ),
      usage(
        'Invoices',
        this.prisma.invoice.count({
          where: { tenantId, currency: code },
        }),
      ),
    ]);

    return counts.map((item) => ({
      ...item,
      blocksDelete: item.count > 0,
    }));
  }

  listStaticCurrencies() {
    return {
      items: CURRENCY_OPTIONS.map((currency) => ({
        ...currency,
        id: currency.code,
        value: currency.code,
        name: currency.name,
        label: currency.name,
      })),
    };
  }

  async listDocumentTypes(tenantId: string) {
    await this.ensureDocumentTypeDefaults();
    return this.prisma.documentType.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listDocumentCategories(tenantId: string) {
    await this.ensureDocumentCategoryDefaults();
    return this.prisma.documentCategory.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listRelationTypes(tenantId: string) {
    await this.ensureRelationTypeDefaults();
    const relationTypes = await this.prisma.relationType.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ tenantId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    const deduped = new Map<string, (typeof relationTypes)[number]>();

    for (const relationType of relationTypes) {
      const dedupeKeys = [relationType.key, relationType.name]
        .filter(Boolean)
        .map((value) => value.trim().toLowerCase());
      const existing = dedupeKeys
        .map((dedupeKey) => deduped.get(dedupeKey))
        .find(Boolean);
      const preferred =
        !existing || (!existing.tenantId && relationType.tenantId)
          ? relationType
          : existing;

      for (const dedupeKey of dedupeKeys) {
        deduped.set(dedupeKey, preferred);
      }
    }

    return [
      ...new Map(
        [...deduped.values()].map((relationType) => [
          relationType.id,
          relationType,
        ]),
      ).values(),
    ].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name);
    });
  }

  private async ensureDocumentTypeDefaults() {
    const existing = await this.prisma.documentType.findMany({
      where: { tenantId: null },
      select: { key: true },
    });
    const existingKeys = new Set(existing.map((item) => item.key));

    await this.prisma.documentType.createMany({
      data: DEFAULT_DOCUMENT_TYPES.filter(
        (item) => !existingKeys.has(item.key),
      ).map((item, index) => ({
        tenantId: null,
        key: item.key,
        name: item.name,
        sortOrder: index * 10,
      })),
    });
  }

  private async ensureRelationTypeDefaults() {
    const existing = await this.prisma.relationType.findMany({
      where: { tenantId: null },
      select: { key: true },
    });
    const existingKeys = new Set(existing.map((item) => item.key));

    await this.prisma.relationType.createMany({
      data: DEFAULT_RELATION_TYPES.filter(
        (item) => !existingKeys.has(item.key),
      ).map((item, index) => ({
        tenantId: null,
        key: item.key,
        name: item.name,
        sortOrder: index * 10,
      })),
    });
  }

  private async ensureDocumentCategoryDefaults() {
    const existing = await this.prisma.documentCategory.findMany({
      where: { tenantId: null },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((item) => item.code));

    await this.prisma.documentCategory.createMany({
      data: DEFAULT_DOCUMENT_CATEGORIES.filter(
        (item) => !existingCodes.has(item.code),
      ).map((item, index) => ({
        tenantId: null,
        code: item.code,
        name: item.name,
        sortOrder: index * 10,
      })),
    });
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, message: string) {
  const text = readString(value);
  if (!text) throw new BadRequestException(message);
  return text;
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function readEnum<T extends Record<string, string>>(
  value: unknown,
  enumObject: T,
): T[keyof T] | null {
  const text = readString(value);
  if (!text) return null;
  return Object.values(enumObject).includes(text) ? (text as T[keyof T]) : null;
}

function normalizeCurrencyCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new BadRequestException(
      'ISO Code must be exactly 3 uppercase letters.',
    );
  }
  return code;
}

async function usage(area: string, count: Promise<number>) {
  return {
    area,
    count: await count,
  };
}

function jsonString(value: Prisma.JsonValue | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
