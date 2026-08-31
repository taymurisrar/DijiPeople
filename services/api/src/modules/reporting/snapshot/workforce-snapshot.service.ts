import { Injectable, Logger } from '@nestjs/common';
import {
  WorkforceSnapshotDerivation,
  type EmployeeEmploymentStatus,
  type EmployeeGender,
  type EmployeeType,
  type EmployeeWorkMode,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { addDays, parseCivilDate } from '../engine/period.engine';

/**
 * How long after leaving an employee still gets a daily row.
 *
 * A leaver has to appear in the snapshot for the day they left, or `isLeaver`
 * never becomes true for anybody and turnover is structurally zero. The window
 * is wider than one day so that a termination backdated by a few weeks — which
 * is the normal case, not the exception — still lands on the right date the
 * next time that date is captured or backfilled.
 */
export const RECENT_TERMINATION_WINDOW_DAYS = 90;

/** Employees read per page. Bounded so a 20,000-person tenant is not one query. */
export const DEFAULT_SNAPSHOT_BATCH_SIZE = 500;
const MAX_SNAPSHOT_BATCH_SIZE = 2_000;

export interface CaptureDayInput {
  tenantId: string;
  /** `YYYY-MM-DD`, already resolved in the tenant's own timezone. */
  snapshotDate: string;
  /**
   * OBSERVED for the daily job, BACKFILLED for the reconstruction script.
   * There is no default on purpose: see the class comment.
   */
  derivation: WorkforceSnapshotDerivation;
  batchSize?: number;
  dryRun?: boolean;
}

export interface CaptureDayResult {
  tenantId: string;
  snapshotDate: string;
  employeesConsidered: number;
  written: number;
  /** Rows left alone because an OBSERVED row already covers that day. */
  skippedObserved: number;
  joiners: number;
  leavers: number;
  dryRun: boolean;
  durationMs: number;
}

/**
 * Writes one row per employee per day, so history stops being rewritten.
 *
 * `Employee` carries no slowly-changing dimension. `departmentId`,
 * `businessUnitId`, `managerEmployeeId` and `employmentStatus` are mutable
 * current state, so a reorg does not just change today's org chart — it changes
 * every "headcount by department" chart that has ever been drawn, retroactively
 * and silently. Nobody notices, because the numbers still add up. They are just
 * answers to a question nobody asked: "how would last March have looked if last
 * March had had this year's structure?"
 *
 * `WorkforceSnapshotDaily` fixes that going forward by recording what was true
 * on the day. It cannot fix the past — the past was not recorded — which is
 * exactly what the `derivation` column exists to say out loud.
 *
 * OBSERVED IS NEVER OVERWRITTEN BY BACKFILLED. A reconstruction can only place
 * an employee in their *current* department and cannot see a status that
 * flipped and flipped back, so letting it overwrite a row that was captured on
 * the day would trade real history for a plausible-looking guess. The check is
 * in `capture`, not in the caller, because the caller is the one that would
 * forget.
 */
@Injectable()
export class WorkforceSnapshotService {
  private readonly logger = new Logger(WorkforceSnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Whether any row already exists for a tenant-day. Used to skip finished days. */
  async hasSnapshot(tenantId: string, snapshotDate: string): Promise<boolean> {
    const existing = await this.prisma.workforceSnapshotDaily.findFirst({
      where: { tenantId, snapshotDate: parseCivilDate(snapshotDate) },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * Capture one tenant-day.
   *
   * Idempotent: the unique key is `(tenantId, snapshotDate, employeeId)` and
   * every write is an upsert, so re-running a day corrects it rather than
   * duplicating it. That is what makes both the worker and the backfill
   * restartable after a crash without anyone reasoning about where they got to.
   */
  async captureDay(input: CaptureDayInput): Promise<CaptureDayResult> {
    const startedAt = Date.now();
    const snapshotDate = parseCivilDate(input.snapshotDate);
    const batchSize = Math.max(
      1,
      Math.min(
        input.batchSize ?? DEFAULT_SNAPSHOT_BATCH_SIZE,
        MAX_SNAPSHOT_BATCH_SIZE,
      ),
    );

    const result: CaptureDayResult = {
      tenantId: input.tenantId,
      snapshotDate: input.snapshotDate,
      employeesConsidered: 0,
      written: 0,
      skippedObserved: 0,
      joiners: 0,
      leavers: 0,
      dryRun: input.dryRun === true,
      durationMs: 0,
    };

    // Inclusive end of the snapshot day, so an employee hired at 09:00 that
    // morning counts as hired. The stored dates are calendar facts at UTC
    // midnight, so the day-after boundary is the right exclusive bound.
    const dayEnd = parseCivilDate(addDays(input.snapshotDate, 1));
    const terminationFloor = parseCivilDate(
      addDays(input.snapshotDate, -RECENT_TERMINATION_WINDOW_DAYS),
    );

    let cursor: string | undefined;

    for (;;) {
      const employees = await this.prisma.employee.findMany({
        where: {
          tenantId: input.tenantId,
          // Employee is the one HR model that carries both of these, and the
          // existing /reports endpoints omit them — which counts deleted people
          // in headcount. This table does not inherit that.
          isDeleted: false,
          deletedAt: null,
          hireDate: { lt: dayEnd },
          OR: [
            { terminationDate: null },
            { terminationDate: { gte: terminationFloor } },
          ],
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          organizationId: true,
          businessUnitId: true,
          departmentId: true,
          teamId: true,
          designationId: true,
          employeeLevelId: true,
          employmentTypeId: true,
          locationId: true,
          managerEmployeeId: true,
          employmentStatus: true,
          employeeType: true,
          workMode: true,
          gender: true,
          hireDate: true,
          terminationDate: true,
        },
      });

      if (employees.length === 0) break;
      cursor = employees[employees.length - 1].id;
      result.employeesConsidered += employees.length;

      // One read for the whole page: which of these already have a row, and how
      // it was derived. A per-employee check would be a query per person.
      const existing = await this.prisma.workforceSnapshotDaily.findMany({
        where: {
          tenantId: input.tenantId,
          snapshotDate,
          employeeId: { in: employees.map((employee) => employee.id) },
        },
        select: { employeeId: true, derivation: true },
      });
      const derivationByEmployee = new Map(
        existing.map((row) => [row.employeeId, row.derivation]),
      );

      for (const employee of employees) {
        if (
          input.derivation === WorkforceSnapshotDerivation.BACKFILLED &&
          derivationByEmployee.get(employee.id) ===
            WorkforceSnapshotDerivation.OBSERVED
        ) {
          result.skippedObserved += 1;
          continue;
        }

        const row = this.buildRow(
          input.tenantId,
          input.snapshotDate,
          input.derivation,
          employee,
        );

        if (row.isJoiner) result.joiners += 1;
        if (row.isLeaver) result.leavers += 1;

        if (!input.dryRun) {
          await this.prisma.workforceSnapshotDaily.upsert({
            where: {
              tenantId_snapshotDate_employeeId: {
                tenantId: input.tenantId,
                snapshotDate,
                employeeId: employee.id,
              },
            },
            create: { ...row, snapshotDate },
            update: { ...row, snapshotDate },
          });
        }

        result.written += 1;
      }

      if (employees.length < batchSize) break;
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  }

  /**
   * One employee's row for one day.
   *
   * Pure and separated from the loop so the derived fields — the ones a chart
   * actually reads — can be asserted without a database.
   */
  private buildRow(
    tenantId: string,
    snapshotDate: string,
    derivation: WorkforceSnapshotDerivation,
    employee: {
      id: string;
      organizationId: string | null;
      businessUnitId: string | null;
      departmentId: string | null;
      teamId: string | null;
      designationId: string | null;
      employeeLevelId: string | null;
      employmentTypeId: string | null;
      locationId: string | null;
      managerEmployeeId: string | null;
      employmentStatus: EmployeeEmploymentStatus;
      employeeType: EmployeeType | null;
      workMode: EmployeeWorkMode | null;
      gender: EmployeeGender | null;
      hireDate: Date;
      terminationDate: Date | null;
    },
  ) {
    const hireCivil = utcCivilDate(employee.hireDate);
    const terminationCivil = employee.terminationDate
      ? utcCivilDate(employee.terminationDate)
      : null;

    return {
      tenantId,
      employeeId: employee.id,
      organizationId: employee.organizationId,
      businessUnitId: employee.businessUnitId,
      departmentId: employee.departmentId,
      teamId: employee.teamId,
      designationId: employee.designationId,
      employeeLevelId: employee.employeeLevelId,
      employmentTypeId: employee.employmentTypeId,
      locationId: employee.locationId,
      managerEmployeeId: employee.managerEmployeeId,
      employmentStatus: employee.employmentStatus,
      employeeType: employee.employeeType,
      workMode: employee.workMode,
      gender: employee.gender,
      hireDate: employee.hireDate,
      terminationDate: employee.terminationDate,
      isJoiner: hireCivil === snapshotDate,
      isLeaver: terminationCivil !== null && terminationCivil === snapshotDate,
      tenureDays: tenureDays(hireCivil, terminationCivil, snapshotDate),
      derivation,
    };
  }
}

/**
 * The calendar date a stored `DateTime` represents, read in UTC.
 *
 * `hireDate` and `terminationDate` are calendar facts stored at UTC midnight,
 * not instants. Reading them in a tenant's local zone shifts them a day for
 * every tenant west of Greenwich, which turns "hired on the 1st" into "hired on
 * the 31st" and moves the joiner into the previous month's numbers.
 */
export function utcCivilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Days of service as at the snapshot date, counted from the hire date.
 *
 * Zero on the hire day, never negative, and frozen at the termination date for
 * someone who has left — a leaver's tenure must not keep growing in the rows
 * captured during the 90-day window after they go.
 */
export function tenureDays(
  hireCivil: string,
  terminationCivil: string | null,
  snapshotDate: string,
): number {
  const measuredTo =
    terminationCivil !== null && terminationCivil < snapshotDate
      ? terminationCivil
      : snapshotDate;

  const days = Math.round(
    (parseCivilDate(measuredTo).getTime() -
      parseCivilDate(hireCivil).getTime()) /
      86_400_000,
  );

  return Math.max(0, days);
}
