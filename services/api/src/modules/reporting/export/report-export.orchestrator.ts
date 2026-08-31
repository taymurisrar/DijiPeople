import { Injectable, Logger } from '@nestjs/common';
import { ReportExportFormat, ReportRunTrigger } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { AuditService } from '../../audit/audit.service';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import {
  ReportExecutionService,
  type ReportRunParams,
} from '../execution/report-execution.service';
import { ReportArtifactService } from './report-artifact.service';
import {
  ReportExportService,
  type ReportExportContext,
} from './report-export.service';

/**
 * Ties an export request to a stored, expiring artifact.
 *
 * Runs synchronously inside the request. The API is a single instance behind a
 * persistent disk, exports are capped at a bounded row count, and a user who
 * asked for a file wants the file — a queue would add a polling round trip and
 * a class of "your export is ready" states for no benefit at this size. The
 * `ReportRun` row is written either way, so the history, the retention sweep
 * and the scheduler all share one shape, and moving generation to a worker
 * later changes only this class.
 */
@Injectable()
export class ReportExportOrchestrator {
  private readonly logger = new Logger(ReportExportOrchestrator.name);

  constructor(
    private readonly execution: ReportExecutionService,
    private readonly exports: ReportExportService,
    private readonly artifacts: ReportArtifactService,
    private readonly audit: AuditService,
    private readonly tenantSettings: TenantSettingsResolverService,
  ) {}

  async export(
    user: AuthenticatedUser,
    targetKey: string,
    format: ReportExportFormat,
    params: ReportRunParams = {},
  ) {
    const startedAt = Date.now();

    const run = await this.artifacts.createQueuedRun({
      tenantId: user.tenantId,
      targetKey,
      trigger: ReportRunTrigger.MANUAL,
      format,
      requestedByUserId: user.userId,
      executedAsUserId: user.userId,
      params: params as unknown as Record<string, unknown>,
    });

    try {
      await this.artifacts.markRunning(user.tenantId, run.id);

      // The same execution path the screen uses, so an export cannot contain a
      // row or a column the requester could not see.
      const result = await this.execution.runAll(user, targetKey, params);

      const settings = await this.organizationSettings(user.tenantId);
      const file = await this.exports.buildFile(result, format, settings);

      const completed = await this.artifacts.completeRun(
        user.tenantId,
        run.id,
        file,
        { rowCount: result.total, durationMs: Date.now() - startedAt },
      );

      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'REPORT_EXPORTED',
        entityType: 'ReportRun',
        entityId: run.id,
        sourceModule: 'reporting',
        // The parameters, never the rows. An audit entry that embedded the
        // exported data would be a second copy of it in a table with different
        // access rules.
        afterSnapshot: {
          targetKey,
          format,
          rowCount: result.total,
          period: { preset: params.preset, from: params.from, to: params.to },
        },
      });

      return {
        runId: completed.id,
        status: completed.status,
        fileName: completed.fileName,
        contentType: completed.contentType,
        rowCount: completed.rowCount,
        expiresAt: completed.expiresAt?.toISOString() ?? null,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'The export failed.';
      await this.artifacts.failRun(user.tenantId, run.id, reason);
      this.logger.error(
        `reporting.export.failed run=${run.id} target=${targetKey} reason=${reason}`,
      );
      // Re-thrown so the caller sees the real reason — an export that failed
      // because the row cap was exceeded must say so, not report a generic 500.
      throw error instanceof AppError
        ? error
        : new AppError('REPORT_EXPORT_FAILED', { message: reason });
    }
  }

  /**
   * The tenant's formatting context for the file.
   *
   * `timezone` matters most: a date rendered in the server's zone rather than
   * the tenant's is off by a day for half the world, and an exported file has
   * no provider to correct it later.
   */
  private async organizationSettings(
    tenantId: string,
  ): Promise<ReportExportContext> {
    try {
      const settings =
        await this.tenantSettings.getOrganizationSettings(tenantId);
      return {
        timezone: settings.timezone || 'UTC',
        currency: settings.currency || 'USD',
        tenantName: settings.companyDisplayName || undefined,
        dateFormat: settings.dateFormat || undefined,
        timeFormat:
          settings.timeFormat === '12h' || settings.timeFormat === '24h'
            ? settings.timeFormat
            : undefined,
      };
    } catch {
      // A missing settings row must not fail an export. UTC is the same
      // fallback the resolver itself uses.
      return { timezone: 'UTC', currency: 'USD' };
    }
  }
}
