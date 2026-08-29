import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  TimesheetJobStatus,
  TimesheetJobType,
  TimesheetRestrictionMode,
  TimesheetStatus,
  TimesheetWeekStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RunTimesheetJobDto } from './dto/timesheet-job.dto';
import { TimesheetCalculationService } from './timesheet-calculation.service';
import { TimesheetExportService } from './timesheet-export.service';
import { TimesheetGenerationService } from './timesheet-generation.service';
import { TimesheetPolicyResolverService } from './timesheet-policy-resolver.service';
import { TimesheetWorkflowService } from './timesheet-workflow.service';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';

@Injectable()
export class TimesheetJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimesheetJobsService.name);
  private timer: NodeJS.Timeout | null = null;
  private scheduledCycleRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: TimesheetGenerationService,
    private readonly calculation: TimesheetCalculationService,
    private readonly policies: TimesheetPolicyResolverService,
    private readonly exports: TimesheetExportService,
    private readonly workflow: TimesheetWorkflowService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.runScheduledCycle(),
      15 * 60 * 1000,
    );
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list(user: AuthenticatedUser) {
    return this.prisma.timesheetJobExecution.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async run(user: AuthenticatedUser, dto: RunTimesheetJobDto) {
    const key =
      dto.idempotencyKey?.trim() ||
      defaultKey(dto.jobType, dto.year, dto.month);
    const existing = await this.prisma.timesheetJobExecution.findUnique({
      where: {
        tenantId_jobType_idempotencyKey: {
          tenantId: user.tenantId,
          jobType: dto.jobType,
          idempotencyKey: key,
        },
      },
    });
    if (
      existing?.status === TimesheetJobStatus.COMPLETED ||
      existing?.status === TimesheetJobStatus.SKIPPED
    )
      return existing;
    if (existing?.status === TimesheetJobStatus.RUNNING)
      throw new ConflictException('This idempotent job is already running.');

    const execution = await this.prisma.timesheetJobExecution.upsert({
      where: {
        tenantId_jobType_idempotencyKey: {
          tenantId: user.tenantId,
          jobType: dto.jobType,
          idempotencyKey: key,
        },
      },
      create: {
        tenantId: user.tenantId,
        jobType: dto.jobType,
        idempotencyKey: key,
        status: TimesheetJobStatus.RUNNING,
        input: { year: dto.year ?? null, month: dto.month ?? null },
        startedAt: new Date(),
      },
      update: {
        status: TimesheetJobStatus.RUNNING,
        retryCount: { increment: 1 },
        failureReason: null,
        startedAt: new Date(),
        completedAt: null,
      },
    });
    try {
      const result = await this.execute(user, dto);
      const completed = await this.prisma.timesheetJobExecution.update({
        where: { id: execution.id },
        data: {
          status: TimesheetJobStatus.COMPLETED,
          result: toJson(result),
          completedAt: new Date(),
        },
      });
      if (await this.shouldAuditBackgroundJobs(user.tenantId)) {
        await this.audit.log({
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: 'TIMESHEET_BACKGROUND_JOB_COMPLETED',
          entityType: 'TimesheetJobExecution',
          entityId: execution.id,
          sourceModule: 'timesheets',
          scope: { jobType: dto.jobType, idempotencyKey: key },
          afterSnapshot: result,
        });
      }
      return completed;
    } catch (error) {
      await this.prisma.timesheetJobExecution.update({
        where: { id: execution.id },
        data: {
          status: TimesheetJobStatus.FAILED,
          failureReason:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : 'Job failed.',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async execute(user: AuthenticatedUser, dto: RunTimesheetJobDto) {
    const target = targetMonth(dto.year, dto.month);
    switch (dto.jobType) {
      case TimesheetJobType.NEXT_MONTH_GENERATION:
        return this.generateMonth(
          user,
          dto.year && dto.month ? target : nextMonth(),
        );
      case TimesheetJobType.CURRENT_MONTH_REPAIR:
      case TimesheetJobType.ATTENDANCE_PREFILL:
      case TimesheetJobType.ATTENDANCE_RECONCILIATION:
      case TimesheetJobType.HOLIDAY_RECALCULATION:
      case TimesheetJobType.LEAVE_RECALCULATION:
        return this.synchronizeMonth(user, target, reasonFor(dto.jobType));
      case TimesheetJobType.WEEK_OPENING:
        return this.openWeeks(user.tenantId);
      case TimesheetJobType.OVERDUE_DETECTION:
      case TimesheetJobType.PAYROLL_READINESS:
        return this.recalculateMonth(user.tenantId, target);
      case TimesheetJobType.SUBMISSION_REMINDER:
      case TimesheetJobType.APPROVAL_ESCALATION:
        return this.sendReminders(user, dto.jobType);
      case TimesheetJobType.EXPORT_GENERATION:
      case TimesheetJobType.INTEGRATION_RETRY:
        return { exports: await this.exports.processQueued(user.tenantId) };
      case TimesheetJobType.ACCESS_RESTRICTION:
        return this.evaluateRestrictions(user, target);
      case TimesheetJobType.RESTRICTION_REMOVAL:
        return this.removeRestrictions(user.tenantId);
      case TimesheetJobType.CUTOFF_LOCKING:
        return this.applyCutoffLocks(user, target);
      case TimesheetJobType.PAYROLL_EXPORT:
        return this.exportPayrollReady(user, target);
      default:
        return { processed: 0 };
    }
  }

  private async generateMonth(
    user: AuthenticatedUser,
    target: { year: number; month: number },
  ) {
    const { start, end } = monthRange(target.year, target.month);
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        employmentStatus: 'ACTIVE',
        hireDate: { lte: end },
        OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
      },
      select: {
        id: true,
        organizationId: true,
        businessUnitId: true,
        departmentId: true,
        teamId: true,
      },
    });
    let generated = 0;
    for (const employee of employees) {
      const policy = await this.policies.resolveForEmployee(
        user.tenantId,
        employee.id,
        start,
      );
      if (
        !booleanSetting(
          policy.values,
          'generateNextMonthAutomatically',
          true,
        ) &&
        target.month !== new Date().getUTCMonth() + 1
      )
        continue;
      const timesheet = await this.prisma.timesheet.upsert({
        where: {
          tenantId_employeeId_year_month: {
            tenantId: user.tenantId,
            employeeId: employee.id,
            year: target.year,
            month: target.month,
          },
        },
        create: {
          tenantId: user.tenantId,
          employeeId: employee.id,
          organizationId: employee.organizationId,
          businessUnitId: employee.businessUnitId,
          departmentId: employee.departmentId,
          teamId: employee.teamId,
          year: target.year,
          month: target.month,
          periodStart: start,
          periodEnd: end,
          status: TimesheetStatus.DRAFT,
          createdById: user.userId,
          updatedById: user.userId,
        },
        update: {},
      });
      await this.generation.synchronize(
        user,
        timesheet.id,
        'NEXT_MONTH_GENERATION',
      );
      generated += 1;
    }
    return {
      processed: employees.length,
      generated,
      year: target.year,
      month: target.month,
    };
  }

  private async synchronizeMonth(
    user: AuthenticatedUser,
    target: { year: number; month: number },
    reason: Parameters<TimesheetGenerationService['synchronize']>[2],
  ) {
    const items = await this.prisma.timesheet.findMany({
      where: {
        tenantId: user.tenantId,
        year: target.year,
        month: target.month,
      },
      select: { id: true },
    });
    for (const item of items)
      await this.generation.synchronize(user, item.id, reason);
    return { processed: items.length, year: target.year, month: target.month };
  }

  private async recalculateMonth(
    tenantId: string,
    target: { year: number; month: number },
  ) {
    const items = await this.prisma.timesheet.findMany({
      where: { tenantId, year: target.year, month: target.month },
      select: { id: true },
    });
    for (const item of items)
      await this.calculation.recalculate(tenantId, item.id);
    return { processed: items.length, year: target.year, month: target.month };
  }

  private async openWeeks(tenantId: string) {
    const result = await this.prisma.timesheetWeek.updateMany({
      where: {
        tenantId,
        status: TimesheetWeekStatus.NOT_AVAILABLE,
        startDate: { lte: new Date() },
      },
      data: { status: TimesheetWeekStatus.OPEN, version: { increment: 1 } },
    });
    return { opened: result.count };
  }

  private async sendReminders(user: AuthenticatedUser, type: TimesheetJobType) {
    const statuses =
      type === TimesheetJobType.APPROVAL_ESCALATION
        ? [
            TimesheetWeekStatus.PENDING_APPROVAL,
            TimesheetWeekStatus.PARTIALLY_APPROVED,
          ]
        : [
            TimesheetWeekStatus.INCOMPLETE,
            TimesheetWeekStatus.OVERDUE,
            TimesheetWeekStatus.READY_TO_SUBMIT,
          ];
    const weeks = await this.prisma.timesheetWeek.findMany({
      where: {
        tenantId: user.tenantId,
        status: { in: statuses },
        endDate: { lte: new Date() },
      },
      include: {
        timesheet: {
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                userId: true,
                manager: { select: { userId: true } },
              },
            },
          },
        },
      },
      take: 500,
    });
    for (const week of weeks) {
      await this.notifications.emit({
        tenantId: user.tenantId,
        eventKey:
          type === TimesheetJobType.APPROVAL_ESCALATION
            ? 'TIMESHEET_APPROVAL_ESCALATION'
            : 'TIMESHEET_SUBMISSION_REMINDER',
        moduleKey: 'timesheet',
        actorUserId: user.userId,
        relatedEntityType: 'timesheetWeek',
        relatedEntityId: week.id,
        metadata: {
          timesheetId: week.timesheetId,
          employeeName: `${week.timesheet.employee.firstName} ${week.timesheet.employee.lastName}`,
          employeeUserId: week.timesheet.employee.userId,
          managerUserId: week.timesheet.employee.manager?.userId,
          weekNumber: week.weekNumber,
        },
      });
    }
    return { notified: weeks.length };
  }

  private async evaluateRestrictions(
    user: AuthenticatedUser,
    target: { year: number; month: number },
  ) {
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: user.tenantId,
        year: target.year,
        month: target.month,
        weeks: { some: { status: TimesheetWeekStatus.OVERDUE } },
      },
      include: {
        weeks: { where: { status: TimesheetWeekStatus.OVERDUE } },
        employee: {
          select: {
            user: {
              select: {
                userRoles: {
                  select: { role: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    });
    let created = 0;
    for (const timesheet of timesheets) {
      const policy = await this.policies.resolveForEmployee(
        user.tenantId,
        timesheet.employeeId,
        timesheet.periodEnd,
      );
      if (!booleanSetting(policy.values, 'enableAccessRestrictions', false))
        continue;
      const excludedEmployees = stringList(policy.values.excludedEmployeeIds);
      if (excludedEmployees.includes(timesheet.employeeId)) continue;
      const roleKeys =
        timesheet.employee.user?.userRoles.map(({ role }) => role.key) ?? [];
      const excludedRoles = stringList(policy.values.excludedRoleKeys);
      if (roleKeys.some((roleKey) => excludedRoles.includes(roleKey))) continue;
      if (
        booleanSetting(policy.values, 'managerRestrictionExemption', false) &&
        roleKeys.some((roleKey) => roleKey.toLowerCase().includes('manager'))
      )
        continue;
      if (
        booleanSetting(policy.values, 'hrRestrictionExemption', true) &&
        roleKeys.some((roleKey) => roleKey.toLowerCase().includes('hr'))
      )
        continue;
      const afterDays = numberSetting(policy.values, 'restrictionAfterDays', 7);
      if (
        !timesheet.weeks.some(
          (week) => daysBetween(week.endDate, new Date()) >= afterDays,
        )
      )
        continue;
      const existing = await this.prisma.timesheetAccessRestriction.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeId: timesheet.employeeId,
          isActive: true,
        },
      });
      if (existing) continue;
      await this.prisma.timesheetAccessRestriction.create({
        data: {
          tenantId: user.tenantId,
          employeeId: timesheet.employeeId,
          reason:
            typeof policy.values.restrictionMessage === 'string' &&
            policy.values.restrictionMessage.trim()
              ? policy.values.restrictionMessage.trim()
              : 'Overdue required timesheet',
          sourceTimesheetIds: [timesheet.id],
          restrictionMode: enumRestriction(policy.values.restrictionMode),
          startAt: new Date(),
          expiryAt: addDays(
            new Date(),
            numberSetting(policy.values, 'restrictionExpiryDays', 7),
          ),
        },
      });
      created += 1;
    }
    return { evaluated: timesheets.length, created };
  }

  private async removeRestrictions(tenantId: string) {
    const [restrictions, exports] = await Promise.all([
      this.prisma.timesheetAccessRestriction.updateMany({
        where: { tenantId, isActive: true, expiryAt: { lte: new Date() } },
        data: { isActive: false },
      }),
      this.exports.expireFiles(tenantId),
    ]);
    return {
      restrictionsRemoved: restrictions.count,
      exportFilesExpired: exports.count,
    };
  }

  private async applyCutoffLocks(
    user: AuthenticatedUser,
    target: { year: number; month: number },
  ) {
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: user.tenantId,
        year: target.year,
        month: target.month,
      },
      select: { id: true, employeeId: true, periodEnd: true },
    });
    let locked = 0;
    for (const timesheet of timesheets) {
      const policy = await this.policies.resolveForEmployee(
        user.tenantId,
        timesheet.employeeId,
        timesheet.periodEnd,
      );
      const cutoff = Math.min(
        31,
        numberSetting(policy.values, 'payrollCutoffDay', 25),
      );
      if (new Date().getUTCDate() < cutoff) continue;
      const result = await this.prisma.timesheetWeek.updateMany({
        where: {
          tenantId: user.tenantId,
          timesheetId: timesheet.id,
          status: {
            in: [
              TimesheetWeekStatus.APPROVED,
              TimesheetWeekStatus.PAYROLL_READY,
            ],
          },
        },
        data: {
          status: TimesheetWeekStatus.LOCKED,
          lockStatus: 'CUTOFF_LOCKED',
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      locked += result.count;
    }
    return { evaluated: timesheets.length, locked };
  }

  private async exportPayrollReady(
    user: AuthenticatedUser,
    target: { year: number; month: number },
  ) {
    const items = await this.prisma.timesheet.findMany({
      where: {
        tenantId: user.tenantId,
        year: target.year,
        month: target.month,
        payrollStatus: 'READY',
      },
      select: { id: true },
    });
    let exported = 0;
    for (const item of items) {
      await this.workflow.handoffToPayroll(user, item.id);
      exported += 1;
    }
    return { processed: items.length, exported };
  }

  private async runScheduledCycle() {
    if (this.scheduledCycleRunning) return;
    this.scheduledCycleRunning = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          ownerUser: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          users: {
            where: { status: 'ACTIVE' },
            select: { id: true, email: true, firstName: true, lastName: true },
            take: 1,
          },
        },
      });
      const jobs: TimesheetJobType[] = [
        TimesheetJobType.WEEK_OPENING,
        TimesheetJobType.OVERDUE_DETECTION,
        TimesheetJobType.EXPORT_GENERATION,
        TimesheetJobType.RESTRICTION_REMOVAL,
      ];
      for (const tenant of tenants) {
        const actor = tenant.ownerUser ?? tenant.users[0];
        if (!actor) continue;
        const user = systemUser(tenant.id, actor);
        for (const jobType of jobs) {
          try {
            await this.run(user, { jobType });
          } catch (error) {
            this.logger.error(
              `Scheduled ${jobType} failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    } finally {
      this.scheduledCycleRunning = false;
    }
  }
  /*
   * BUG-2045 — `timesheets.auditBackgroundJobs`, which existed and nothing read.
   *
   * 216 of 305 audit rows on one tenant were `TIMESHEET_BACKGROUND_JOB_COMPLETED`
   * — machine events with no actor decision behind them, generated as a side
   * effect of 61 manual attendance entries, crowding out the human actions an
   * auditor opens the log to find. The toggle that answers this was already in
   * the settings catalog and already rendered on screen as "Audit background
   * jobs". It was simply not wired to anything.
   *
   * The repository owner chose (2026-08-29) to wire it and default it **off**:
   * the audit log is for actor decisions, and a tenant that wants the machine
   * events can ask for them. That is a deliberate behaviour change for existing
   * tenants on upgrade, not an accident of the default.
   *
   * Note the default here is `false` while the catalog still declares `true`.
   * That is not a contradiction to tidy away — the catalog value is what an
   * unconfigured tenant is *shown*, and changing it is a settings-catalog
   * migration. Until that lands this reader treats "not explicitly enabled" as
   * off, which is the decided behaviour. Whoever changes the catalog should
   * delete this comment and the `?? false` together.
   *
   * A failure to read settings must not lose the job result, so this fails
   * closed to the decided default rather than throwing.
   */
  private async shouldAuditBackgroundJobs(tenantId: string): Promise<boolean> {
    try {
      const category = await this.tenantSettings.getTenantSettingsCategory(
        tenantId,
        'timesheets',
      );
      const value = (category.settings as Record<string, unknown>)
        .auditBackgroundJobs;
      return value === true;
    } catch (error) {
      this.logger.warn(
        `Could not read timesheets.auditBackgroundJobs for tenant ${tenantId}; ` +
          `not auditing this background job. ${
            error instanceof Error ? error.message : ''
          }`,
      );
      return false;
    }
  }
}

function targetMonth(year?: number, month?: number) {
  const now = new Date();
  return {
    year: year ?? now.getUTCFullYear(),
    month: month ?? now.getUTCMonth() + 1,
  };
}
function nextMonth() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
function monthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}
function defaultKey(type: TimesheetJobType, year?: number, month?: number) {
  const now = new Date();
  const target = targetMonth(year, month);
  const hourBucket = now
    .toISOString()
    .slice(0, type === TimesheetJobType.EXPORT_GENERATION ? 16 : 13);
  return `${target.year}-${String(target.month).padStart(2, '0')}:${hourBucket}`;
}
function reasonFor(
  type: TimesheetJobType,
): Parameters<TimesheetGenerationService['synchronize']>[2] {
  if (type === TimesheetJobType.HOLIDAY_RECALCULATION)
    return 'HOLIDAY_RECALCULATION';
  if (type === TimesheetJobType.LEAVE_RECALCULATION)
    return 'LEAVE_RECALCULATION';
  if (
    type === TimesheetJobType.ATTENDANCE_PREFILL ||
    type === TimesheetJobType.ATTENDANCE_RECONCILIATION
  )
    return 'ATTENDANCE_PREFILL';
  return 'CURRENT_MONTH_REPAIR';
}
function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function booleanSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: boolean,
) {
  return typeof settings[key] === 'boolean' ? settings[key] : fallback;
}
function numberSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}
function stringList(value: unknown) {
  if (Array.isArray(value))
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
function enumRestriction(value: unknown) {
  return Object.values(TimesheetRestrictionMode).includes(
    value as TimesheetRestrictionMode,
  )
    ? (value as TimesheetRestrictionMode)
    : TimesheetRestrictionMode.WARNING_ONLY;
}
function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + Math.max(1, days));
  return result;
}
function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}
function systemUser(
  tenantId: string,
  actor: { id: string; email: string; firstName: string; lastName: string },
): AuthenticatedUser {
  return {
    userId: actor.id,
    tenantId,
    email: actor.email,
    firstName: actor.firstName,
    lastName: actor.lastName,
    roleIds: [],
    roleKeys: ['system-scheduler'],
    permissionKeys: [
      'timesheets.read',
      'timesheets.read.all',
      'timesheets.write',
      'timesheets.submit',
      'timesheets.approve',
      'timesheets.reject',
      'timesheets.export',
      'timesheets.unlock',
      'timesheets.settings.read',
      'timesheets.settings.update',
    ],
  };
}
