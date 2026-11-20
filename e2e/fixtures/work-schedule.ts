import { expect } from '@playwright/test';
import { withDatabase } from './environment';
import { rows, unique, type Actor } from './growth-api';

/**
 * A working shift for one employee on one date, built through the product API.
 *
 * WHY THIS EXISTS. The Attendance screen refuses a punch on a day the employee's
 * resolved schedule has no shift ("The resolved work schedule does not provide a
 * shift for today" / "is a scheduled off day"). That is correct product
 * behaviour and this fixture leaves it alone: the tenant default schedule, the
 * attendance policy flags (allowOffDayCheckIn and friends) and the validation
 * code are all untouched. What changes is the employee's *own* schedule, which
 * is the first thing the resolver consults: an active EmployeeScheduleAssignment
 * outranks the team, department and tenant default schedules. So a test that
 * needs a punch to succeed gives the synthetic employee a schedule that works
 * on the date, exactly as an administrator would, and takes it away afterwards.
 * It no longer depends on what weekday it happens to run on.
 *
 * Everything is created through the same endpoints the Settings screens use and
 * every name carries the run tag. Archiving is the product's delete for all
 * three records (there is no hard delete), which is a correct end state; the
 * residue check counts only live ones.
 *
 * Assigning a schedule deactivates any overlapping assignment the employee
 * already had (that is the product's rule), so those are recorded first and
 * reactivated on restore.
 */
export type ScheduleFixture = {
  scheduleId: string;
  shiftId: string;
  assignmentId: string;
  /** Archive what was created and reactivate what was displaced. Returns a failure message, or null. */
  restore(): Promise<string | null>;
};

const ALL_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

type Assignment = {
  id: string;
  employeeId: string;
  workScheduleId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason?: string | null;
  isActive: boolean;
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** The calendar date `now` falls on in `timeZone`, as YYYY-MM-DD. */
export function dateInZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Give `employeeId` a seven-day, all-day shift that covers `date` (YYYY-MM-DD,
 * default today in the tenant's timezone) and one day either side, so a run that
 * straddles midnight still resolves a shift.
 */
export async function provisionWorkingShift(
  admin: Actor,
  employeeId: string,
  options: { date?: string; tag?: string } = {},
): Promise<ScheduleFixture> {
  const tag = options.tag ?? unique();

  // The tenant's own timezone, so "today" and the shift window agree with the product.
  const schedules = await admin.get('work-schedules');
  const fallback = rows<{ isDefault?: boolean; isActive?: boolean; timezone?: string }>(
    schedules.body,
  ).find((s) => s.isDefault && s.isActive !== false);
  const timezone = fallback?.timezone || 'UTC';
  const date = options.date ?? dateInZone(timezone);
  const from = dayKey(new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000));
  const to = dayKey(new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000));

  const existing = rows<Assignment>((await admin.get('employee-schedule-assignments')).body).filter(
    (a) =>
      a.employeeId === employeeId &&
      a.isActive &&
      a.effectiveFrom.slice(0, 10) <= to &&
      (!a.effectiveTo || a.effectiveTo.slice(0, 10) >= from),
  );

  const created: Array<() => Promise<unknown>> = [];
  const restore = async () => {
    const failures: string[] = [];
    for (const undo of created.reverse()) {
      await undo().catch((e: Error) => failures.push(e.message));
    }
    if (existing.length) {
      // The API can deactivate an assignment but not reactivate one, and
      // re-creating it collides with the deactivated row (unique per schedule and
      // start date) and would shift its dates. This runs only against the
      // disposable database the suite has already proved it is pointed at.
      const done = await withDatabase((c) =>
        c.query(
          `update "EmployeeScheduleAssignment" set "isActive" = true where id = any($1::text[])`,
          [existing.map((a) => a.id)],
        ),
      ).catch((e: Error) => e);
      if (done === null) failures.push('reactivate assignments: no disposable database configured');
      else if (done instanceof Error) failures.push(`reactivate assignments: ${done.message}`);
    }
    return failures.length ? failures.join('; ') : null;
  };

  try {
    const shift = await admin.post<{ id: string }>('shift-templates', {
      name: `E2E all-day shift ${tag}`,
      code: `E2E${tag}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 30).toUpperCase(),
      timezone,
      startTime: '00:00',
      endTime: '23:59',
      breakMinutes: 0,
      expectedHours: 8,
      lateGraceMinutes: 0,
      earlyExitGraceMinutes: 0,
    });
    expect(shift.status, `create shift: ${shift.message}`).toBeLessThan(300);
    created.push(async () => {
      const r = await admin.del(`shift-templates/${shift.body.id}`);
      if (![200, 204, 404].includes(r.status)) throw new Error(`archive shift: ${r.status} ${r.message}`);
    });

    const schedule = await admin.post<{ id: string }>('work-schedules', {
      name: `E2E seven-day schedule ${tag}`,
      code: `E2E${tag}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 30).toUpperCase(),
      timezone,
      weeklyWorkDays: [...ALL_DAYS],
      standardStartTime: '00:00',
      standardEndTime: '23:59',
      days: ALL_DAYS.map((dayOfWeek, index) => ({
        dayOfWeek,
        isWorkingDay: true,
        shiftTemplateId: shift.body.id,
        startTime: '00:00',
        endTime: '23:59',
        breakMinutes: 0,
        expectedHours: 8,
        sortOrder: index,
      })),
    });
    expect(schedule.status, `create schedule: ${schedule.message}`).toBeLessThan(300);
    created.push(async () => {
      const r = await admin.del(`work-schedules/${schedule.body.id}`);
      if (![200, 204, 404].includes(r.status)) throw new Error(`archive schedule: ${r.status} ${r.message}`);
    });

    const assignment = await admin.post<{ id: string }>('employee-schedule-assignments', {
      employeeId,
      workScheduleId: schedule.body.id,
      effectiveFrom: from,
      effectiveTo: to,
      reason: `E2E working shift ${tag}`,
    });
    expect(assignment.status, `assign schedule: ${assignment.message}`).toBeLessThan(300);
    created.push(async () => {
      const r = await admin.del(`employee-schedule-assignments/${assignment.body.id}`);
      if (![200, 204, 404].includes(r.status)) throw new Error(`deactivate assignment: ${r.status} ${r.message}`);
    });

    return {
      scheduleId: schedule.body.id,
      shiftId: shift.body.id,
      assignmentId: assignment.body.id,
      restore,
    };
  } catch (error) {
    // A half-built fixture must not outlive the failure that interrupted it.
    await restore();
    throw error;
  }
}
