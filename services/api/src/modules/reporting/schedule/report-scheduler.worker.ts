import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationChannel,
  ReportRunStatus,
  ReportRunTrigger,
  type ReportSchedule,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { AuthAccessService } from '../../auth/auth-access.service';
import { NotificationOrchestratorService } from '../../notifications/notification-orchestrator.service';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { ReportExecutionService } from '../execution/report-execution.service';
import {
  ReportExportService,
  type ReportExportFile,
} from '../export/report-export.service';
import type { PeriodPreset } from '../engine/period.engine';
import type { ReportFilterInput } from '../engine/filter.model';
import { computeNextRun } from './next-run';
import { toStringArray } from './report-schedule.service';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const MIN_POLL_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 100;

/**
 * How many consecutive failures disable a schedule.
 *
 * A schedule whose report has become unrunnable — the definition was deleted,
 * the owner left, a filter references a field that no longer exists — fails the
 * same way every morning. Five is enough to ride out a transient database blip
 * or a deploy and short enough that nobody spends a week ignoring an alert.
 * Disabling records the reason; it does not delete anything.
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** The notification event scheduled deliveries are sent under. */
export const REPORT_SCHEDULE_DELIVERY_EVENT = 'REPORT_SCHEDULE_DELIVERY';

export interface SchedulerDrainResult {
  due: number;
  claimed: number;
  completed: number;
  failed: number;
  disabled: number;
}

/**
 * The platform's first scheduler.
 *
 * BUG-2618 records that this API has no scheduler at all, and ITEM-0083 is
 * deferred behind it, so this class is the pattern the next recurring job will
 * copy. It is deliberately the same shape as `OutboxWorkerService`:
 * `OnModuleInit`/`OnModuleDestroy`, one unref'd interval, a re-entrancy guard,
 * an explicit env flag, and a tick that cannot throw.
 *
 * OFF BY DEFAULT, for the same reason the outbox worker is: a worker that
 * starts itself in every process starts in tests, in `ts-node` seeds and in
 * one-off scripts, and then mails a report to real people from somebody's
 * laptop. Enabling it is a deployment decision.
 *
 * WORK IS CLAIMED, not merely found. The API is single-instance today —
 * `render.yaml` pins it, because the persistent disk cannot be shared — but a
 * conditional `updateMany` costs one statement and is the difference between
 * safe and silently mailing every report twice on the day that changes.
 *
 * AUTHORIZATION IS EVALUATED PER RUN, under the owner's access context. If the
 * owner has been deactivated or their access revoked, the run fails and says
 * so. It never falls back to a service identity: the entire point of storing an
 * owner is that revoking their access stops the export, and a fallback would
 * quietly convert every abandoned schedule into an unbounded data feed.
 */
@Injectable()
export class ReportSchedulerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportSchedulerWorker.name);

  private timer: NodeJS.Timeout | null = null;

  /** Guards against a slow drain overlapping the next tick. */
  private running = false;

  /** Identifies this process on a claimed run, so a stale claim is attributable. */
  private readonly instanceId = `report-scheduler-${process.pid}-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authAccess: AuthAccessService,
    private readonly execution: ReportExecutionService,
    private readonly exports: ReportExportService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly tenantSettings: TenantSettingsResolverService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Report scheduler disabled (REPORTS_SCHEDULER_ENABLED is not "true"); schedules accumulate a due nextRunAt until a worker runs.',
      );
      return;
    }

    const interval = this.pollIntervalMs();
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);

    // Without this the process cannot exit while the interval is pending, which
    // turns every CLI invocation that loads the Nest container into one that
    // has to be killed.
    this.timer.unref?.();

    this.logger.log(`Report scheduler started; polling every ${interval}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isEnabled(): boolean {
    return (
      this.configService.get<string>('REPORTS_SCHEDULER_ENABLED') === 'true'
    );
  }

  private pollIntervalMs(): number {
    const raw = Number(
      this.configService.get<string>('REPORTS_SCHEDULER_POLL_INTERVAL_MS'),
    );
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POLL_INTERVAL_MS;
    return Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw));
  }

  private batchSize(): number {
    const raw = Number(
      this.configService.get<string>('REPORTS_SCHEDULER_BATCH_SIZE'),
    );
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_BATCH_SIZE;
    return Math.max(1, Math.min(Math.trunc(raw), MAX_BATCH_SIZE));
  }

  /**
   * One poll.
   *
   * Never throws. An unhandled rejection from a timer callback takes the
   * process down, and a transient database blip must not be able to stop every
   * tenant's reporting permanently — the next tick retries on its own.
   */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const result = await this.drain(new Date());
      if (result.claimed > 0 || result.disabled > 0) {
        this.logger.log(
          `report.scheduler.drain due=${result.due} claimed=${result.claimed} completed=${result.completed} failed=${result.failed} disabled=${result.disabled}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `report.scheduler.drain_failed reason=${describe(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Claim and run every schedule due at `now`. Exposed for tests and diagnostics. */
  async drain(now: Date): Promise<SchedulerDrainResult> {
    const result: SchedulerDrainResult = {
      due: 0,
      claimed: 0,
      completed: 0,
      failed: 0,
      disabled: 0,
    };

    const due = await this.prisma.reportSchedule.findMany({
      where: { isEnabled: true, nextRunAt: { not: null, lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: this.batchSize(),
    });

    result.due = due.length;

    for (const schedule of due) {
      const claimed = await this.claim(schedule, now);
      if (claimed === 'lost') continue;
      if (claimed === 'unschedulable') {
        result.disabled += 1;
        continue;
      }

      result.claimed += 1;

      const outcome = await this.runSchedule(schedule);
      if (outcome.status === ReportRunStatus.COMPLETED) result.completed += 1;
      else result.failed += 1;
      if (outcome.disabled) result.disabled += 1;
    }

    return result;
  }

  /**
   * Take ownership of one due schedule by moving `nextRunAt` forward.
   *
   * Advancing the cursor IS the claim: the filter still names the old
   * `nextRunAt`, so two workers reading the same due row produce one update of
   * count 1 and one of count 0. The loser does nothing at all rather than
   * running the report a second time.
   */
  private async claim(
    schedule: ReportSchedule,
    now: Date,
  ): Promise<'claimed' | 'lost' | 'unschedulable'> {
    let next: Date;
    try {
      next = computeNextRun({
        frequency: schedule.frequency,
        hour: schedule.hour,
        minute: schedule.minute,
        dayOfWeek: schedule.dayOfWeek,
        dayOfMonth: schedule.dayOfMonth,
        timezone: schedule.timezone,
        after: now,
      });
    } catch (error) {
      // Stored timing that cannot be resolved is a configuration error only an
      // edit can fix. Left enabled it would be re-read on every tick forever,
      // so it is disabled with the reason recorded — and not deleted.
      const reason = `The schedule timing is invalid: ${describe(error)}`;
      await this.prisma.reportSchedule.updateMany({
        where: { id: schedule.id, tenantId: schedule.tenantId },
        data: {
          isEnabled: false,
          nextRunAt: null,
          lastFailureReason: reason,
        },
      });
      this.logger.error(
        `report.scheduler.unschedulable schedule=${schedule.id} tenant=${schedule.tenantId} reason=${reason}`,
      );
      return 'unschedulable';
    }

    const claim = await this.prisma.reportSchedule.updateMany({
      where: {
        id: schedule.id,
        tenantId: schedule.tenantId,
        isEnabled: true,
        nextRunAt: schedule.nextRunAt,
      },
      data: { nextRunAt: next },
    });

    return claim.count === 1 ? 'claimed' : 'lost';
  }

  /**
   * Run one claimed schedule, start to finish.
   *
   * Every attempt gets a `ReportRun` row — queued, then running, then completed
   * or failed. A run that exists only as a log line cannot be shown on a screen
   * or counted in a health check, and "it never even tried" and "it tried and
   * broke" have to be distinguishable from the outside.
   */
  private async runSchedule(schedule: ReportSchedule): Promise<{
    status: ReportRunStatus;
    disabled: boolean;
  }> {
    const startedAt = Date.now();

    const run = await this.prisma.reportRun.create({
      data: {
        tenantId: schedule.tenantId,
        targetKey: schedule.targetKey,
        reportDefinitionId: schedule.reportDefinitionId,
        scheduleId: schedule.id,
        trigger: ReportRunTrigger.SCHEDULED,
        format: schedule.format,
        status: ReportRunStatus.QUEUED,
        requestedByUserId: schedule.ownerUserId,
        executedAsUserId: schedule.ownerUserId,
        paramsJson: {
          preset: schedule.periodPreset,
          scheduleName: schedule.name,
          timezone: schedule.timezone,
        },
        claimedAt: new Date(),
        claimedBy: this.instanceId,
        attemptCount: 1,
      },
      select: { id: true },
    });

    try {
      await this.prisma.reportRun.update({
        where: { id: run.id },
        data: { status: ReportRunStatus.RUNNING, startedAt: new Date() },
      });

      const owner = await this.loadOwner(schedule);
      const file = await this.buildFile(schedule, owner);
      const delivered = await this.deliver(schedule, run.id, file);

      await this.prisma.reportRun.update({
        where: { id: run.id },
        data: {
          status: ReportRunStatus.COMPLETED,
          rowCount: file.rowCount,
          durationMs: Date.now() - startedAt,
          fileName: file.fileName,
          contentType: file.contentType,
          fileSizeBytes: file.buffer.length,
          completedAt: new Date(),
        },
      });

      await this.prisma.reportSchedule.updateMany({
        where: { id: schedule.id, tenantId: schedule.tenantId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: ReportRunStatus.COMPLETED,
          lastFailureReason: null,
          consecutiveFailureCount: 0,
        },
      });

      this.logger.log(
        `report.scheduler.completed schedule=${schedule.id} run=${run.id} rows=${file.rowCount} recipients=${delivered.sent}/${delivered.attempted} ms=${Date.now() - startedAt}`,
      );

      return { status: ReportRunStatus.COMPLETED, disabled: false };
    } catch (error) {
      const reason = describe(error);

      await this.prisma.reportRun.update({
        where: { id: run.id },
        data: {
          status: ReportRunStatus.FAILED,
          failureReason: reason.slice(0, 2000),
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      });

      const failures = schedule.consecutiveFailureCount + 1;
      const disable = failures >= MAX_CONSECUTIVE_FAILURES;

      await this.prisma.reportSchedule.updateMany({
        where: { id: schedule.id, tenantId: schedule.tenantId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: ReportRunStatus.FAILED,
          lastFailureReason: disable
            ? `Disabled after ${failures} consecutive failures. Last failure: ${reason}`.slice(
                0,
                2000,
              )
            : reason.slice(0, 2000),
          consecutiveFailureCount: failures,
          ...(disable ? { isEnabled: false, nextRunAt: null } : {}),
        },
      });

      this.logger.error(
        `report.scheduler.failed schedule=${schedule.id} run=${run.id} failures=${failures} disabled=${disable} reason=${reason}`,
      );

      // Nothing is mailed on failure. A schedule that breaks every morning must
      // stop, not send an error to the whole distribution list until somebody
      // blocks the sender.
      return { status: ReportRunStatus.FAILED, disabled: disable };
    }
  }

  /**
   * The owner's access context, or a failure.
   *
   * There is no fallback branch here on purpose. See the class comment.
   */
  private async loadOwner(
    schedule: ReportSchedule,
  ): Promise<AuthenticatedUser> {
    let context: { authUser?: AuthenticatedUser } | null = null;

    try {
      context = (await this.authAccess.loadAccessContext(
        schedule.ownerUserId,
        schedule.tenantId,
      )) as { authUser?: AuthenticatedUser };
    } catch (error) {
      throw new Error(
        `The schedule owner can no longer be authorized, so the report was not run: ${describe(error)}`,
      );
    }

    if (!context?.authUser) {
      throw new Error(
        'The schedule owner no longer has access, so the report was not run.',
      );
    }

    if (context.authUser.tenantId !== schedule.tenantId) {
      // Belt and braces: loadAccessContext already checks the expected tenant.
      throw new Error(
        'The schedule owner does not belong to the tenant that owns this schedule.',
      );
    }

    return context.authUser;
  }

  /** Run the report as the owner and render it. */
  private async buildFile(
    schedule: ReportSchedule,
    owner: AuthenticatedUser,
  ): Promise<ReportExportFile> {
    const settings = await this.organizationSettings(schedule.tenantId);

    const result = await this.execution.runAll(owner, schedule.targetKey, {
      preset: schedule.periodPreset as PeriodPreset,
      filters: readFilters(schedule.filtersJson),
    });

    return this.exports.buildFile(result, schedule.format, {
      timezone: settings.timezone,
      locale: settings.locale,
      currency: settings.currency,
      dateFormat: settings.dateFormat,
      timeFormat: settings.timeFormat,
      tenantName: settings.tenantName,
    });
  }

  /**
   * Mail the file to every recipient.
   *
   * One dispatch per recipient rather than one with a recipient list: the
   * notification pipeline writes a delivery log row per send, and a single row
   * saying "sent to nine people" cannot tell you which of the nine bounced.
   *
   * A partial delivery still completes the run. The report was produced and
   * most people have it; failing the whole run would count against the
   * disable-after-five streak and eventually stop a schedule because one
   * mailbox was full.
   */
  private async deliver(
    schedule: ReportSchedule,
    runId: string,
    file: ReportExportFile,
  ): Promise<{ attempted: number; sent: number }> {
    const recipientIds = toStringArray(schedule.recipientUserIds);

    // Re-read the recipients now rather than trusting the ids stored at save
    // time: somebody deactivated or moved out of the tenant since then must
    // stop receiving the file.
    const recipients =
      recipientIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: recipientIds }, tenantId: schedule.tenantId },
            select: { id: true, email: true, firstName: true, lastName: true },
          });

    if (recipients.length === 0) {
      throw new Error(
        'The schedule has no deliverable recipient in this workspace.',
      );
    }

    let sent = 0;

    for (const recipient of recipients) {
      try {
        await this.notifications.dispatch({
          tenantId: schedule.tenantId,
          eventCode: REPORT_SCHEDULE_DELIVERY_EVENT,
          channels: [NotificationChannel.EMAIL],
          sourceModule: 'reporting',
          correlationId: runId,
          requestedByUserId: schedule.ownerUserId,
          scope: { userId: recipient.id },
          email: {
            recipient: recipient.email,
            variables: {
              recipientName:
                [recipient.firstName, recipient.lastName]
                  .filter(Boolean)
                  .join(' ') || recipient.email,
              scheduleName: schedule.name,
              reportName: schedule.name,
              periodLabel: schedule.periodPreset,
              format: schedule.format,
              rowCount: file.rowCount,
              fileName: file.fileName,
            },
            attachments: [
              {
                filename: file.fileName,
                content: file.buffer,
                contentType: file.contentType,
              },
            ],
            metadata: {
              scheduleId: schedule.id,
              runId,
              targetKey: schedule.targetKey,
            },
          },
        });
        sent += 1;
      } catch (error) {
        this.logger.warn(
          `report.scheduler.delivery_failed schedule=${schedule.id} run=${runId} recipient=${recipient.id} reason=${describe(error)}`,
        );
      }
    }

    if (sent === 0) {
      throw new Error(
        'The report was produced but could not be delivered to any recipient.',
      );
    }

    return { attempted: recipients.length, sent };
  }

  /**
   * Tenant formatting for the export.
   *
   * A missing settings row must not take a scheduled report down, but the
   * timezone cannot silently become the server's — that is the defect
   * `ReportExportContext` exists to prevent — so the fallback is an explicit
   * UTC, logged.
   */
  private async organizationSettings(tenantId: string) {
    try {
      const settings =
        await this.tenantSettings.getOrganizationSettings(tenantId);
      const system = await this.tenantSettings.getSystemSettings(tenantId);
      return {
        timezone: settings.timezone || 'UTC',
        locale: system?.locale ?? undefined,
        currency: settings.currency || undefined,
        dateFormat: settings.dateFormat || undefined,
        timeFormat:
          settings.timeFormat === '24h' ? ('24h' as const) : ('12h' as const),
        tenantName: settings.companyDisplayName || undefined,
      };
    } catch (error) {
      this.logger.warn(
        `report.scheduler.settings_fallback tenant=${tenantId} reason=${describe(error)}`,
      );
      return {
        timezone: 'UTC',
        locale: undefined,
        currency: undefined,
        dateFormat: undefined,
        timeFormat: '12h' as const,
        tenantName: undefined,
      };
    }
  }
}

/** `filtersJson` is a Json column; anything that is not a filter array is ignored. */
function readFilters(value: unknown): ReportFilterInput[] {
  return Array.isArray(value) ? (value as ReportFilterInput[]) : [];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
