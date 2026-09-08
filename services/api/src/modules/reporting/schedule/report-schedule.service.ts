import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ReportExportFormat,
  ReportScheduleFrequency,
} from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailExecutionService } from '../../notifications/email/email-execution.service';
import { PERIOD_PRESETS, type PeriodPreset } from '../engine/period.engine';
import { parseTargetKey } from '../execution/report-execution.service';
import { computeNextRun, isSupportedTimeZone } from './next-run';

/**
 * What a caller may set on a schedule.
 *
 * Note what is absent: `ownerUserId`, `tenantId`, `nextRunAt`, `lastRunAt`,
 * `lastRunStatus` and `consecutiveFailureCount`. Those are decided here or by
 * the worker. A DTO that exposed `ownerUserId` would let anyone with schedule
 * rights mail themselves a report executed under somebody else's access —
 * which is a privilege escalation dressed as a form field.
 */
export interface ReportScheduleWriteInput {
  name: string;
  targetKey: string;
  reportDefinitionId?: string | null;
  frequency: ReportScheduleFrequency;
  hour: number;
  minute?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timezone: string;
  format?: ReportExportFormat;
  periodPreset: string;
  filters?: unknown;
  /** User ids or tenant email addresses; both resolve to tenant users. */
  recipients: string[];
  isEnabled?: boolean;
}

/** At most this many people may be on one schedule. */
export const MAX_SCHEDULE_RECIPIENTS = 25;

/**
 * A schedule cannot use a fixed custom range.
 *
 * `custom` freezes `from`/`to` at the moment the schedule was saved, so the
 * same rows arrive every week forever and look like a report that has stopped
 * changing rather than one that has stopped moving. Every other preset is
 * relative and re-resolves at execution time.
 */
const SCHEDULABLE_PRESETS: readonly PeriodPreset[] = PERIOD_PRESETS.filter(
  (preset) => preset !== 'custom',
);

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * CRUD for report schedules.
 *
 * The interesting part of this class is not the CRUD, it is that a schedule is
 * a standing grant: it produces a file of tenant data, on a timer, with nobody
 * watching, and mails it to a list. So two things are decided here and nowhere
 * else.
 *
 * FIRST, every recipient must be a real user of THIS tenant, resolved at write
 * time. A free-text address on a recurring export is an exfiltration channel
 * with a nice UI, and "typo in an email address" and "deliberate forward to a
 * personal account" are the same request on the wire.
 *
 * SECOND, `ownerUserId` is the caller and only the caller. The worker executes
 * the report under that person's access context, evaluated fresh on every run,
 * so revoking their access stops the schedule instead of leaving a standing
 * export of data they can no longer see. Letting a caller nominate a different
 * owner would turn schedule-create into a permission-borrowing primitive.
 */
@Injectable()
export class ReportScheduleService {
  private readonly logger = new Logger(ReportScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailExecution: EmailExecutionService,
  ) {}

  /**
   * Whether this workspace can deliver the emails these schedules promise.
   *
   * A schedule is a promise to send somebody a file on a timer, and the demo
   * tenant kept that promise to a `CONSOLE` sink for weeks: the run completed,
   * the delivery log said SENT, and no email existed. The screen has no way to
   * know that unless it asks, so it asks.
   *
   * Resolved through the same provider chain a real send walks — tenant
   * providers, then the platform relay, then the environment — so a tenant
   * relying on the platform provider is not told it cannot send.
   */
  async deliveryCapability(user: AuthenticatedUser) {
    const capability = await this.emailExecution.resolveDeliveryCapability(
      user.tenantId,
    );

    return {
      canDeliver: capability.canDeliver,
      providerType: capability.providerType,
    };
  }

  async list(user: AuthenticatedUser) {
    const rows = await this.prisma.reportSchedule.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isEnabled: 'desc' }, { nextRunAt: 'asc' }, { name: 'asc' }],
      take: 500,
    });

    return rows.map((row) => this.present(row));
  }

  async get(user: AuthenticatedUser, id: string) {
    return this.present(await this.load(user, id));
  }

  async create(user: AuthenticatedUser, input: ReportScheduleWriteInput) {
    const validated = this.validate(input);
    const recipientUserIds = await this.resolveRecipients(
      user.tenantId,
      input.recipients,
    );

    const created = await this.prisma.reportSchedule.create({
      data: {
        tenantId: user.tenantId,
        name: validated.name,
        targetKey: validated.targetKey,
        reportDefinitionId: validated.reportDefinitionId,
        // The caller, never a value off the request. See the class comment.
        ownerUserId: user.userId,
        frequency: validated.frequency,
        hour: validated.hour,
        minute: validated.minute,
        dayOfWeek: validated.dayOfWeek,
        dayOfMonth: validated.dayOfMonth,
        timezone: validated.timezone,
        format: validated.format,
        periodPreset: validated.periodPreset,
        filtersJson: validated.filtersJson,
        recipientUserIds,
        isEnabled: validated.isEnabled,
        nextRunAt: this.nextRunAt(validated),
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    this.logger.log(
      `report.schedule.created tenant=${user.tenantId} schedule=${created.id} target=${created.targetKey} owner=${created.ownerUserId}`,
    );

    return this.present(created);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: ReportScheduleWriteInput,
  ) {
    const existing = await this.load(user, id);
    const validated = this.validate(input);
    const recipientUserIds = await this.resolveRecipients(
      user.tenantId,
      input.recipients,
    );

    // Tenant-scoped write. `update` by bare id would happily edit another
    // tenant's row if `load` were ever relaxed; `updateMany` with the tenant in
    // the filter cannot.
    const result = await this.prisma.reportSchedule.updateMany({
      where: { id: existing.id, tenantId: user.tenantId },
      data: {
        name: validated.name,
        targetKey: validated.targetKey,
        reportDefinitionId: validated.reportDefinitionId,
        frequency: validated.frequency,
        hour: validated.hour,
        minute: validated.minute,
        dayOfWeek: validated.dayOfWeek,
        dayOfMonth: validated.dayOfMonth,
        timezone: validated.timezone,
        format: validated.format,
        periodPreset: validated.periodPreset,
        filtersJson: validated.filtersJson,
        recipientUserIds,
        isEnabled: validated.isEnabled,
        nextRunAt: this.nextRunAt(validated),
        // An edit is a statement that the operator has looked at the schedule,
        // so the failure streak that would have disabled it starts again.
        consecutiveFailureCount: 0,
        lastFailureReason: null,
        updatedById: user.userId,
      },
    });

    if (result.count !== 1) {
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'That schedule no longer exists.',
        details: { scheduleId: id },
      });
    }

    return this.get(user, id);
  }

  /**
   * Enable or disable without re-stating the whole schedule.
   *
   * Re-enabling recomputes `nextRunAt` from now rather than restoring the old
   * one, so a schedule that has been off for a month does not fire the instant
   * it comes back — and does not fire once for every slot it missed.
   */
  async setEnabled(user: AuthenticatedUser, id: string, isEnabled: boolean) {
    const existing = await this.load(user, id);

    await this.prisma.reportSchedule.updateMany({
      where: { id: existing.id, tenantId: user.tenantId },
      data: {
        isEnabled,
        nextRunAt: isEnabled
          ? computeNextRun({
              frequency: existing.frequency,
              hour: existing.hour,
              minute: existing.minute,
              dayOfWeek: existing.dayOfWeek,
              dayOfMonth: existing.dayOfMonth,
              timezone: existing.timezone,
              after: new Date(),
            })
          : null,
        consecutiveFailureCount: isEnabled
          ? 0
          : existing.consecutiveFailureCount,
        lastFailureReason: isEnabled ? null : existing.lastFailureReason,
        updatedById: user.userId,
      },
    });

    return this.get(user, id);
  }

  async remove(user: AuthenticatedUser, id: string) {
    const result = await this.prisma.reportSchedule.deleteMany({
      where: { id, tenantId: user.tenantId },
    });

    if (result.count !== 1) {
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'That schedule no longer exists.',
        details: { scheduleId: id },
      });
    }

    return { deleted: true };
  }

  /**
   * One schedule, or a 404 — never another tenant's.
   *
   * `findFirst` with `{ id, tenantId }`, not `findUnique` by id. A unique
   * lookup on a tenant-owned model returns the row and leaves the caller to
   * remember the check, and the check is what gets forgotten.
   */
  private async load(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.reportSchedule.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'That schedule does not exist.',
        details: { scheduleId: id },
      });
    }

    return row;
  }

  /**
   * Every recipient resolved to a user of this tenant, or the write is refused.
   *
   * Accepts an id or an email so a form can offer either, but both go through a
   * tenant-scoped lookup: a user id belonging to another tenant simply does not
   * resolve, and an address that is not a user of this tenant does not resolve
   * either. There is deliberately no "external recipient" path.
   */
  private async resolveRecipients(
    tenantId: string,
    recipients: unknown,
  ): Promise<string[]> {
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: 'A schedule needs at least one recipient.',
      });
    }

    const requested = [
      ...new Set(
        recipients
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    ];

    if (requested.length === 0) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: 'A schedule needs at least one recipient.',
      });
    }

    if (requested.length > MAX_SCHEDULE_RECIPIENTS) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: `A schedule may have at most ${MAX_SCHEDULE_RECIPIENTS} recipients.`,
        details: {
          requested: requested.length,
          maximum: MAX_SCHEDULE_RECIPIENTS,
        },
      });
    }

    const emails = requested.filter((value) => EMAIL_SHAPE.test(value));
    const ids = requested.filter((value) => !EMAIL_SHAPE.test(value));

    const matches = await this.prisma.user.findMany({
      where: {
        tenantId,
        OR: [
          ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
          ...(emails.length > 0
            ? [{ email: { in: emails, mode: Prisma.QueryMode.insensitive } }]
            : []),
        ],
      },
      select: { id: true, email: true },
    });

    const byId = new Map(matches.map((match) => [match.id, match.id]));
    const byEmail = new Map(
      matches.map((match) => [match.email.toLowerCase(), match.id]),
    );

    const resolved: string[] = [];
    const rejected: string[] = [];

    for (const value of requested) {
      const userId = EMAIL_SHAPE.test(value)
        ? byEmail.get(value.toLowerCase())
        : byId.get(value);

      if (userId) resolved.push(userId);
      else rejected.push(value);
    }

    if (rejected.length > 0) {
      throw new AppError('REPORT_SCHEDULE_RECIPIENT_FORBIDDEN', {
        message:
          'Every recipient must be a user of this workspace. A scheduled report cannot be sent to an outside address.',
        // The rejected values are echoed back so the form can highlight them.
        // They are what the caller already sent, so this reveals nothing — and
        // the response deliberately does not say whether an address exists in
        // some other tenant.
        details: { rejected },
      });
    }

    return [...new Set(resolved)];
  }

  /**
   * Everything a schedule asserts about itself, checked before it is stored.
   *
   * The global ValidationPipe checks the shape of the DTO; this checks the
   * meaning. A `dayOfWeek` of 9 or a `timezone` of "EST5EDT-ish" passes any
   * plausible DTO and then fails inside a background worker at 06:00, which is
   * the worst place to discover it.
   */
  private validate(input: ReportScheduleWriteInput) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length === 0 || name.length > 160) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: 'A schedule needs a name of 1-160 characters.',
      });
    }

    if (typeof input.targetKey !== 'string' || input.targetKey.length === 0) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: 'A schedule needs a report to run.',
      });
    }
    // Throws REPORT_NOT_FOUND for anything that is not std:/def:/srf:.
    const target = parseTargetKey(input.targetKey);
    if (target.kind === 'surface') {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: 'An analytics surface cannot be scheduled; schedule a report.',
        details: { targetKey: input.targetKey },
      });
    }

    const frequency = input.frequency;
    if (!Object.values(ReportScheduleFrequency).includes(frequency)) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: `Unsupported frequency: ${String(frequency)}.`,
      });
    }

    const format = input.format ?? ReportExportFormat.XLSX;
    if (!Object.values(ReportExportFormat).includes(format)) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: `Unsupported export format: ${String(format)}.`,
      });
    }

    const periodPreset = input.periodPreset;
    if (!SCHEDULABLE_PRESETS.includes(periodPreset as PeriodPreset)) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message:
          periodPreset === 'custom'
            ? 'A schedule cannot use a fixed custom date range; pick a relative period such as "previous month".'
            : `Unsupported period: ${String(periodPreset)}.`,
        details: { allowed: SCHEDULABLE_PRESETS },
      });
    }

    if (!isSupportedTimeZone(input.timezone)) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message: `"${String(input.timezone)}" is not a recognised timezone. Use an IANA name such as Asia/Qatar.`,
      });
    }

    const minute = input.minute ?? 0;
    const dayOfWeek =
      frequency === ReportScheduleFrequency.WEEKLY
        ? (input.dayOfWeek ?? null)
        : null;
    const dayOfMonth =
      frequency === ReportScheduleFrequency.MONTHLY
        ? (input.dayOfMonth ?? null)
        : null;

    const validated = {
      name,
      targetKey: input.targetKey,
      reportDefinitionId:
        target.kind === 'definition'
          ? target.id
          : (input.reportDefinitionId ?? null),
      frequency,
      hour: input.hour,
      minute,
      dayOfWeek,
      dayOfMonth,
      timezone: input.timezone,
      format,
      periodPreset,
      filtersJson: (input.filters ?? Prisma.DbNull) as Prisma.InputJsonValue,
      isEnabled: input.isEnabled ?? true,
    };

    // computeNextRun is the authority on hour/minute/dayOfWeek/dayOfMonth
    // ranges. Re-implementing the bounds here would be a second source of truth
    // that drifts from the one the worker actually uses.
    this.nextRunAt(validated);

    return validated;
  }

  private nextRunAt(validated: {
    frequency: ReportScheduleFrequency;
    hour: number;
    minute: number;
    dayOfWeek: number | null;
    dayOfMonth: number | null;
    timezone: string;
  }): Date {
    try {
      return computeNextRun({
        frequency: validated.frequency,
        hour: validated.hour,
        minute: validated.minute,
        dayOfWeek: validated.dayOfWeek,
        dayOfMonth: validated.dayOfMonth,
        timezone: validated.timezone,
        after: new Date(),
      });
    } catch (error) {
      throw new AppError('REPORT_SCHEDULE_INVALID', {
        message:
          error instanceof Error
            ? error.message
            : 'The schedule timing could not be resolved.',
        cause: error,
      });
    }
  }

  private present(row: {
    id: string;
    name: string;
    targetKey: string;
    reportDefinitionId: string | null;
    ownerUserId: string;
    frequency: ReportScheduleFrequency;
    hour: number;
    minute: number;
    dayOfWeek: number | null;
    dayOfMonth: number | null;
    timezone: string;
    format: ReportExportFormat;
    periodPreset: string;
    filtersJson: Prisma.JsonValue | null;
    recipientUserIds: Prisma.JsonValue;
    isEnabled: boolean;
    nextRunAt: Date | null;
    lastRunAt: Date | null;
    lastRunStatus: string | null;
    lastFailureReason: string | null;
    consecutiveFailureCount: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      targetKey: row.targetKey,
      reportDefinitionId: row.reportDefinitionId,
      ownerUserId: row.ownerUserId,
      frequency: row.frequency,
      hour: row.hour,
      minute: row.minute,
      dayOfWeek: row.dayOfWeek,
      dayOfMonth: row.dayOfMonth,
      timezone: row.timezone,
      format: row.format,
      periodPreset: row.periodPreset,
      filters: row.filtersJson ?? null,
      recipientUserIds: toStringArray(row.recipientUserIds),
      isEnabled: row.isEnabled,
      nextRunAt: row.nextRunAt,
      lastRunAt: row.lastRunAt,
      lastRunStatus: row.lastRunStatus,
      lastFailureReason: row.lastFailureReason,
      consecutiveFailureCount: row.consecutiveFailureCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

/** `recipientUserIds` is a Json column; anything but a string array is ignored. */
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
