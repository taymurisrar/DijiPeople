import { isDayOff, isHalfDayHoliday } from './work-calendar';
import {
  expectationOn,
  netCapacity,
  rotationCycleLength,
  rotationWeekOn,
  type PersonSchedule,
  type ScheduleView,
} from './work-schedule-capacity';

const schedule = (over: Partial<ScheduleView> = {}): ScheduleView => ({
  id: 's1',
  name: 'Test',
  isDefault: false,
  businessUnitId: null,
  organizationId: null,
  weeklyWorkDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  standardStartTime: '09:00',
  standardEndTime: '17:00',
  standardHoursPerWeek: null,
  effectiveStartDate: null,
  effectiveEndDate: null,
  days: [],
  ...over,
});

const person = (s: ScheduleView | null): PersonSchedule => ({
  scheduleOn: () => s,
  hasSchedule: Boolean(s),
});
const noCalendar = { leave: new Map(), holidays: new Map() };
// 2026-11-30 is a Monday; the week to 2026-12-07 is Mon..Sun.
const week = { from: new Date('2026-11-30'), to: new Date('2026-12-07') };

describe('expectationOn', () => {
  it("prefers the shift's expected hours, then the schedule day's, as the attendance engine does", () => {
    const s = schedule({
      days: [
        {
          dayOfWeek: 'MONDAY',
          isWorkingDay: true,
          startTime: null,
          endTime: null,
          breakMinutes: 0,
          expectedHours: 5,
          rotationWeek: null,
          shift: {
            expectedHours: 7.5,
            startTime: '08:00',
            endTime: '16:00',
            breakMinutes: 30,
            isActive: true,
            status: 'ACTIVE',
          },
        },
        {
          dayOfWeek: 'TUESDAY',
          isWorkingDay: true,
          startTime: null,
          endTime: null,
          breakMinutes: 0,
          expectedHours: 5,
          rotationWeek: null,
          shift: null,
        },
      ],
    });
    expect(expectationOn(s, '2026-11-30')).toMatchObject({
      minutes: 450,
      basis: 'SHIFT',
    });
    expect(expectationOn(s, '2026-12-01')).toMatchObject({
      minutes: 300,
      basis: 'SCHEDULE_DAY',
    });
  });

  it('treats a retired shift as no shift', () => {
    const s = schedule({
      days: [
        {
          dayOfWeek: 'MONDAY',
          isWorkingDay: true,
          startTime: null,
          endTime: null,
          breakMinutes: 0,
          expectedHours: 4,
          rotationWeek: null,
          shift: {
            expectedHours: 8,
            startTime: '08:00',
            endTime: '16:00',
            breakMinutes: 0,
            isActive: false,
            status: 'ARCHIVED',
          },
        },
      ],
    });
    expect(expectationOn(s, '2026-11-30').minutes).toBe(240);
  });

  it('does not work a day the schedule does not work, and derives minutes from start and end less the break', () => {
    const s = schedule({
      standardStartTime: '09:00',
      standardEndTime: '17:30',
    });
    expect(expectationOn(s, '2026-12-05')).toMatchObject({
      working: false,
      minutes: 0,
    }); // Saturday
    expect(expectationOn(s, '2026-11-30')).toMatchObject({
      minutes: 510,
      basis: 'DERIVED_FROM_HOURS',
    });
  });

  it('reads an overnight shift across midnight', () => {
    const s = schedule({
      days: [
        {
          dayOfWeek: 'MONDAY',
          isWorkingDay: true,
          startTime: '22:00',
          endTime: '06:00',
          breakMinutes: 60,
          expectedHours: null,
          rotationWeek: null,
          shift: null,
        },
      ],
    });
    expect(expectationOn(s, '2026-11-30').minutes).toBe(420);
  });

  it('uses a Sunday-to-Thursday working week when that is what the schedule says', () => {
    const s = schedule({
      weeklyWorkDays: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
    });
    expect(expectationOn(s, '2026-12-06').working).toBe(true); // Sunday
    expect(expectationOn(s, '2026-12-04').working).toBe(false); // Friday
  });
});

describe('netCapacity', () => {
  it('is the schedule, not a plain 8-hour Monday-to-Friday week', () => {
    const partTime = schedule({
      weeklyWorkDays: ['MONDAY', 'WEDNESDAY'],
      days: [],
      standardStartTime: '09:00',
      standardEndTime: '13:00',
    });
    const net = netCapacity({
      ...week,
      employeeId: 'e',
      schedule: person(partTime),
      calendar: noCalendar,
    });
    expect(net.scheduledMinutes).toBe(2 * 240);
    expect(net.netMinutes).toBe(480);
    expect(net.basis).toBe('PARTLY_ASSUMED'); // hours derived from start/end
  });

  it("removes a leave day or holiday once, at that day's own minutes, and never charges leave on a day not worked", () => {
    const s = schedule({
      weeklyWorkDays: ['MONDAY', 'TUESDAY'],
      days: [
        {
          dayOfWeek: 'MONDAY',
          isWorkingDay: true,
          startTime: null,
          endTime: null,
          breakMinutes: 0,
          expectedHours: 8,
          rotationWeek: null,
          shift: null,
        },
        {
          dayOfWeek: 'TUESDAY',
          isWorkingDay: true,
          startTime: null,
          endTime: null,
          breakMinutes: 0,
          expectedHours: 4,
          rotationWeek: null,
          shift: null,
        },
      ],
    });
    const calendar = {
      // Leave Monday to Wednesday (Wednesday is not a working day here) and a
      // holiday on the Monday that is already inside the leave.
      leave: new Map([
        [
          'e',
          [
            {
              startDate: new Date('2026-11-30'),
              endDate: new Date('2026-12-02'),
            },
          ],
        ],
      ]),
      holidays: new Map([['e', [new Date('2026-11-30')]]]),
    };
    const net = netCapacity({
      ...week,
      employeeId: 'e',
      schedule: person(s),
      calendar,
    });
    expect(net.scheduledMinutes).toBe(8 * 60 + 4 * 60);
    expect(net.leaveDays).toBe(2); // Monday and Tuesday, not Wednesday
    expect(net.holidayDays).toBe(0); // the holiday is already leave
    expect(net.leaveMinutes).toBe(12 * 60);
    expect(net.netMinutes).toBe(0);
    expect(net.basis).toBe('SCHEDULE');
  });

  it('says so when no schedule applies and falls back to the plain week', () => {
    const net = netCapacity({
      ...week,
      employeeId: 'e',
      schedule: person(null),
      calendar: noCalendar,
    });
    expect(net.netMinutes).toBe(5 * 480);
    expect(net.basis).toBe('NO_SCHEDULE');
  });
});

describe('rotation weeks (WP-09.S2)', () => {
  const row = (
    dayOfWeek: ScheduleView['days'][number]['dayOfWeek'],
    rotationWeek: number | null,
    hours: number,
  ): ScheduleView['days'][number] => ({
    dayOfWeek,
    isWorkingDay: true,
    startTime: null,
    endTime: null,
    breakMinutes: 0,
    expectedHours: hours,
    rotationWeek,
    shift: null,
  });
  // Anchored on Monday 2026-11-30: week 1 is Nov 30 - Dec 6, week 2 Dec 7 - Dec 13.
  const anchor = new Date('2026-11-30T00:00:00.000Z');

  it('finds the cycle length as the largest rotationWeek, 1 when there is none', () => {
    expect(rotationCycleLength([])).toBe(1);
    expect(rotationCycleLength([{ rotationWeek: null }])).toBe(1);
    expect(
      rotationCycleLength([{ rotationWeek: 1 }, { rotationWeek: 3 }]),
    ).toBe(3);
  });

  it('counts whole 7-day weeks from the anchor and wraps on the cycle (length 2)', () => {
    expect(rotationWeekOn('2026-11-30', anchor, 2)).toBe(1);
    expect(rotationWeekOn('2026-12-06', anchor, 2)).toBe(1); // last day of week 1
    expect(rotationWeekOn('2026-12-07', anchor, 2)).toBe(2); // the boundary
    expect(rotationWeekOn('2026-12-13', anchor, 2)).toBe(2);
    expect(rotationWeekOn('2026-12-14', anchor, 2)).toBe(1); // wraps
  });

  it('wraps on a cycle of 3 and continues backwards before the anchor', () => {
    expect(rotationWeekOn('2026-12-14', anchor, 3)).toBe(3);
    expect(rotationWeekOn('2026-12-21', anchor, 3)).toBe(1);
    expect(rotationWeekOn('2026-11-29', anchor, 3)).toBe(3); // the day before
    expect(rotationWeekOn('2026-11-23', anchor, 3)).toBe(3);
    expect(rotationWeekOn('2026-11-22', anchor, 3)).toBe(2);
  });

  it('starts a week on the anchor weekday when the anchor is mid-week', () => {
    const wednesday = new Date('2026-12-02T00:00:00.000Z');
    expect(rotationWeekOn('2026-12-08', wednesday, 2)).toBe(1); // Tue, 6 days in
    expect(rotationWeekOn('2026-12-09', wednesday, 2)).toBe(2); // next Wednesday
    expect(rotationWeekOn('2026-12-15', wednesday, 2)).toBe(2);
    expect(rotationWeekOn('2026-12-16', wednesday, 2)).toBe(1);
  });

  it('uses the fixed epoch when nothing anchors the rotation', () => {
    // 2000-01-03 (a Monday) is week 1; 2026-11-30 is exactly 1,400 weeks later.
    expect(rotationWeekOn('2000-01-03', null, 2)).toBe(1);
    expect(rotationWeekOn('2000-01-10', null, 2)).toBe(2);
    expect(rotationWeekOn('2026-11-30', null, 2)).toBe(1);
    expect(rotationWeekOn('2026-12-07', null, 2)).toBe(2);
  });

  it('applies the row for the rotation week, a null row to every week, and falls back to weeklyWorkDays', () => {
    const s = schedule({
      effectiveStartDate: anchor,
      weeklyWorkDays: ['SATURDAY'],
      days: [
        row('MONDAY', 1, 8),
        row('MONDAY', 2, 4),
        row('TUESDAY', null, 6), // every week
        row('WEDNESDAY', 2, 7), // week 2 only
      ],
    });
    expect(expectationOn(s, '2026-11-30').minutes).toBe(480); // Mon, week 1
    expect(expectationOn(s, '2026-12-07').minutes).toBe(240); // Mon, week 2
    expect(expectationOn(s, '2026-12-01').minutes).toBe(360); // Tue week 1
    expect(expectationOn(s, '2026-12-08').minutes).toBe(360); // Tue week 2
    // Wednesday has a row only for week 2: week 1 has none, so weeklyWorkDays rules.
    expect(expectationOn(s, '2026-12-02').working).toBe(false);
    expect(expectationOn(s, '2026-12-09')).toMatchObject({
      working: true,
      minutes: 420,
    });
    // Saturday has no row at all: weeklyWorkDays says it works.
    expect(expectationOn(s, '2026-12-05').working).toBe(true);
  });

  it('anchors on the assignment start when the schedule has no start of its own', () => {
    const s = schedule({
      days: [row('MONDAY', 1, 8), row('MONDAY', 2, 4)],
    });
    // Assigned from Monday Dec 7: that week is week 1 for this person.
    const assigned = { ...s, assignmentFrom: new Date('2026-12-07') };
    expect(expectationOn(assigned, '2026-12-07').minutes).toBe(480);
    expect(expectationOn(assigned, '2026-12-14').minutes).toBe(240);
    // The schedule's own start outranks the assignment.
    const started = { ...assigned, effectiveStartDate: anchor };
    expect(expectationOn(started, '2026-12-07').minutes).toBe(240);
  });

  it('net capacity follows the rotating weeks', () => {
    const s = schedule({
      effectiveStartDate: anchor,
      weeklyWorkDays: ['MONDAY'],
      days: [row('MONDAY', 1, 8), row('MONDAY', 2, 4)],
    });
    const net = netCapacity({
      from: new Date('2026-11-30'),
      to: new Date('2026-12-14'),
      employeeId: 'e1',
      schedule: person(s),
      calendar: noCalendar,
    });
    expect(net.scheduledMinutes).toBe(480 + 240);
  });
});

describe('half-day holidays (WP-09.S2)', () => {
  const monday = '2026-11-30';
  const calendar = (half: string[], full: string[] = []) => ({
    leave: new Map(),
    holidays: new Map([
      ['e1', full.map((d) => new Date(`${d}T00:00:00.000Z`))],
    ]),
    halfDays: new Map([
      ['e1', half.map((d) => new Date(`${d}T00:00:00.000Z`))],
    ]),
  });
  const s = schedule({
    days: [
      {
        dayOfWeek: 'MONDAY',
        isWorkingDay: true,
        startTime: null,
        endTime: null,
        breakMinutes: 0,
        expectedHours: 8,
        rotationWeek: null,
        shift: null,
      },
    ],
    weeklyWorkDays: ['MONDAY'],
  });
  const run = (cal: ReturnType<typeof calendar>) =>
    netCapacity({
      from: new Date(monday),
      to: new Date('2026-12-01'),
      employeeId: 'e1',
      schedule: person(s),
      calendar: cal,
    });

  it('removes half of that day, and counts half a holiday day', () => {
    expect(run(calendar([monday]))).toMatchObject({
      scheduledMinutes: 480,
      holidayMinutes: 240,
      holidayDays: 0.5,
      netMinutes: 240,
    });
  });

  it('does not double count a half day that is also a full holiday or leave', () => {
    expect(run(calendar([monday], [monday]))).toMatchObject({
      holidayMinutes: 480,
      holidayDays: 1,
      netMinutes: 0,
    });
  });

  it('leaves isDayOff, which daily updates use, treating only full days as off', () => {
    expect(isDayOff(calendar([monday]), 'e1', monday).off).toBe(false);
    expect(isDayOff(calendar([], [monday]), 'e1', monday).off).toBe(true);
    expect(isHalfDayHoliday(calendar([monday]), 'e1', monday)).toBe(true);
    // Hand-built facts without the half-day map still work.
    expect(
      isHalfDayHoliday({ leave: new Map(), holidays: new Map() }, 'e1', monday),
    ).toBe(false);
  });
});
