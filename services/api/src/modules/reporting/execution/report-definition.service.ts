import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ReportVisibilityScope,
  SecurityPrivilege,
} from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ENTITY_KEYS } from '../../../common/constants/rbac-matrix';
import { resolveEffectiveAccessLevel } from '../../../common/security/rbac-query-scope';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import {
  validateReportConfig,
  type ReportDefinitionConfig,
} from './report-definition.validator';

export interface SaveReportDefinitionInput {
  name: string;
  description?: string | null;
  category: string;
  dataSourceKey: string;
  config: unknown;
  visibilityScope?: ReportVisibilityScope;
  allowedRoleKeys?: string[];
  allowedUserIds?: string[];
}

/**
 * Custom report definitions.
 *
 * Standard reports are code; only custom ones live here. Everything is scoped
 * by `user.tenantId` taken from the token, and every read re-derives what the
 * caller may do rather than trusting a flag stored on the row.
 */
@Injectable()
export class ReportDefinitionService {
  private readonly logger = new Logger(ReportDefinitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listVisible(user: AuthenticatedUser) {
    const candidates = await this.prisma.reportDefinition.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...this.visibilityWhere(user),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 500,
    });

    // The database predicate narrows to the tenant and to rows that are shared
    // in *some* way; it cannot evaluate whether THIS caller is in a JSON array
    // of role keys or user ids. `canRead` is the actual decision and must run —
    // without it, every ROLE- or USER-shared report in the tenant would be
    // listed to everyone.
    const rows = candidates.filter((row) => this.canRead(user, row));

    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      category: row.category,
      dataSourceKey: row.dataSourceKey,
      visibilityScope: row.visibilityScope,
      ownerUserId: row.ownerUserId,
      updatedAt: row.updatedAt.toISOString(),
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      runCount: row.runCount,
      canEdit: this.canEdit(user, row),
      canDelete: this.canDelete(user, row),
    }));
  }

  /**
   * A definition, re-validated for this caller.
   *
   * `validateReportConfig` runs here rather than only at save time on purpose:
   * a saved report outlives the access of whoever saved it, so a column that
   * was permitted in March must be refused in June if the reader's access has
   * since been reduced.
   */
  async getForExecution(user: AuthenticatedUser, id: string) {
    const row = await this.findOwnedByTenant(user, id);
    if (!this.canRead(user, row)) {
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'Report not found.',
        details: { id },
      });
    }

    const config = validateReportConfig(user, row.dataSourceKey, row.configJson);

    // Best-effort usage counters; a failure here must not fail the run.
    void this.prisma.reportDefinition
      .update({
        where: { id: row.id },
        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `reporting.definition.usage_update_failed id=${row.id} reason=${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      dataSourceKey: row.dataSourceKey,
      config,
    };
  }

  async get(user: AuthenticatedUser, id: string) {
    const row = await this.findOwnedByTenant(user, id);
    if (!this.canRead(user, row)) {
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'Report not found.',
        details: { id },
      });
    }
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      category: row.category,
      dataSourceKey: row.dataSourceKey,
      visibilityScope: row.visibilityScope,
      allowedRoleKeys: (row.allowedRoleKeys as string[] | null) ?? [],
      allowedUserIds: (row.allowedUserIds as string[] | null) ?? [],
      config: row.configJson,
      ownerUserId: row.ownerUserId,
      canEdit: this.canEdit(user, row),
      canDelete: this.canDelete(user, row),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(user: AuthenticatedUser, input: SaveReportDefinitionInput) {
    const config = validateReportConfig(user, input.dataSourceKey, input.config);
    const name = this.assertName(input.name);
    const key = await this.uniqueKey(user.tenantId, name);

    const row = await this.prisma.reportDefinition.create({
      data: {
        tenantId: user.tenantId,
        key,
        name,
        description: input.description ?? null,
        category: input.category,
        dataSourceKey: input.dataSourceKey,
        configJson: config as unknown as Prisma.InputJsonValue,
        visibilityScope: input.visibilityScope ?? ReportVisibilityScope.PRIVATE,
        allowedRoleKeys: (input.allowedRoleKeys ??
          []) as unknown as Prisma.InputJsonValue,
        allowedUserIds: (input.allowedUserIds ??
          []) as unknown as Prisma.InputJsonValue,
        ownerUserId: user.userId,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'REPORT_DEFINITION_CREATED',
      entityType: 'ReportDefinition',
      entityId: row.id,
      sourceModule: 'reporting',
      afterSnapshot: { name, dataSourceKey: input.dataSourceKey, config },
    });

    return this.get(user, row.id);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: Partial<SaveReportDefinitionInput>,
  ) {
    const row = await this.findOwnedByTenant(user, id);
    if (!this.canEdit(user, row)) {
      throw new AppError('ACCESS_DENIED', {
        message: 'You cannot edit this report.',
      });
    }

    const dataSourceKey = input.dataSourceKey ?? row.dataSourceKey;
    const config =
      input.config !== undefined
        ? validateReportConfig(user, dataSourceKey, input.config)
        : validateReportConfig(user, dataSourceKey, row.configJson);

    const before = {
      name: row.name,
      visibilityScope: row.visibilityScope,
      config: row.configJson,
    };

    const updated = await this.prisma.reportDefinition.update({
      where: { id: row.id },
      data: {
        name: input.name !== undefined ? this.assertName(input.name) : undefined,
        description: input.description ?? undefined,
        category: input.category ?? undefined,
        dataSourceKey,
        configJson: config as unknown as Prisma.InputJsonValue,
        visibilityScope: input.visibilityScope ?? undefined,
        allowedRoleKeys:
          input.allowedRoleKeys !== undefined
            ? (input.allowedRoleKeys as unknown as Prisma.InputJsonValue)
            : undefined,
        allowedUserIds:
          input.allowedUserIds !== undefined
            ? (input.allowedUserIds as unknown as Prisma.InputJsonValue)
            : undefined,
        updatedById: user.userId,
      },
    });

    const sharingChanged =
      input.visibilityScope !== undefined ||
      input.allowedRoleKeys !== undefined ||
      input.allowedUserIds !== undefined;

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: sharingChanged ? 'REPORT_SHARED' : 'REPORT_DEFINITION_UPDATED',
      entityType: 'ReportDefinition',
      entityId: row.id,
      sourceModule: 'reporting',
      beforeSnapshot: before,
      afterSnapshot: {
        name: updated.name,
        visibilityScope: updated.visibilityScope,
        config,
      },
    });

    return this.get(user, row.id);
  }

  async duplicate(user: AuthenticatedUser, id: string) {
    const source = await this.get(user, id);
    const created = await this.create(user, {
      name: `${source.name} (copy)`,
      description: source.description,
      category: source.category,
      dataSourceKey: source.dataSourceKey,
      config: source.config,
      // A copy starts private regardless of the original's sharing. Inheriting
      // a TENANT scope would silently republish someone else's report under a
      // new owner.
      visibilityScope: ReportVisibilityScope.PRIVATE,
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'REPORT_DEFINITION_DUPLICATED',
      entityType: 'ReportDefinition',
      entityId: created.id,
      sourceModule: 'reporting',
      afterSnapshot: { duplicatedFrom: id, name: created.name },
    });

    return created;
  }

  async remove(user: AuthenticatedUser, id: string) {
    const row = await this.findOwnedByTenant(user, id);
    if (!this.canDelete(user, row)) {
      throw new AppError('ACCESS_DENIED', {
        message: 'You cannot delete this report.',
      });
    }

    // Soft-deactivate rather than destroy: schedules and run history reference
    // this row, and a hard delete would cascade away the audit trail of what
    // was already sent to whom.
    await this.prisma.reportDefinition.update({
      where: { id: row.id },
      data: { isActive: false, updatedById: user.userId },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'REPORT_DEFINITION_DELETED',
      entityType: 'ReportDefinition',
      entityId: row.id,
      sourceModule: 'reporting',
      beforeSnapshot: { name: row.name, dataSourceKey: row.dataSourceKey },
    });

    return { id: row.id, deleted: true };
  }

  // ── visibility ───────────────────────────────────────────────────────────

  /**
   * A deliberately *wide* database predicate, narrowed afterwards by `canRead`.
   *
   * Role and user sharing are stored as JSON arrays, which Prisma cannot filter
   * on portably, so this fetches the candidates and the real decision happens in
   * `canRead`. It excludes only what can be excluded in SQL — another tenant's
   * rows, inactive rows, and other people's PRIVATE ones — so the set that
   * reaches memory is already bounded and small.
   */
  private visibilityWhere(
    user: AuthenticatedUser,
  ): Prisma.ReportDefinitionWhereInput {
    return {
      OR: [
        { ownerUserId: user.userId },
        { visibilityScope: ReportVisibilityScope.TENANT },
        { visibilityScope: ReportVisibilityScope.ROLE },
        { visibilityScope: ReportVisibilityScope.USER },
      ],
    };
  }

  private canRead(user: AuthenticatedUser, row: DefinitionRow): boolean {
    if (row.tenantId !== user.tenantId) return false;
    if (row.ownerUserId === user.userId) return true;

    switch (row.visibilityScope) {
      case ReportVisibilityScope.TENANT:
        return true;
      case ReportVisibilityScope.ROLE: {
        const allowed = (row.allowedRoleKeys as string[] | null) ?? [];
        return (user.roleKeys ?? []).some((key) => allowed.includes(key));
      }
      case ReportVisibilityScope.USER: {
        const allowed = (row.allowedUserIds as string[] | null) ?? [];
        return allowed.includes(user.userId);
      }
      case ReportVisibilityScope.PRIVATE:
      default:
        return false;
    }
  }

  private canEdit(user: AuthenticatedUser, row: DefinitionRow): boolean {
    if (row.tenantId !== user.tenantId) return false;
    if (row.ownerUserId === user.userId) return true;
    return this.hasPrivilege(user, SecurityPrivilege.WRITE);
  }

  /**
   * Deleting your own report needs only WRITE; deleting somebody else's needs
   * DELETE.
   *
   * The `manager` role deliberately holds DELETE on no entity — destroying
   * records belongs to HR and the administrators, and
   * `rbac-matrix.manager-customizer.spec.ts` asserts it. Owner-deletion does
   * not need that privilege: removing a draft you created is not the thing that
   * rule protects.
   */
  private canDelete(user: AuthenticatedUser, row: DefinitionRow): boolean {
    if (row.tenantId !== user.tenantId) return false;
    if (row.ownerUserId === user.userId) {
      return this.hasPrivilege(user, SecurityPrivilege.WRITE);
    }
    return this.hasPrivilege(user, SecurityPrivilege.DELETE);
  }

  private hasPrivilege(
    user: AuthenticatedUser,
    privilege: SecurityPrivilege,
  ): boolean {
    return (
      resolveEffectiveAccessLevel(user, ENTITY_KEYS.REPORTS, privilege) !== 'NONE'
    );
  }

  private async findOwnedByTenant(user: AuthenticatedUser, id: string) {
    // findFirst with the tenant in the predicate, never findUnique by bare id.
    const row = await this.prisma.reportDefinition.findFirst({
      where: { id, tenantId: user.tenantId, isActive: true },
    });
    if (!row) {
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'Report not found.',
        details: { id },
      });
    }
    return row;
  }

  private assertName(name: string): string {
    const trimmed = (name ?? '').trim();
    if (trimmed.length < 2) {
      throw new AppError('REPORT_DEFINITION_INVALID', {
        message: 'A report needs a name of at least two characters.',
      });
    }
    if (trimmed.length > 120) {
      throw new AppError('REPORT_DEFINITION_INVALID', {
        message: 'A report name may be at most 120 characters.',
      });
    }
    return trimmed;
  }

  private async uniqueKey(tenantId: string, name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'report';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.reportDefinition.findFirst({
        where: { tenantId, key: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}

type DefinitionRow = {
  id: string;
  tenantId: string;
  ownerUserId: string | null;
  visibilityScope: ReportVisibilityScope;
  allowedRoleKeys: Prisma.JsonValue | null;
  allowedUserIds: Prisma.JsonValue | null;
  name: string;
  dataSourceKey: string;
};
