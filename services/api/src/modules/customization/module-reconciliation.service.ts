/**
 * Explicit, tenant-scoped reconciliation of EXISTING custom modules against the
 * module provisioning plan (module-provisioning.ts).
 *
 * What this is NOT: it never runs at startup, during seeding, on a schedule or
 * across tenants. There is no "all tenants" entry point at all. One caller, one
 * tenant (always `user.tenantId`, never client input), invoked on purpose.
 *
 * Safety properties
 *  - DRY RUN by default. `apply` must be asked for.
 *  - Applying is a separate act: the caller must retype the workspace slug, and
 *    for a PRODUCTION workspace must also cite the owner authorization they hold
 *    (`authorizationRef`). The reference is recorded in the audit log; this
 *    service cannot verify it, which is why it is only ever stored, not trusted.
 *  - Create-only: nothing existing is rewritten, renamed or deleted. A deleted
 *    system view is therefore re-created (the dry run lists it first, so an
 *    admin sees exactly what will be added before agreeing to it).
 *  - One transaction per module. A failure rolls back that module only and the
 *    run continues; re-running resumes, because completed modules have no gap.
 *  - Conflicts (a form key held by a different type, two defaults) are reported
 *    and left alone; they never block the rest of the module.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CustomizationService } from './customization.service';
import type { ReconcileModulesDto } from './dto/reconcile-modules.dto';
import { MODULE_PROVISIONING_VERSION } from './module-provisioning';

export type ModuleReconcileStatus =
  | 'COMPLETE'
  | 'WILL_CREATE'
  | 'CREATED'
  | 'FAILED';

export interface ModuleReconcileItem {
  tableKey: string;
  moduleKind: string;
  status: ModuleReconcileStatus;
  missing: { forms: string[]; views: string[]; actionBar: boolean };
  conflicts: string[];
  drift: { missingCommands: string[]; unexpectedCommands: string[] };
  error?: string;
}

export interface ModuleReconcileReport {
  mode: 'DRY_RUN' | 'APPLIED';
  provisioningVersion: number;
  workspace: { slug: string; environmentType: string };
  summary: {
    modules: number;
    complete: number;
    withGaps: number;
    created: number;
    failed: number;
    withConflicts: number;
  };
  modules: ModuleReconcileItem[];
}

@Injectable()
export class ModuleReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customization: CustomizationService,
    private readonly audit: AuditService,
  ) {}

  async run(
    user: AuthenticatedUser,
    dto: ReconcileModulesDto,
  ): Promise<ModuleReconcileReport> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId },
      select: { id: true, slug: true, environmentType: true },
    });
    if (!tenant) throw new NotFoundException('Workspace was not found.');

    const apply = dto.apply === true;
    if (apply) this.assertAuthorizedToApply(tenant, dto);

    const tables = await this.prisma.customizationTable.findMany({
      where: {
        tenantId: user.tenantId,
        isCustom: true,
        isSystem: false,
        ...(dto.tableKeys?.length ? { tableKey: { in: dto.tableKeys } } : {}),
      },
      orderBy: { tableKey: 'asc' },
    });
    if (dto.tableKeys?.length) {
      const found = new Set(tables.map((t) => t.tableKey));
      const unknown = dto.tableKeys.filter((k) => !found.has(k));
      if (unknown.length)
        throw new NotFoundException(
          `Custom module(s) not found in this workspace: ${unknown.join(', ')}.`,
        );
    }

    const packageRecord = apply
      ? await this.customization.resolveReconcilePackage(user, dto.packageId)
      : null;

    const items: ModuleReconcileItem[] = [];
    for (const table of tables) {
      const inspection = await this.customization.inspectModule(
        this.prisma,
        user.tenantId,
        table,
      );
      const missing = {
        forms: inspection.gap.forms.map((f) => f.formKey),
        views: inspection.gap.views.map((v) => v.viewKey),
        actionBar: inspection.gap.actionBar,
      };
      const hasGap =
        missing.forms.length > 0 ||
        missing.views.length > 0 ||
        missing.actionBar;
      const item: ModuleReconcileItem = {
        tableKey: table.tableKey,
        moduleKind: table.moduleKind,
        status: hasGap ? 'WILL_CREATE' : 'COMPLETE',
        missing,
        conflicts: inspection.conflicts,
        drift: inspection.drift,
      };
      if (apply && hasGap && packageRecord) {
        try {
          // Each module commits on its own: a failure here cannot undo a neighbour.
          await this.prisma.$transaction((tx) =>
            this.customization.provisionExistingModule(
              user,
              table,
              packageRecord.id,
              tx,
            ),
          );
          item.status = 'CREATED';
        } catch (error) {
          item.status = 'FAILED';
          item.error = error instanceof Error ? error.message : String(error);
        }
      }
      items.push(item);
    }

    const report: ModuleReconcileReport = {
      mode: apply ? 'APPLIED' : 'DRY_RUN',
      provisioningVersion: MODULE_PROVISIONING_VERSION,
      workspace: { slug: tenant.slug, environmentType: tenant.environmentType },
      summary: {
        modules: items.length,
        complete: items.filter((i) => i.status === 'COMPLETE').length,
        withGaps: items.filter((i) => i.status !== 'COMPLETE').length,
        created: items.filter((i) => i.status === 'CREATED').length,
        failed: items.filter((i) => i.status === 'FAILED').length,
        withConflicts: items.filter((i) => i.conflicts.length > 0).length,
      },
      modules: items,
    };

    if (apply) {
      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'customization.modules.reconcile',
        entityType: 'customization-modules',
        entityId: tenant.id,
        sourceModule: 'customization',
        afterSnapshot: {
          summary: report.summary,
          authorizationRef: dto.authorizationRef ?? null,
          environmentType: tenant.environmentType,
          tableKeys: items.map((i) => i.tableKey),
        },
      });
    }
    return report;
  }

  private assertAuthorizedToApply(
    tenant: { slug: string; environmentType: string },
    dto: ReconcileModulesDto,
  ) {
    if (dto.confirmTenantSlug !== tenant.slug) {
      throw new AppError('MODULE_RECONCILE_NOT_AUTHORIZED', {
        message:
          "Retype this workspace's slug in confirmTenantSlug to apply changes.",
      });
    }
    if (
      tenant.environmentType === 'PRODUCTION' &&
      !(dto.authorizationRef && dto.authorizationRef.trim().length >= 6)
    ) {
      throw new AppError('MODULE_RECONCILE_NOT_AUTHORIZED', {
        message:
          'Applying to a PRODUCTION workspace requires authorizationRef: the owner approval you hold for this change.',
      });
    }
  }
}
