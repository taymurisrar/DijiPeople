import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
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

  listStates(countryId?: string, search?: string) {
    return this.geographicLookupService.listStates(countryId, search);
  }

  listCities(countryId?: string, stateProvinceId?: string, search?: string) {
    return this.geographicLookupService.listCities(
      countryId,
      stateProvinceId,
      search,
    );
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

  listCurrencies() {
    return {
      items: CURRENCY_OPTIONS.map((currency) => ({
        ...currency,
        id: currency.code,
        value: currency.code,
        name: `${currency.code} - ${currency.name}`,
        label: `${currency.code} - ${currency.name}`,
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
