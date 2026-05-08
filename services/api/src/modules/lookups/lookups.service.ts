import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
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

  async listDocumentTypes(tenantId: string) {
    await this.ensureTenantLookupDefaults(tenantId);
    return this.prisma.documentType.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listDocumentCategories(tenantId: string) {
    await this.ensureTenantLookupDefaults(tenantId);
    return this.prisma.documentCategory.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listRelationTypes(tenantId: string) {
    await this.ensureTenantLookupDefaults(tenantId);
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

  private async ensureTenantLookupDefaults(tenantId: string) {
    for (const [index, documentType] of DEFAULT_DOCUMENT_TYPES.entries()) {
      const existing = await this.prisma.documentType.findFirst({
        where: { tenantId: null, key: documentType.key },
        select: { id: true },
      });

      if (!existing) {
        await this.prisma.documentType.create({
          data: {
            tenantId: null,
            key: documentType.key,
            name: documentType.name,
            sortOrder: index * 10,
          },
        });
      }
    }

    for (const [index, relationType] of DEFAULT_RELATION_TYPES.entries()) {
      const existing = await this.prisma.relationType.findFirst({
        where: { tenantId: null, key: relationType.key },
        select: { id: true },
      });

      if (!existing) {
        await this.prisma.relationType.create({
          data: {
            tenantId: null,
            key: relationType.key,
            name: relationType.name,
            sortOrder: index * 10,
          },
        });
      }
    }

    for (const [
      index,
      documentCategory,
    ] of DEFAULT_DOCUMENT_CATEGORIES.entries()) {
      const existing = await this.prisma.documentCategory.findFirst({
        where: { tenantId: null, code: documentCategory.code },
        select: { id: true },
      });

      if (!existing) {
        await this.prisma.documentCategory.create({
          data: {
            tenantId: null,
            code: documentCategory.code,
            name: documentCategory.name,
            sortOrder: index * 10,
          },
        });
      }
    }

    void tenantId;
  }
}
