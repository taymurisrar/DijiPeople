import type { ScheduleView } from '../work-items/work-schedule-capacity';
import { expectationOn } from '../work-items/work-schedule-capacity';
import { isWorkingDay, zonedInstant } from './daily-update-draft';

/*
 * DP-MASTER WP-27.S2. Which daily-update policy applies to one person, and when
 * that person's update is owed and due. Pure: everything it needs is passed in, so
 * the precedence and the shift arithmetic are provable without a database.
 */

export type DailyUpdateCadenceKey = 'WORKING_DAYS' | 'PER_SHIFT';
export type PolicySource = 'TEAM' | 'BUSINESS_UNIT' | 'TENANT';

export type PolicyFields = {
  enabled: boolean;
  cadence: DailyUpdateCadenceKey;
  workingDays: number[];
  deadlineMinutes: number;
  timezone: string;
  requireAcknowledgement: boolean;
  /** Minutes past the deadline at which a missed update is escalated; null = never. */
  escalateAfterMinutes: number | null;
};

export type EffectivePolicy = PolicyFields & { source: PolicySource };

export type ScopePolicyRow = PolicyFields & {
  teamId: string | null;
  businessUnitId: string | null;
};

/**
 * The policy that governs one person: their team's, else their business unit's,
 * else the tenant-wide one. The most specific scope wins outright - a team policy
 * that is switched off switches that team off, it does not fall through.
 */
export function resolvePolicy(
  person: { teamId: string | null; businessUnitId: string | null },
  scopes: ScopePolicyRow[],
  tenant: PolicyFields,
): EffectivePolicy {
  const team = person.teamId
    ? scopes.find((s) => s.teamId !== null && s.teamId === person.teamId)
    : undefined;
  if (team) return { ...pick(team), source: 'TEAM' };
  const unit = person.businessUnitId
    ? scopes.find(
        (s) =>
          s.businessUnitId !== null &&
          s.businessUnitId === person.businessUnitId,
      )
    : undefined;
  if (unit) return { ...pick(unit), source: 'BUSINESS_UNIT' };
  return { ...tenant, source: 'TENANT' };
}

function pick(row: PolicyFields): PolicyFields {
  return {
    enabled: row.enabled,
    cadence: row.cadence,
    workingDays: row.workingDays,
    deadlineMinutes: row.deadlineMinutes,
    timezone: row.timezone,
    requireAcknowledgement: row.requireAcknowledgement,
    escalateAfterMinutes: row.escalateAfterMinutes,
  };
}

const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

function clockMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * When the shift worked on `date` ends, as an instant in the schedule's zone.
 * An overnight shift (it ends at or before it starts on the clock) ends the
 * next calendar morning. The shift template wins over the schedule day's own
 * times, which win over the schedule's standard hours - the same order in which
 * the capacity code reads a retired shift out of the picture.
 */
export function shiftEnd(
  schedule: ScheduleView,
  date: string,
  scheduleTimezone: string,
): Date | null {
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  const row = schedule.days.find((d) => d.dayOfWeek === weekday);
  const shift =
    row?.shift?.isActive && row.shift.status === 'ACTIVE' ? row.shift : null;
  const start = clockMinutes(
    shift?.startTime ?? row?.startTime ?? schedule.standardStartTime,
  );
  const end = clockMinutes(
    shift?.endTime ?? row?.endTime ?? schedule.standardEndTime,
  );
  if (end === null) return null;
  const overnight = start !== null && end <= start;
  return zonedInstant(date, overnight ? end + 1440 : end, scheduleTimezone);
}

export type DueReason =
  | 'OWED'
  | 'DISABLED'
  | 'NOT_WORKING_DAY'
  | 'NO_SCHEDULE'
  | 'NOT_A_SHIFT_DAY';

export type Due = {
  owed: boolean;
  reason: DueReason;
  /** When the update is due. Null on a day nothing is due (per-shift only). */
  deadline: Date | null;
};

/**
 * Is an update owed for `date`, and by when?
 *
 * WORKING_DAYS: owed on the policy's weekdays; due `deadlineMinutes` after local
 * midnight in the policy zone (the deadline is still reported on a day off, so a
 * late flag on an update someone chose to write anyway keeps its old meaning).
 *
 * PER_SHIFT: owed only on a day the person's effective schedule says they work;
 * due `deadlineMinutes` after the shift ends, in the schedule's own zone.
 */
export function dueOn(input: {
  policy: PolicyFields;
  date: string;
  schedule: ScheduleView | null;
  scheduleTimezone: string | null;
}): Due {
  const { policy, date } = input;
  const midnightDeadline = () =>
    zonedInstant(date, policy.deadlineMinutes, policy.timezone);
  if (policy.cadence === 'WORKING_DAYS') {
    const working = isWorkingDay(date, policy.workingDays);
    return {
      owed: policy.enabled && working,
      reason: !policy.enabled
        ? 'DISABLED'
        : working
          ? 'OWED'
          : 'NOT_WORKING_DAY',
      deadline: midnightDeadline(),
    };
  }
  if (!policy.enabled) {
    return { owed: false, reason: 'DISABLED', deadline: null };
  }
  if (!input.schedule) {
    return { owed: false, reason: 'NO_SCHEDULE', deadline: null };
  }
  if (!expectationOn(input.schedule, date).working) {
    return { owed: false, reason: 'NOT_A_SHIFT_DAY', deadline: null };
  }
  const end = shiftEnd(
    input.schedule,
    date,
    input.scheduleTimezone ?? policy.timezone,
  );
  return {
    owed: true,
    reason: 'OWED',
    deadline: end
      ? new Date(end.getTime() + policy.deadlineMinutes * 60_000)
      : midnightDeadline(),
  };
}

/** Has a missed update waited long enough past its deadline to be escalated? */
export function escalationDue(
  deadline: Date | null,
  escalateAfterMinutes: number | null,
  now: Date,
): boolean {
  if (!deadline || escalateAfterMinutes === null) return false;
  return now.getTime() >= deadline.getTime() + escalateAfterMinutes * 60_000;
}
