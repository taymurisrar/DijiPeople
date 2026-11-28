import type { PrismaService } from '../../common/prisma/prisma.service';

/*
 * DP-MASTER WP-06.S3 / WP-27. The leave and holiday facts about people in a
 * period, loaded once and shared by everything that must not treat a day off as a
 * working day: net capacity (work items) and "who owes a daily update" (daily
 * updates). One place, so the two never disagree about whether Tuesday was a day off.
 */
export type CalendarFacts = {
  leave: Map<string, Array<{ startDate: Date; endDate: Date }>>;
  holidays: Map<string, Date[]>;
  /**
   * Half-day holidays (Holiday.isHalfDay), kept apart on purpose: isDayOff - and so
   * "who owes a daily update" - treats only a FULL day off as not owed, while
   * capacity removes half of a half-day's scheduled minutes. Optional so a caller
   * that builds facts by hand (a spec) need not know about them.
   */
  halfDays?: Map<string, Date[]>;
};

export async function loadCalendarFacts(
  prisma: PrismaService,
  tenantId: string,
  employeeIds: string[],
  from: Date,
  to: Date,
): Promise<CalendarFacts> {
  const facts: CalendarFacts = {
    leave: new Map(),
    holidays: new Map(),
    halfDays: new Map(),
  };
  if (!employeeIds.length) return facts;

  const [employees, leave, assignments] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId, id: { in: employeeIds } },
      select: { id: true, businessUnitId: true, organizationId: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        startDate: { lt: to },
        endDate: { gte: from },
      },
      select: { employeeId: true, startDate: true, endDate: true },
      take: 10_000,
    }),
    prisma.holidayCalendarAssignment.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        projectId: null,
        AND: [
          {
            OR: [
              { effectiveStartDate: null },
              { effectiveStartDate: { lt: to } },
            ],
          },
          {
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: from } },
            ],
          },
        ],
      },
      select: {
        businessUnitId: true,
        organizationId: true,
        isDefault: true,
        holidayCalendar: {
          select: {
            holidays: {
              where: {
                isActive: true,
                holidayDate: { gte: from, lt: to },
              },
              select: { holidayDate: true, isHalfDay: true },
            },
          },
        },
      },
    }),
  ]);

  for (const row of leave) {
    const list = facts.leave.get(row.employeeId) ?? [];
    list.push({ startDate: row.startDate, endDate: row.endDate });
    facts.leave.set(row.employeeId, list);
  }
  // The calendar closest to the person: their business unit, then their
  // organisation, then the tenant default.
  for (const employee of employees) {
    const chosen =
      assignments.find(
        (a) =>
          employee.businessUnitId &&
          a.businessUnitId === employee.businessUnitId,
      ) ??
      assignments.find(
        (a) =>
          employee.organizationId &&
          a.organizationId === employee.organizationId &&
          !a.businessUnitId,
      ) ??
      assignments.find(
        (a) => a.isDefault && !a.businessUnitId && !a.organizationId,
      );
    const days = chosen?.holidayCalendar.holidays ?? [];
    facts.holidays.set(
      employee.id,
      days.filter((h) => !h.isHalfDay).map((h) => h.holidayDate),
    );
    facts.halfDays?.set(
      employee.id,
      days.filter((h) => h.isHalfDay).map((h) => h.holidayDate),
    );
  }
  return facts;
}

/** Is this calendar day (YYYY-MM-DD) a day off for the person: leave or holiday? */
export function isDayOff(
  facts: CalendarFacts,
  employeeId: string,
  day: string,
): { off: boolean; reason: 'LEAVE' | 'HOLIDAY' | null } {
  const at = new Date(`${day}T00:00:00.000Z`).getTime();
  for (const range of facts.leave.get(employeeId) ?? []) {
    const start = Date.UTC(
      range.startDate.getUTCFullYear(),
      range.startDate.getUTCMonth(),
      range.startDate.getUTCDate(),
    );
    const end = Date.UTC(
      range.endDate.getUTCFullYear(),
      range.endDate.getUTCMonth(),
      range.endDate.getUTCDate(),
    );
    if (at >= start && at <= end) return { off: true, reason: 'LEAVE' };
  }
  for (const holiday of facts.holidays.get(employeeId) ?? []) {
    if (holiday.toISOString().slice(0, 10) === day) {
      return { off: true, reason: 'HOLIDAY' };
    }
  }
  return { off: false, reason: null };
}

/**
 * Is this calendar day a HALF-day holiday for the person? A full day off (leave or
 * a full holiday) wins, so a half-day on top of one is not reported twice.
 */
export function isHalfDayHoliday(
  facts: CalendarFacts,
  employeeId: string,
  day: string,
): boolean {
  if (isDayOff(facts, employeeId, day).off) return false;
  return (facts.halfDays?.get(employeeId) ?? []).some(
    (d) => d.toISOString().slice(0, 10) === day,
  );
}
