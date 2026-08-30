import { DashboardService } from './dashboard.service';
import type { AttendanceService } from '../attendance/attendance.service';

function attendanceServiceDouble(
  expectation: {
    expectedEmployeeIds?: string[];
    nonWorkingEmployeeIds?: string[];
  } = {},
) {
  return {
    resolveAttendanceExpectation: jest
      .fn<
        ReturnType<AttendanceService['resolveAttendanceExpectation']>,
        Parameters<AttendanceService['resolveAttendanceExpectation']>
      >()
      .mockResolvedValue({
        expectedEmployeeIds: expectation.expectedEmployeeIds ?? [],
        nonWorkingEmployeeIds: expectation.nonWorkingEmployeeIds ?? [],
      }),
  };
}

describe('DashboardService manager scope', () => {
  it('recognizes direct reports even when they are outside the manager business-unit list', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'manager-employee-1' }),
        count,
      },
    };
    const service = new DashboardService(
      prisma as never,
      attendanceServiceDouble() as never,
    );
    const managerView = { key: 'manager', order: 30 };
    const employeeView = { key: 'employee', order: 40 };
    const internals = service as unknown as {
      buildManagerView: jest.Mock;
      buildEmployeeView: jest.Mock;
    };
    internals.buildManagerView = jest.fn().mockResolvedValue(managerView);
    internals.buildEmployeeView = jest.fn().mockResolvedValue(employeeView);

    const result = await service.getSummary({
      userId: 'manager-user-1',
      tenantId: 'tenant-1',
      email: 'manager@example.com',
      roleIds: ['employee-role'],
      roleKeys: ['employee'],
      permissionKeys: ['timesheets.read'],
      accessContext: {
        isSystemAdministrator: false,
        isSystemCustomizer: false,
        isTenantOwner: false,
        businessUnitId: 'business-unit-1',
        organizationId: 'organization-1',
        teamIds: [],
        accessibleBusinessUnitIds: ['business-unit-1'],
        businessUnitSubtreeIds: ['business-unit-1'],
        canAccessAllBusinessUnits: false,
      },
    });

    expect(count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        isDeleted: false,
        deletedAt: null,
        managerEmployeeId: 'manager-employee-1',
      },
    });
    expect(result.views).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'manager' })]),
    );
  });
});

/*
 * BUG-2008 - the absent count must be measured against the work calendar.
 *
 * The dashboard previously derived absence from "active headcount minus
 * employees with an attendance row", which reported the whole workforce absent
 * on every weekend and holiday and raised the same number as an attendance
 * exception needing review.
 */
describe('DashboardService attendance operations', () => {
  const currentUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'hr@example.com',
    roleIds: [],
    roleKeys: ['hr'],
    permissionKeys: ['attendance.read'],
    accessContext: {
      isSystemAdministrator: true,
      isSystemCustomizer: false,
      isTenantOwner: false,
      businessUnitId: null,
      organizationId: 'organization-1',
      teamIds: [],
      accessibleBusinessUnitIds: [],
      businessUnitSubtreeIds: [],
      canAccessAllBusinessUnits: true,
    },
  } as never;

  const today = {
    start: new Date(2026, 7, 29, 0, 0, 0, 0),
    end: new Date(2026, 7, 30, 0, 0, 0, 0),
  };

  function buildService(
    attendanceExpectation: {
      expectedEmployeeIds?: string[];
      nonWorkingEmployeeIds?: string[];
    },
    entryEmployeeIds: string[] = [],
  ) {
    const attendanceService = attendanceServiceDouble(attendanceExpectation);
    const prisma = {
      employee: { count: jest.fn().mockResolvedValue(11) },
      attendanceEntry: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            entryEmployeeIds.map((employeeId) => ({ employeeId })),
          ),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new DashboardService(
      prisma as never,
      attendanceService as never,
    );

    return {
      attendanceService,
      prisma,
      run: () =>
        (
          service as unknown as {
            getAttendanceOperations: (
              user: unknown,
              range: { start: Date; end: Date },
            ) => Promise<{
              absent: number;
              nonWorking: number;
              exceptions: { key: string; value: number; status: string }[];
            }>;
          }
        ).getAttendanceOperations(currentUser, today),
    };
  }

  it('counts nobody absent when the work calendar excuses the whole workforce', async () => {
    const { run } = buildService({
      expectedEmployeeIds: [],
      nonWorkingEmployeeIds: [
        'e1',
        'e2',
        'e3',
        'e4',
        'e5',
        'e6',
        'e7',
        'e8',
        'e9',
        'e10',
        'e11',
      ],
    });

    const result = await run();

    expect(result.absent).toBe(0);
    expect(result.nonWorking).toBe(11);
  });

  it('raises no attendance exception for absence on a non-working day', async () => {
    const { run } = buildService({
      expectedEmployeeIds: [],
      nonWorkingEmployeeIds: ['e1', 'e2', 'e3'],
    });

    const result = await run();
    const absentRow = result.exceptions.find((row) => row.key === 'absent');

    expect(absentRow?.value).toBe(0);
    expect(absentRow?.status).toBe('good');
  });

  it('still counts a genuine absence on a working day', async () => {
    const { run } = buildService(
      {
        expectedEmployeeIds: ['e1', 'e2', 'e3'],
        nonWorkingEmployeeIds: [],
      },
      ['e1'],
    );

    const result = await run();
    const absentRow = result.exceptions.find((row) => row.key === 'absent');

    expect(result.absent).toBe(2);
    expect(result.nonWorking).toBe(0);
    expect(absentRow?.value).toBe(2);
    expect(absentRow?.status).toBe('warning');
  });

  it('does not count an excused employee as absent alongside working colleagues', async () => {
    const { run } = buildService(
      {
        expectedEmployeeIds: ['e1', 'e2'],
        nonWorkingEmployeeIds: ['e3'],
      },
      ['e1'],
    );

    const result = await run();

    expect(result.absent).toBe(1);
    expect(result.nonWorking).toBe(1);
  });

  it('asks the attendance module about the UTC-midnight date the tile is reporting on', async () => {
    const { attendanceService, run } = buildService({
      expectedEmployeeIds: ['e1'],
    });

    await run();

    const [tenantId, attendanceDate] =
      attendanceService.resolveAttendanceExpectation.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(attendanceDate.toISOString()).toBe('2026-08-29T00:00:00.000Z');
  });

  it('scopes the expectation to the same employees the tile counts', async () => {
    const { attendanceService, run } = buildService({});

    await run();

    const employeeWhere =
      attendanceService.resolveAttendanceExpectation.mock.calls[0][2];
    expect(employeeWhere).toEqual(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });
});
