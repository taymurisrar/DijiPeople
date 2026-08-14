import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  SidebarNavigationOverrideDto,
  SidebarVisibilityRuleDto,
} from './dto/sidebar-navigation.dto';

export type SidebarNavigationOverride = {
  itemKey: string;
  isHidden: boolean;
  label: string | null;
  sortOrder: number | null;
  visibilityRules: SidebarVisibilityRuleDto[] | null;
  updatedAt: Date;
};

/*
 * Tenant-level overrides for the sidebar.
 *
 * The sidebar is defined in application code so a new module appears for every
 * tenant on deploy. This service stores only what a tenant changed, and the web
 * app merges those deltas over the code list at render time. Nothing here
 * invents navigation entries: an override for an href the code no longer ships
 * is simply never matched.
 */
@Injectable()
export class NavigationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSidebarOverrides(
    tenantId: string,
  ): Promise<SidebarNavigationOverride[]> {
    const rows = await this.prisma.tenantNavigationOverride.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { itemKey: 'asc' }],
    });

    return rows.map((row) => ({
      itemKey: row.itemKey,
      isHidden: row.isHidden,
      label: row.label,
      sortOrder: row.sortOrder,
      visibilityRules: readRules(row.visibilityRules),
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Replaces the tenant's whole override set.
   *
   * Runs as one transaction so a save can never leave half the sidebar on the
   * new layout and half on the old. Items that carry no actual override are
   * dropped rather than stored, which keeps the table holding only real
   * deltas and makes "reset to default" the same operation as "save nothing".
   */
  async replaceSidebarOverrides(
    tenantId: string,
    userId: string,
    items: SidebarNavigationOverrideDto[],
  ): Promise<SidebarNavigationOverride[]> {
    const meaningful = items.filter(isMeaningfulOverride);

    /* Last write wins on a duplicated key rather than failing the whole save. */
    const byKey = new Map<string, SidebarNavigationOverrideDto>();
    for (const item of meaningful) {
      byKey.set(item.itemKey, item);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantNavigationOverride.deleteMany({ where: { tenantId } });

      if (byKey.size === 0) return;

      await tx.tenantNavigationOverride.createMany({
        data: [...byKey.values()].map((item) => ({
          tenantId,
          itemKey: item.itemKey,
          isHidden: item.isHidden ?? false,
          label: item.label?.trim() ? item.label.trim() : null,
          sortOrder: item.sortOrder ?? null,
          visibilityRules: item.visibilityRules?.length
            ? (item.visibilityRules as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          createdById: userId,
          updatedById: userId,
        })),
      });
    });

    return this.getSidebarOverrides(tenantId);
  }
}

/*
 * A row that hides nothing, renames nothing, reorders nothing and gates nothing
 * is identical to having no row, so it is not written.
 */
function isMeaningfulOverride(item: SidebarNavigationOverrideDto): boolean {
  return Boolean(
    item.isHidden ||
    item.label?.trim() ||
    typeof item.sortOrder === 'number' ||
    item.visibilityRules?.length,
  );
}

function readRules(value: unknown): SidebarVisibilityRuleDto[] | null {
  return Array.isArray(value) ? (value as SidebarVisibilityRuleDto[]) : null;
}
