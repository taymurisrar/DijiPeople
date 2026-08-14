import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { addUtcDays } from '../attendance/attendance-time.util';
import { AttendanceReconciliationService } from './attendance-reconciliation.service';

/**
 * Controlled reconciliation of a historical range.
 *
 * NOTHING RUNS THIS AUTOMATICALLY. Deployment does not reconcile history, and
 * this service has no timer: rebuilding years of attendance is a decision with
 * payroll consequences, so it is an explicit act by a named operator.
 *
 * It goes through the reconciliation service like everything else. Writing
 * AttendanceDay rows directly would produce days the engine did not derive, and
 * the next ordinary reconciliation would silently disagree with them.
 */

export interface BackfillRequest {
  tenantId: string;
  from: Date;
  to: Date;
  /** Absent means every employee with a schedule in the tenant. */
  employeeId?: string | null;
  /** Report what would happen and change nothing. */
  dryRun?: boolean;
  /**
   * Rebuild locked days too. Off by default and audited when used: a locked day
   * carries numbers payroll has already consumed.
   */
  includeLocked?: boolean;
  /** Guard against a mistyped range. */
  maxDays?: number;
  requestedById?: string | null;
}

export interface BackfillReport {
  tenantId: string;
  from: string;
  to: string;
  dryRun: boolean;
  employeesConsidered: number;
  daysConsidered: number;
  reconciled: number;
  skippedLocked: number;
  skippedBeforeCutover: number;
  failed: number;
  /** Bounded: a run over a broken tenant must not return ten thousand lines. */
  failures: Array<{ employeeId: string; date: string; reason: string }>;
  durationMs: number;
}

/** A quarter per run. Beyond this, do it in deliberate pieces. */
const DEFAULT_MAX_DAYS = 92;

/** Employees loaded at a time, so one tenant cannot exhaust memory. */
const EMPLOYEE_BATCH = 100;

const MAX_REPORTED_FAILURES = 50;

@Injectable()
export class AttendanceBackfillService {
  private readonly logger = new Logger(AttendanceBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: AttendanceReconciliationService,
  ) {}

  /**
   * Reconciles every employee-day in the range.
   *
   * Runs sequentially and reports as it goes. A failure on one employee-day is
   * recorded and the run continues: one employee with a broken schedule must not
   * cost the other four hundred their rebuild.
   */
  async run(request: BackfillRequest): Promise<BackfillReport> {
    const startedAt = Date.now();
    const maxDays = request.maxDays ?? DEFAULT_MAX_DAYS;

    const from = startOfUtcDay(request.from);
    const to = startOfUtcDay(request.to);

    if (to < from) {
      throw new Error('The end date must not be before the start date.');
    }

    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (days > maxDays) {
      throw new Error(
        `That range covers ${days} days; this run allows at most ${maxDays}. Run it in smaller pieces.`,
      );
    }

    const employees = await this.resolveEmployees(request);

    const report: BackfillReport = {
      tenantId: request.tenantId,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      dryRun: request.dryRun === true,
      employeesConsidered: employees.length,
      daysConsidered: employees.length * days,
      reconciled: 0,
      skippedLocked: 0,
      skippedBeforeCutover: 0,
      failed: 0,
      failures: [],
      durationMs: 0,
    };

    this.logger.log(
      `Attendance backfill ${report.dryRun ? '(dry run) ' : ''}starting: ${employees.length} employee(s) × ${days} day(s) from ${report.from} to ${report.to}.`,
    );

    for (const employeeId of employees) {
      for (let offset = 0; offset < days; offset++) {
        const date = addUtcDays(from, offset);

        try {
          if (request.dryRun) {
            await this.previewDay(request, employeeId, date, report);
            continue;
          }

          if (
            !request.includeLocked &&
            (await this.isLocked(request.tenantId, employeeId, date))
          ) {
            // Reported rather than silently skipped: an operator asking for a
            // rebuild needs to know which days did not move and why.
            report.skippedLocked += 1;
            continue;
          }

          const result = await this.reconciliation.reconcile(
            request.tenantId,
            employeeId,
            date,
          );

          if (result.skippedBecauseLocked) report.skippedLocked += 1;
          else if (result.skippedBeforeCutover)
            report.skippedBeforeCutover += 1;
          else report.reconciled += 1;
        } catch (error) {
          report.failed += 1;
          if (report.failures.length < MAX_REPORTED_FAILURES) {
            report.failures.push({
              employeeId,
              date: date.toISOString().slice(0, 10),
              reason:
                error instanceof Error
                  ? error.message.slice(0, 200)
                  : 'Unknown error',
            });
          }
        }
      }

      // Progress, because a backfill of four hundred employees is not a thing to
      // watch in silence.
      if (report.reconciled % 500 === 0 && report.reconciled > 0) {
        this.logger.log(
          `Attendance backfill progress: ${report.reconciled} day(s) reconciled, ${report.skippedLocked} locked, ${report.failed} failed.`,
        );
      }
    }

    report.durationMs = Date.now() - startedAt;

    this.logger.log(
      `Attendance backfill ${report.dryRun ? '(dry run) ' : ''}finished in ${report.durationMs}ms: ${report.reconciled} reconciled, ${report.skippedLocked} locked, ${report.skippedBeforeCutover} before cutover, ${report.failed} failed.`,
    );

    return report;
  }

  /** Counts what a real run would do, without touching anything. */
  private async previewDay(
    request: BackfillRequest,
    employeeId: string,
    date: Date,
    report: BackfillReport,
  ): Promise<void> {
    if (await this.isLocked(request.tenantId, employeeId, date)) {
      report.skippedLocked += 1;
      return;
    }
    report.reconciled += 1;
  }

  private async isLocked(
    tenantId: string,
    employeeId: string,
    attendanceDate: Date,
  ): Promise<boolean> {
    const day = await this.prisma.attendanceDay.findUnique({
      where: {
        tenantId_employeeId_attendanceDate: {
          tenantId,
          employeeId,
          attendanceDate,
        },
      },
      select: { locked: true },
    });

    return day?.locked === true;
  }

  /**
   * The employees in scope.
   *
   * Deleted employees are excluded; terminated ones are NOT, because attendance
   * for a period someone worked is still worth rebuilding after they leave.
   */
  private async resolveEmployees(request: BackfillRequest): Promise<string[]> {
    if (request.employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: request.employeeId,
          tenantId: request.tenantId,
          isDeleted: false,
        },
        select: { id: true },
      });
      return employee ? [employee.id] : [];
    }

    const employees: string[] = [];
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.employee.findMany({
        where: { tenantId: request.tenantId, isDeleted: false },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: EMPLOYEE_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (batch.length === 0) break;

      employees.push(...batch.map((row) => row.id));
      cursor = batch[batch.length - 1].id;

      if (batch.length < EMPLOYEE_BATCH) break;
    }

    return employees;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
