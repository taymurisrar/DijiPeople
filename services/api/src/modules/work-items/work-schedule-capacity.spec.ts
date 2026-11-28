import {
  expectationOn,
  netCapacity,
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
