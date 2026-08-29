import { WorkWeekday } from '@prisma/client';

import { AttendanceRepository } from './attendance.repository';

/**
 * The bulk work-calendar resolution behind the dashboard's absent count.
 *
 * BUG-2008 - "who was expected to work today" had no answer at all: the
 * dashboard counted every employee without an attendance row as absent, so an
 * entire workforce was reported absent on every weekend and holiday. These
 * tests pin the precedence the single-employee resolver already used, because
 * the bulk version resolves in memory and could silently drift from it.
 */

type Row = Record<string, unknown>;

function buildDb(data: {
  employees: Row[];
  assignments?: Row[];
  schedules?: Row[];
  calendars?: Row[];
  holidays?: Row[];
}) {
  return {
    employee: { findMany: jest.fn().mockResolvedValue(data.employees) },
    employeeScheduleAssignment: {
      findMany: jest.fn().mockResolvedValue(data.assignments ?? []),
    },
    workSchedule: {
      findMany: jest.fn().mockResolvedValue(data.schedules ?? []),
    },
    holidayCalendar: {
      findMany: jest.fn().mockResolvedValue(data.calendars ?? []),
    },
    holiday: { findMany: jest.fn().mockResolvedValue(data.holidays ?? []) },
  };
}

function employee(id: string, overrides: Row = {}): Row {
  return {
    id,
    organizationId: 'organization-1',
    businessUnitId: null,
    departmentId: null,
    teamId: null,
    locationId: null,
    defaultWorkScheduleId: null,
    holidayCalendarId: null,
    team: null,
    department: null,
    ...overrides,
  };
}

function schedule(id: string, overrides: Row = {}): Row {
  return {
    id,
    isDefault: false,
    businessUnitId: null,
    organizationId: null,
    holidayCalendarId: null,
    weeklyWorkDays: [
      WorkWeekday.SUNDAY,
      WorkWeekday.MONDAY,
      WorkWeekday.TUESDAY,
      WorkWeekday.WEDNESDAY,
      WorkWeekday.THURSDAY,
    ],
    days: [],
    ...overrides,
  };
}

/* 2026-08-29 is a Saturday, the day BUG-2008 was observed on. */
const SATURDAY = new Date(Date.UTC(2026, 7, 29));

async function resolve(
  db: ReturnType<typeof buildDb>,
  dayOfWeek: WorkWeekday = WorkWeekday.SATURDAY,
) {
  const repository = new AttendanceRepository(db as never);

  return repository.resolveWorkDayForEmployees(
    'tenant-1',
    {},
    SATURDAY,
    dayOfWeek,
    db as never,
  );
}

describe('AttendanceRepository.resolveWorkDayForEmployees', () => {
  it('marks the day off when the schedule day says it is not worked', async () => {
    const db = buildDb({
      employees: [employee('e1', { defaultWorkScheduleId: 'schedule-1' })],
      schedules: [
        schedule('schedule-1', { days: [{ isWorkingDay: false }] }),
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')).toEqual({
      employeeId: 'e1',
      hasWorkSchedule: true,
      isOffDay: true,
      holiday: null,
    });
  });

  it('falls back to the weekly pattern when the schedule has no row for the day', async () => {
    const db = buildDb({
      employees: [employee('e1', { defaultWorkScheduleId: 'schedule-1' })],
      schedules: [schedule('schedule-1')],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.isOffDay).toBe(true);
  });

  it('treats a scheduled working day as a working day', async () => {
    const db = buildDb({
      employees: [employee('e1', { defaultWorkScheduleId: 'schedule-1' })],
      schedules: [schedule('schedule-1', { days: [{ isWorkingDay: true }] })],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.isOffDay).toBe(false);
  });

  it('does not excuse an employee who has no work schedule at all', async () => {
    const db = buildDb({ employees: [employee('e1')] });

    const result = await resolve(db);

    expect(result.get('e1')).toEqual({
      employeeId: 'e1',
      hasWorkSchedule: false,
      isOffDay: false,
      holiday: null,
    });
  });

  it('prefers an effective-dated assignment over the employee default', async () => {
    const db = buildDb({
      employees: [employee('e1', { defaultWorkScheduleId: 'employee-default' })],
      assignments: [{ employeeId: 'e1', workScheduleId: 'assigned' }],
      schedules: [
        schedule('assigned', { days: [{ isWorkingDay: true }] }),
        schedule('employee-default', { days: [{ isWorkingDay: false }] }),
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.isOffDay).toBe(false);
  });

  it('takes the first assignment row, which the query orders most recent first', async () => {
    const db = buildDb({
      employees: [employee('e1')],
      assignments: [
        { employeeId: 'e1', workScheduleId: 'newest' },
        { employeeId: 'e1', workScheduleId: 'older' },
      ],
      schedules: [
        schedule('newest', { days: [{ isWorkingDay: true }] }),
        schedule('older', { days: [{ isWorkingDay: false }] }),
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.isOffDay).toBe(false);
  });

  it('prefers the employee default over the team schedule', async () => {
    const db = buildDb({
      employees: [
        employee('e1', {
          defaultWorkScheduleId: 'employee-default',
          team: { defaultWorkScheduleId: 'team', holidayCalendarId: null },
        }),
      ],
      schedules: [
        schedule('employee-default', { days: [{ isWorkingDay: true }] }),
        schedule('team', { days: [{ isWorkingDay: false }] }),
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.isOffDay).toBe(false);
  });

  it('prefers the team schedule over the department schedule', async () => {
    const db = buildDb({
      employees: [
        employee('e1', {
          team: { defaultWorkScheduleId: 'team', holidayCalendarId: null },
          department: {
            defaultWorkScheduleId: 'department',
            holidayCalendarId: null,
          },
        }),
      ],
      schedules: [
        schedule('team', { days: [{ isWorkingDay: true }] }),
        schedule('department', { days: [{ isWorkingDay: false }] }),
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.isOffDay).toBe(false);
  });

  it('falls back to a business-unit scoped schedule before an organization one', async () => {
    const db = buildDb({
      employees: [employee('e1', { businessUnitId: 'bu-1' })],
      schedules: [
        schedule('bu', {
          businessUnitId: 'bu-1',
          days: [{ isWorkingDay: true }],
        }),
        schedule('org', {
          organizationId: 'organization-1',
          days: [{ isWorkingDay: false }],
        }),
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.isOffDay).toBe(false);
  });

  it('falls back to the tenant default schedule last', async () => {
    const db = buildDb({
      employees: [employee('e1')],
      schedules: [
        schedule('tenant-default', {
          isDefault: true,
          days: [{ isWorkingDay: false }],
        }),
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.isOffDay).toBe(true);
  });

  it('reports a tenant-scoped holiday on the resolved calendar', async () => {
    const db = buildDb({
      employees: [
        employee('e1', {
          defaultWorkScheduleId: 'schedule-1',
          holidayCalendarId: 'calendar-1',
        }),
      ],
      schedules: [schedule('schedule-1', { days: [{ isWorkingDay: true }] })],
      calendars: [
        {
          id: 'calendar-1',
          isDefault: false,
          businessUnitId: null,
          organizationId: null,
        },
      ],
      holidays: [
        {
          id: 'holiday-1',
          name: 'National Day',
          scopeType: 'TENANT',
          departmentId: null,
          locationId: null,
          holidayCalendarId: 'calendar-1',
        },
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.holiday).toEqual({
      id: 'holiday-1',
      name: 'National Day',
    });
  });

  it('ignores a department-scoped holiday for an employee in another department', async () => {
    const db = buildDb({
      employees: [
        employee('e1', {
          departmentId: 'department-2',
          defaultWorkScheduleId: 'schedule-1',
          holidayCalendarId: 'calendar-1',
        }),
      ],
      schedules: [schedule('schedule-1', { days: [{ isWorkingDay: true }] })],
      calendars: [
        {
          id: 'calendar-1',
          isDefault: false,
          businessUnitId: null,
          organizationId: null,
        },
      ],
      holidays: [
        {
          id: 'holiday-1',
          name: 'Department offsite',
          scopeType: 'DEPARTMENT',
          departmentId: 'department-1',
          locationId: null,
          holidayCalendarId: 'calendar-1',
        },
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.holiday).toBeNull();
  });

  it('applies a work-site scoped holiday to an employee at that site', async () => {
    const db = buildDb({
      employees: [
        employee('e1', {
          locationId: 'site-1',
          defaultWorkScheduleId: 'schedule-1',
          holidayCalendarId: 'calendar-1',
        }),
      ],
      schedules: [schedule('schedule-1', { days: [{ isWorkingDay: true }] })],
      calendars: [
        {
          id: 'calendar-1',
          isDefault: false,
          businessUnitId: null,
          organizationId: null,
        },
      ],
      holidays: [
        {
          id: 'holiday-1',
          name: 'Site shutdown',
          scopeType: 'WORK_SITE',
          departmentId: null,
          locationId: 'site-1',
          holidayCalendarId: 'calendar-1',
        },
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.holiday?.id).toBe('holiday-1');
  });

  it('ignores a holiday on a calendar this employee does not resolve to', async () => {
    const db = buildDb({
      employees: [
        employee('e1', {
          defaultWorkScheduleId: 'schedule-1',
          holidayCalendarId: 'calendar-1',
        }),
      ],
      schedules: [schedule('schedule-1', { days: [{ isWorkingDay: true }] })],
      calendars: [
        {
          id: 'calendar-1',
          isDefault: false,
          businessUnitId: null,
          organizationId: null,
        },
      ],
      holidays: [
        {
          id: 'holiday-1',
          name: 'Someone else calendar',
          scopeType: 'TENANT',
          departmentId: null,
          locationId: null,
          holidayCalendarId: 'calendar-2',
        },
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.holiday).toBeNull();
  });

  it('falls back to the owning schedule calendar before the tenant default', async () => {
    const db = buildDb({
      employees: [employee('e1', { defaultWorkScheduleId: 'schedule-1' })],
      schedules: [
        schedule('schedule-1', {
          holidayCalendarId: 'schedule-calendar',
          days: [{ isWorkingDay: true }],
        }),
      ],
      calendars: [
        {
          id: 'schedule-calendar',
          isDefault: false,
          businessUnitId: null,
          organizationId: null,
        },
        {
          id: 'tenant-calendar',
          isDefault: true,
          businessUnitId: null,
          organizationId: null,
        },
      ],
      holidays: [
        {
          id: 'holiday-1',
          name: 'Founders Day',
          scopeType: 'TENANT',
          departmentId: null,
          locationId: null,
          holidayCalendarId: 'schedule-calendar',
        },
      ],
    });

    const result = await resolve(db);

    expect(result.get('e1')?.holiday?.id).toBe('holiday-1');
  });

  it('resolves a mixed population in one pass without extra queries', async () => {
    const db = buildDb({
      employees: [
        employee('working', { defaultWorkScheduleId: 'weekday' }),
        employee('off', { defaultWorkScheduleId: 'weekend-off' }),
      ],
      schedules: [
        schedule('weekday', { days: [{ isWorkingDay: true }] }),
        schedule('weekend-off', { days: [{ isWorkingDay: false }] }),
      ],
    });

    const result = await resolve(db);

    expect(result.get('working')?.isOffDay).toBe(false);
    expect(result.get('off')?.isOffDay).toBe(true);
    expect(db.employee.findMany).toHaveBeenCalledTimes(1);
    expect(db.workSchedule.findMany).toHaveBeenCalledTimes(1);
    expect(db.holidayCalendar.findMany).toHaveBeenCalledTimes(1);
    expect(db.employeeScheduleAssignment.findMany).toHaveBeenCalledTimes(1);
  });

  it('scopes every query to the tenant and skips deleted employees', async () => {
    const db = buildDb({ employees: [] });

    await resolve(db);

    expect(db.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          isDeleted: false,
        }),
      }),
    );
  });

  it('asks for no holidays when nobody resolves to a calendar', async () => {
    const db = buildDb({
      employees: [employee('e1', { defaultWorkScheduleId: 'schedule-1' })],
      schedules: [schedule('schedule-1', { days: [{ isWorkingDay: true }] })],
    });

    await resolve(db);

    expect(db.holiday.findMany).not.toHaveBeenCalled();
  });
});
