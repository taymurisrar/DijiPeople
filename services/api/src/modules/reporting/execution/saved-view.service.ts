import { Injectable } from '@nestjs/common';
import { Prisma, ReportVisibilityScope } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { getDataSource } from '../semantic/data-sources';
import { PERIOD_PRESETS, COMPARISON_MODES } from '../engine/period.engine';
import { planWhere, visibleFields } from '../engine/query-planner';
import type { ReportFilterInput } from '../engine/filter.model';

export interface SavedViewConfig {
  preset?: string;
  from?: string;
  to?: string;
  comparison?: string;
  filters?: ReportFilterInput[];
  breakdown?: string;
  metricKeys?: string[];
}

export interface SaveViewInput {
  surfaceKey: string;
  name: string;
  config: SavedViewConfig;
  visibilityScope?: ReportVisibilityScope;
  allowedRoleKeys?: string[];
  allowedUserIds?: string[];
  isDefault?: boolean;
}

/**
 * Saved analytics views — a named period, comparison, filter set and breakdown
 * for one surface.
 *
 * Kept separate from `ModuleView` deliberately. That model is governed by the
 * `customization.views.*` permissions, and a person who can read a report
 * should not need customization rights to save a filter set they use every
 * Monday. The visibility shape mirrors `ModuleView`'s on purpose, so the two
 * concepts stay recognisably the same idea.
 */
@Injectable()
export class SavedViewService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, surfaceKey: string) {
    const rows = await this.prisma.reportSavedView.findMany({
      where: { tenantId: user.tenantId, surfaceKey, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 200,
    });

    return rows
      .filter((row) => this.canRead(user, row))
      .map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        surfaceKey: row.surfaceKey,
        config: row.configJson,
        isDefault: row.isDefault,
        visibilityScope: row.visibilityScope,
        ownerUserId: row.ownerUserId,
        canEdit: row.ownerUserId === user.userId,
      }));
  }

  async create(user: AuthenticatedUser, input: SaveViewInput) {
    this.assertSurface(user, input.surfaceKey);
    const config = this.validateConfig(user, input.surfaceKey, input.config);
    const name = (input.name ?? '').trim();
    if (name.length < 2) {
      throw new AppError('REPORT_DEFINITION_INVALID', {
        message: 'A saved view needs a name of at least two characters.',
      });
    }

    const slug = await this.uniqueSlug(user.tenantId, input.surfaceKey, name);

    const row = await this.prisma.reportSavedView.create({
      data: {
        tenantId: user.tenantId,
        surfaceKey: input.surfaceKey,
        name,
        slug,
        ownerUserId: user.userId,
        visibilityScope: input.visibilityScope ?? ReportVisibilityScope.PRIVATE,
        allowedRoleKeys: (input.allowedRoleKeys ??
          []) as unknown as Prisma.InputJsonValue,
        allowedUserIds: (input.allowedUserIds ??
          []) as unknown as Prisma.InputJsonValue,
        configJson: config as unknown as Prisma.InputJsonValue,
        isDefault: input.isDefault ?? false,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    return { id: row.id, slug: row.slug, name: row.name };
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: Partial<SaveViewInput>,
  ) {
    const row = await this.findOwn(user, id);
    const config =
      input.config !== undefined
        ? this.validateConfig(user, row.surfaceKey, input.config)
        : undefined;

    const updated = await this.prisma.reportSavedView.update({
      where: { id: row.id },
      data: {
        name: input.name?.trim() || undefined,
        configJson:
          config !== undefined
            ? (config as unknown as Prisma.InputJsonValue)
            : undefined,
        visibilityScope: input.visibilityScope ?? undefined,
        allowedRoleKeys:
          input.allowedRoleKeys !== undefined
            ? (input.allowedRoleKeys as unknown as Prisma.InputJsonValue)
            : undefined,
        allowedUserIds:
          input.allowedUserIds !== undefined
            ? (input.allowedUserIds as unknown as Prisma.InputJsonValue)
            : undefined,
        isDefault: input.isDefault ?? undefined,
        updatedById: user.userId,
      },
    });

    return { id: updated.id, name: updated.name };
  }

  async remove(user: AuthenticatedUser, id: string) {
    const row = await this.findOwn(user, id);
    await this.prisma.reportSavedView.update({
      where: { id: row.id },
      data: { isActive: false, updatedById: user.userId },
    });
    return { id: row.id, deleted: true };
  }

  /**
   * A saved view's filters are re-validated on read as well as on write.
   *
   * A view saved when the owner could filter on salary must stop working if
   * that access is withdrawn — and must fail loudly rather than quietly
   * returning the unfiltered set.
   */
  private validateConfig(
    user: AuthenticatedUser,
    surfaceKey: string,
    config: SavedViewConfig,
  ): SavedViewConfig {
    const source = getDataSource(surfaceKey);
    if (!source) {
      throw new AppError('REPORT_SOURCE_UNKNOWN', {
        message: `Unknown reporting area: ${surfaceKey}`,
      });
    }

    if (config.preset && !PERIOD_PRESETS.includes(config.preset as never)) {
      throw new AppError('REPORT_DEFINITION_INVALID', {
        message: `Unsupported period: ${config.preset}`,
      });
    }
    if (
      config.comparison &&
      !COMPARISON_MODES.includes(config.comparison as never)
    ) {
      throw new AppError('REPORT_DEFINITION_INVALID', {
        message: `Unsupported comparison: ${config.comparison}`,
      });
    }

    // Reuse the engine's own validation rather than a second, weaker copy: if
    // planWhere accepts the filters, the surface will too.
    planWhere({
      source,
      user,
      scopeWhere: {},
      filters: config.filters ?? [],
    });

    if (config.breakdown) {
      const known = visibleFields(source, user).some(
        (field) => field.key === config.breakdown,
      );
      if (!known) {
        throw new AppError('REPORT_FIELD_FORBIDDEN', {
          message: `Breakdown field is not available to you: ${config.breakdown}`,
        });
      }
    }

    return config;
  }

  private assertSurface(user: AuthenticatedUser, surfaceKey: string) {
    if (!getDataSource(surfaceKey)) {
      throw new AppError('REPORT_SOURCE_UNKNOWN', {
        message: `Unknown reporting area: ${surfaceKey}`,
      });
    }
  }

  private canRead(user: AuthenticatedUser, row: SavedViewRow): boolean {
    if (row.tenantId !== user.tenantId) return false;
    if (row.ownerUserId === user.userId) return true;
    switch (row.visibilityScope) {
      case ReportVisibilityScope.TENANT:
        return true;
      case ReportVisibilityScope.ROLE:
        return (user.roleKeys ?? []).some((key) =>
          ((row.allowedRoleKeys as string[] | null) ?? []).includes(key),
        );
      case ReportVisibilityScope.USER:
        return ((row.allowedUserIds as string[] | null) ?? []).includes(
          user.userId,
        );
      default:
        return false;
    }
  }

  private async findOwn(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.reportSavedView.findFirst({
      where: { id, tenantId: user.tenantId, isActive: true },
    });
    if (!row) {
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'Saved view not found.',
      });
    }
    if (row.ownerUserId !== user.userId) {
      throw new AppError('ACCESS_DENIED', {
        message: 'You can only change a saved view you created.',
      });
    }
    return row;
  }

  private async uniqueSlug(
    tenantId: string,
    surfaceKey: string,
    name: string,
  ): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'view';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.reportSavedView.findFirst({
        where: { tenantId, surfaceKey, slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}

type SavedViewRow = {
  tenantId: string;
  ownerUserId: string | null;
  visibilityScope: ReportVisibilityScope;
  allowedRoleKeys: Prisma.JsonValue | null;
  allowedUserIds: Prisma.JsonValue | null;
};
