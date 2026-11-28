import {
  dueOn,
  escalationDue,
  resolvePolicy,
  shiftEnd,
  type PolicyFields,
  type ScopePolicyRow,
} from './daily-update-scope';
import type {
  ScheduleDayRow,
  ScheduleView,
} from '../work-items/work-schedule-capacity';

const base: PolicyFields = {
  enabled: true,
  cadence: 'WORKING_DAYS',
  workingDays: [1, 2, 3, 4, 5],
  deadlineMinutes: 1080,
  timezone: 'UTC',
  requireAcknowledgement: false,
  escalateAfterMinutes: null,
};
const scope = (over: Partial<ScopePolicyRow>): ScopePolicyRow => ({
  ...base,
  teamId: null,
  businessUnitId: null,
  ...over,
});

describe('resolvePolicy', () => {
  const tenant = { ...base, deadlineMinutes: 1 };
  const scopes = [
    scope({ businessUnitId: 'bu1', deadlineMinutes: 20 }),
    scope({ teamId: 't1', deadlineMinutes: 10 }),
  ];

  it('prefers the team policy over the business unit and the tenant', () => {
    const got = resolvePolicy(
      { teamId: 't1', businessUnitId: 'bu1' },
      scopes,
      tenant,
    );
    expect(got).toMatchObject({ deadlineMinutes: 10, source: 'TEAM' });
  });

  it('falls to the business unit when the team has none', () => {
    const got = resolvePolicy(
      { teamId: 't9', businessUnitId: 'bu1' },
      scopes,
      tenant,
    );
    expect(got).toMatchObject({ deadlineMinutes: 20, source: 'BUSINESS_UNIT' });
  });

  it('falls to the tenant policy when no scope matches or the person has none', () => {
    expect(
      resolvePolicy({ teamId: null, businessUnitId: 'other' }, scopes, tenant),
    ).toMatchObject({ deadlineMinutes: 1, source: 'TENANT' });
    expect(
      resolvePolicy({ teamId: null, businessUnitId: null }, scopes, tenant),
    ).toMatchObject({ source: 'TENANT' });
  });

  it('a team policy that is switched off switches the team off, it does not fall through', () => {
    const off = [scope({ teamId: 't1', enabled: false })];
    const got = resolvePolicy({ teamId: 't1', businessUnitId: null }, off, {
      ...tenant,
      enabled: true,
    });
    expect(got).toMatchObject({ enabled: false, source: 'TEAM' });
  });
});

function day(over: Partial<ScheduleDayRow>): ScheduleDayRow {
  return {
    dayOfWeek: 'MONDAY',
    isWorkingDay: true,
    startTime: null,
    endTime: null,
    breakMinutes: 0,
    expectedHours: null,
    rotationWeek: null,
    shift: null,
    ...over,
  };
}
function schedule(days: ScheduleDayRow[]): ScheduleView {
  return {
    id: 's',
    name: 's',
    isDefault: false,
    businessUnitId: null,
    organizationId: null,
    weeklyWorkDays: ['MONDAY', 'TUESDAY'],
    standardStartTime: '09:00',
    standardEndTime: '17:00',
    standardHoursPerWeek: 40,
    effectiveStartDate: null,
    effectiveEndDate: null,
    days,
  };
}
const night = {
  expectedHours: 8,
  startTime: '22:00',
  endTime: '06:00',
  breakMinutes: 0,
  isActive: true,
  status: 'ACTIVE',
};
const perShift: PolicyFields = {
  ...base,
  cadence: 'PER_SHIFT',
  deadlineMinutes: 30,
};

describe('dueOn: WORKING_DAYS', () => {
  it('is owed on a working day and due after local midnight in the policy zone', () => {
    // 2026-11-02 is a Monday. 18:00 in Asia/Karachi (+05:00) is 13:00 UTC.
    const due = dueOn({
      policy: { ...base, timezone: 'Asia/Karachi' },
      date: '2026-11-02',
      schedule: null,
      scheduleTimezone: null,
    });
    expect(due.owed).toBe(true);
    expect(due.deadline?.toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });

  it('is not owed on a weekend or when disabled', () => {
    expect(
      dueOn({
        policy: base,
        date: '2026-11-01',
        schedule: null,
        scheduleTimezone: null,
      }).reason,
    ).toBe('NOT_WORKING_DAY');
    expect(
      dueOn({
        policy: { ...base, enabled: false },
        date: '2026-11-02',
        schedule: null,
        scheduleTimezone: null,
      }).owed,
    ).toBe(false);
  });
});

describe('dueOn: PER_SHIFT', () => {
  it('an overnight shift ends the next morning and the deadline follows that end', () => {
    const sched = schedule([day({ shift: night })]);
    const end = shiftEnd(sched, '2026-11-02', 'UTC');
    expect(end?.toISOString()).toBe('2026-11-03T06:00:00.000Z');
    const due = dueOn({
      policy: perShift,
      date: '2026-11-02',
      schedule: sched,
      scheduleTimezone: 'UTC',
    });
    expect(due.owed).toBe(true);
    expect(due.deadline?.toISOString()).toBe('2026-11-03T06:30:00.000Z');
  });

  it('reads the shift end in the schedule zone, across a daylight-saving change', () => {
    // New York leaves daylight time on 2026-11-01 02:00 (EDT -04 -> EST -05).
    // A Sunday night shift 22:00 -> 06:00 ends Monday 06:00 EST = 11:00 UTC.
    const sunday = day({ dayOfWeek: 'SUNDAY', shift: night });
    const sched = schedule([sunday]);
    sched.weeklyWorkDays = ['SUNDAY'];
    const due = dueOn({
      policy: perShift,
      date: '2026-11-01',
      schedule: sched,
      scheduleTimezone: 'America/New_York',
    });
    expect(due.deadline?.toISOString()).toBe('2026-11-02T11:30:00.000Z');
    // A day-shift in a zone ahead of UTC lands on the previous UTC day.
    const dayShift = schedule([
      day({
        shift: { ...night, startTime: '07:00', endTime: '01:00' },
      }),
    ]);
    expect(
      shiftEnd(dayShift, '2026-11-02', 'Pacific/Auckland')?.toISOString(),
    ).toBe('2026-11-02T12:00:00.000Z');
  });

  it('owes nothing on a day the schedule does not work', () => {
    const sched = schedule([
      day({ dayOfWeek: 'MONDAY', shift: night }),
      day({ dayOfWeek: 'SUNDAY', isWorkingDay: false }),
    ]);
    const sunday = dueOn({
      policy: perShift,
      date: '2026-11-01',
      schedule: sched,
      scheduleTimezone: 'UTC',
    });
    expect(sunday).toMatchObject({
      owed: false,
      reason: 'NOT_A_SHIFT_DAY',
      deadline: null,
    });
  });

  it('owes nothing without a schedule, and a retired shift falls back to the day times', () => {
    expect(
      dueOn({
        policy: perShift,
        date: '2026-11-02',
        schedule: null,
        scheduleTimezone: null,
      }).reason,
    ).toBe('NO_SCHEDULE');
    const retired = schedule([
      day({
        startTime: '08:00',
        endTime: '16:00',
        shift: { ...night, isActive: false },
      }),
    ]);
    expect(shiftEnd(retired, '2026-11-02', 'UTC')?.toISOString()).toBe(
      '2026-11-02T16:00:00.000Z',
    );
  });
});

describe('escalationDue', () => {
  const deadline = new Date('2026-11-02T18:00:00.000Z');
  it('waits deadline + escalateAfterMinutes, and never when unset or without a deadline', () => {
    expect(
      escalationDue(deadline, 60, new Date('2026-11-02T18:59:59.000Z')),
    ).toBe(false);
    expect(
      escalationDue(deadline, 60, new Date('2026-11-02T19:00:00.000Z')),
    ).toBe(true);
    expect(escalationDue(deadline, null, new Date('2027-01-01'))).toBe(false);
    expect(escalationDue(null, 5, new Date('2027-01-01'))).toBe(false);
  });
});
