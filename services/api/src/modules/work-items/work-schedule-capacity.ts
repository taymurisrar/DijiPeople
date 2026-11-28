import type { WorkWeekday } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  organizationalScopes,
  scheduleCandidates,
  type EmployeeHierarchy,
} from '../attendance/work-configuration-hierarchy';
import { dayKey } from './work-item-capacity';
import { isDayOff, type CalendarFacts } from './work-calendar';

/*
 * DP-MASTER WP-09.S1. What a person is SCHEDULED to work, day by day, from the
 * schedule that actually applies to them, instead of "Monday to Friday, 8 hours".
 *
 * Nothing here invents a second scheduling model. The schedule a person follows is
 * chosen by the attendance module's own precedence (work-configuration-hierarchy:
 * dated assignment, employee, team, department, business unit, organisation,
 * tenant default), and a day's minutes follow the attendance engine's rule: the
 * shift's expected hours, else the schedule day's expected hours. Where a working
 * day names neither, the minutes come from its start and end less the break, and
 * only as a last resort from the standard 8 hours - and the answer says which, so a
 * planner can tell a measured figure from an assumed one.
 */

const DAY = 86_400_000;
const WEEKDAYS: WorkWeekday[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];
const STANDARD_DAY_MINUTES = 8 * 60;

export type ScheduleDayRow = {
  dayOfWeek: WorkWeekday;
  isWorkingDay: boolean;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  expectedHours: number | null;
  rotationWeek: number | null;
  shift: {
    expectedHours: number;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    isActive: boolean;
    status: string;
  } | null;
};

export type ScheduleView = {
  id: string;
  name: string;
  isDefault: boolean;
  businessUnitId: string | null;
  organizationId: string | null;
  weeklyWorkDays: WorkWeekday[];
  standardStartTime: string;
  standardEndTime: string;
  standardHoursPerWeek: number | null;
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
  days: ScheduleDayRow[];
};

/** How trustworthy one day's minutes are, weakest last. */
export type MinutesBasis =
  | 'SHIFT'
  | 'SCHEDULE_DAY'
  | 'DERIVED_FROM_HOURS'
  | 'ASSUMED_STANDARD_DAY';

export type DayExpectation = {
  working: boolean;
  minutes: number;
  basis: MinutesBasis | null;
};

function clockMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function spanMinutes(
  start: string | null,
  end: string | null,
  breakMinutes: number,
): number | null {
  const a = clockMinutes(start);
  const b = clockMinutes(end);
  if (a === null || b === null) return null;
  // An overnight shift ends the next morning.
  const raw = b > a ? b - a : b + 24 * 60 - a;
  const net = raw - Math.max(0, breakMinutes);
  return net > 0 ? net : null;
}

/** What one schedule expects of a person on one calendar day (YYYY-MM-DD). */
export function expectationOn(
  schedule: ScheduleView,
  day: string,
): DayExpectation {
  const weekday = WEEKDAYS[new Date(`${day}T00:00:00.000Z`).getUTCDay()];
  const row = schedule.days.find((d) => d.dayOfWeek === weekday);
  const working = row
    ? row.isWorkingDay
    : schedule.weeklyWorkDays.includes(weekday);
  if (!working) return { working: false, minutes: 0, basis: null };

  // A retired shift is no shift, as the attendance engine treats it.
  const shift =
    row?.shift?.isActive && row.shift.status === 'ACTIVE' ? row.shift : null;
  if (shift?.expectedHours) {
    return {
      working: true,
      minutes: Math.round(shift.expectedHours * 60),
      basis: 'SHIFT',
    };
  }
  if (row?.expectedHours) {
    return {
      working: true,
      minutes: Math.round(row.expectedHours * 60),
      basis: 'SCHEDULE_DAY',
    };
  }
  const derived =
    spanMinutes(
      row?.startTime ?? shift?.startTime ?? schedule.standardStartTime,
      row?.endTime ?? shift?.endTime ?? schedule.standardEndTime,
      row?.breakMinutes ?? 0,
    ) ??
    (schedule.standardHoursPerWeek && schedule.weeklyWorkDays.length
      ? Math.round(
          (schedule.standardHoursPerWeek * 60) / schedule.weeklyWorkDays.length,
        )
      : null);
  if (derived) {
    return { working: true, minutes: derived, basis: 'DERIVED_FROM_HOURS' };
  }
  return {
    working: true,
    minutes: STANDARD_DAY_MINUTES,
    basis: 'ASSUMED_STANDARD_DAY',
  };
}

export type PersonSchedule = {
  /** The schedule in force on each day, or null where none applies. */
  scheduleOn: (day: string) => ScheduleView | null;
  /** True when at least one day in the period had a schedule. */
  hasSchedule: boolean;
};

export type CapacityFacts = Map<string, PersonSchedule>;

type EmployeeRow = EmployeeHierarchy & {
  id: string;
  defaultWorkScheduleId: string | null;
  team: { defaultWorkScheduleId: string | null } | null;
  department: { defaultWorkScheduleId: string | null } | null;
};

function inWindow(
  schedule: { effectiveStartDate: Date | null; effectiveEndDate: Date | null },
  day: string,
): boolean {
  const at = new Date(`${day}T00:00:00.000Z`).getTime();
  if (schedule.effectiveStartDate && schedule.effectiveStartDate.getTime() > at)
    return false;
  if (schedule.effectiveEndDate && schedule.effectiveEndDate.getTime() < at)
    return false;
  return true;
}

/**
 * Loads every schedule fact for these people in one pass: three queries however
 * many people, never one per person per day.
 */
export async function loadScheduleFacts(
  prisma: PrismaService,
  tenantId: string,
  employeeIds: string[],
  from: Date,
  to: Date,
): Promise<CapacityFacts> {
  const facts: CapacityFacts = new Map();
  if (!employeeIds.length) return facts;

  const [employees, assignments, schedules] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId, id: { in: employeeIds }, isDeleted: false },
      select: {
        id: true,
        organizationId: true,
        businessUnitId: true,
        departmentId: true,
        teamId: true,
        defaultWorkScheduleId: true,
        team: { select: { defaultWorkScheduleId: true } },
        department: { select: { defaultWorkScheduleId: true } },
      },
    }),
    prisma.employeeScheduleAssignment.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        isActive: true,
        effectiveFrom: { lt: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      },
      select: {
        employeeId: true,
        workScheduleId: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      take: 10_000,
    }),
    prisma.workSchedule.findMany({
      where: { tenantId, isActive: true, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        isDefault: true,
        businessUnitId: true,
        organizationId: true,
        weeklyWorkDays: true,
        standardStartTime: true,
        standardEndTime: true,
        standardHoursPerWeek: true,
        effectiveStartDate: true,
        effectiveEndDate: true,
        days: {
          select: {
            dayOfWeek: true,
            isWorkingDay: true,
            startTime: true,
            endTime: true,
            breakMinutes: true,
            expectedHours: true,
            rotationWeek: true,
            shiftTemplate: {
              select: {
                expectedHours: true,
                startTime: true,
                endTime: true,
                breakMinutes: true,
                isActive: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      take: 500,
    }),
  ]);

  const views = new Map<string, ScheduleView>(
    schedules.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        isDefault: s.isDefault,
        businessUnitId: s.businessUnitId,
        organizationId: s.organizationId,
        weeklyWorkDays: s.weeklyWorkDays,
        standardStartTime: s.standardStartTime,
        standardEndTime: s.standardEndTime,
        standardHoursPerWeek:
          s.standardHoursPerWeek == null
            ? null
            : Number(s.standardHoursPerWeek),
        effectiveStartDate: s.effectiveStartDate,
        effectiveEndDate: s.effectiveEndDate,
        days: s.days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          isWorkingDay: d.isWorkingDay,
          startTime: d.startTime,
          endTime: d.endTime,
          breakMinutes: d.breakMinutes,
          expectedHours:
            d.expectedHours == null ? null : Number(d.expectedHours),
          rotationWeek: d.rotationWeek,
          shift: d.shiftTemplate
            ? {
                expectedHours: Number(d.shiftTemplate.expectedHours),
                startTime: d.shiftTemplate.startTime,
                endTime: d.shiftTemplate.endTime,
                breakMinutes: d.shiftTemplate.breakMinutes,
                isActive: d.shiftTemplate.isActive,
                status: d.shiftTemplate.status,
              }
            : null,
        })),
      },
    ]),
  );
  const list = [...views.values()];

  for (const employee of employees as EmployeeRow[]) {
    const mine = assignments.filter((a) => a.employeeId === employee.id);
    const standing = (): ScheduleView | null => {
      for (const candidate of scheduleCandidates({
        employeeScheduleId: employee.defaultWorkScheduleId,
        teamScheduleId: employee.team?.defaultWorkScheduleId,
        departmentScheduleId: employee.department?.defaultWorkScheduleId,
      })) {
        const found = views.get(candidate.id);
        if (found) return found;
      }
      for (const scope of organizationalScopes(employee)) {
        const scoped = list.find((s) =>
          scope.businessUnitId
            ? s.businessUnitId === scope.businessUnitId
            : s.businessUnitId === null &&
              s.organizationId === scope.organizationId,
        );
        if (scoped) return scoped;
      }
      return list.find((s) => s.isDefault) ?? null;
    };
    const fallback = standing();
    let any = false;
    const scheduleOn = (day: string): ScheduleView | null => {
      const at = new Date(`${day}T00:00:00.000Z`).getTime();
      // A dated assignment is a deliberate statement about a period, and wins.
      for (const a of mine) {
        if (a.effectiveFrom.getTime() > at) continue;
        if (a.effectiveTo && a.effectiveTo.getTime() < at) continue;
        const view = views.get(a.workScheduleId);
        if (view && inWindow(view, day)) {
          any = true;
          return view;
        }
      }
      if (fallback && inWindow(fallback, day)) {
        any = true;
        return fallback;
      }
      return null;
    };
    facts.set(employee.id, {
      scheduleOn,
      get hasSchedule() {
        return any;
      },
    });
  }
  return facts;
}

export type NetCapacity = {
  /** Minutes the schedule says the person works in the period, before leave/holidays. */
  scheduledMinutes: number;
  leaveMinutes: number;
  holidayMinutes: number;
  netMinutes: number;
  leaveDays: number;
  holidayDays: number;
  /** Days in the period the person was scheduled to work. */
  scheduledDays: number;
  /**
   * SCHEDULE: every figure comes from a schedule. PARTLY_ASSUMED: some working days
   * named no hours, so a derived or standard figure was used. NO_SCHEDULE: nothing
   * applies to this person, so the plain Monday-to-Friday 8 hours is used and the
   * caller is told so.
   */
  basis: 'SCHEDULE' | 'PARTLY_ASSUMED' | 'NO_SCHEDULE';
};

/**
 * Net capacity for one person: the minutes their own schedule expects, less the
 * working days they are on approved leave or a holiday. A day removed by both is
 * removed once, as holiday-inside-leave always was; and a day the schedule does
 * not work is never "leave", so leave over a weekend costs nothing.
 */
export function netCapacity(input: {
  from: Date;
  to: Date;
  employeeId: string;
  schedule: PersonSchedule | undefined;
  calendar: CalendarFacts;
}): NetCapacity {
  const out: NetCapacity = {
    scheduledMinutes: 0,
    leaveMinutes: 0,
    holidayMinutes: 0,
    netMinutes: 0,
    leaveDays: 0,
    holidayDays: 0,
    scheduledDays: 0,
    basis: 'SCHEDULE',
  };
  let assumed = false;
  let noSchedule = 0;
  const start = Date.UTC(
    input.from.getUTCFullYear(),
    input.from.getUTCMonth(),
    input.from.getUTCDate(),
  );
  for (let t = start; t < input.to.getTime(); t += DAY) {
    const day = dayKey(new Date(t));
    const schedule = input.schedule?.scheduleOn(day) ?? null;
    let expectation: DayExpectation;
    if (schedule) {
      expectation = expectationOn(schedule, day);
      if (
        expectation.basis === 'DERIVED_FROM_HOURS' ||
        expectation.basis === 'ASSUMED_STANDARD_DAY'
      ) {
        assumed = true;
      }
    } else {
      // No schedule applies: the plain working week, named as such.
      const weekday = new Date(t).getUTCDay();
      const working = weekday !== 0 && weekday !== 6;
      expectation = {
        working,
        minutes: working ? STANDARD_DAY_MINUTES : 0,
        basis: working ? 'ASSUMED_STANDARD_DAY' : null,
      };
      if (working) noSchedule += 1;
    }
    if (!expectation.working) continue;
    out.scheduledDays += 1;
    out.scheduledMinutes += expectation.minutes;
    const off = isDayOff(input.calendar, input.employeeId, day);
    if (off.off && off.reason === 'LEAVE') {
      out.leaveDays += 1;
      out.leaveMinutes += expectation.minutes;
    } else if (off.off) {
      out.holidayDays += 1;
      out.holidayMinutes += expectation.minutes;
    }
  }
  out.netMinutes = Math.max(
    0,
    out.scheduledMinutes - out.leaveMinutes - out.holidayMinutes,
  );
  if (noSchedule > 0 && noSchedule === out.scheduledDays) {
    out.basis = 'NO_SCHEDULE';
  } else if (assumed || noSchedule > 0) {
    out.basis = 'PARTLY_ASSUMED';
  }
  return out;
}
