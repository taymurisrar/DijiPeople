import {
  Prisma,
  TimesheetLockStatus,
  TimesheetStatus,
  TimesheetWeekStatus,
  WorkWeekday,
} from '@prisma/client';
import { TimesheetWorkflowService } from './timesheet-workflow.service';

describe('TimesheetWorkflowService entry validation', () => {
  const service = new TimesheetWorkflowService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const day = {
    date: new Date('2026-07-13T00:00:00.000Z'),
    availableHours: new Prisma.Decimal(8),
    attendanceHours: new Prisma.Decimal(8),
  };
  const settings = {
    minimumEntryMinutes: 15,
    entryMinuteIncrement: 15,
    maximumHoursPerDay: 12,
    preventOverlappingEntries: true,
  };

  it('reports the exact manager-account configuration blocking approval', () => {
    expect(() =>
      (
        service as unknown as {
          assertApprovalRouteResolved: (
            route: unknown[],
            employee: unknown,
            action: 'submission',
          ) => void;
        }
      ).assertApprovalRouteResolved(
        [],
        {
          firstName: 'Hasan',
          lastName: 'Khan',
          manager: {
            firstName: 'Pooja',
            lastName: 'Vennamaneni',
            userId: null,
            user: null,
          },
        },
        'submission',
      ),
    ).toThrow(
      'Timesheet submission cannot continue because reporting manager Pooja Vennamaneni has no linked active user account.',
    );
  });

  it('accepts multiple non-overlapping project entries on one day', () => {
    expect(() =>
      (
        service as never as {
          validateDayEntries: (
            day: unknown,
            entries: unknown[],
            settings: Record<string, unknown>,
          ) => void;
        }
      ).validateDayEntries(
        day,
        [
          {
            hours: '4',
            billable: true,
            projectId: 'project-1',
            startTime: '2026-07-13T08:00:00.000Z',
            endTime: '2026-07-13T12:00:00.000Z',
          },
          {
            hours: '4',
            billable: false,
            projectId: 'project-2',
            startTime: '2026-07-13T13:00:00.000Z',
            endTime: '2026-07-13T17:00:00.000Z',
          },
        ],
        settings,
      ),
    ).not.toThrow();
  });

  it('rejects overlapping entries and excessive daily totals', () => {
    expect(() =>
      (
        service as never as {
          validateDayEntries: (
            day: unknown,
            entries: unknown[],
            settings: Record<string, unknown>,
          ) => void;
        }
      ).validateDayEntries(
        day,
        [
          {
            hours: '7',
            billable: true,
            startTime: '2026-07-13T08:00:00.000Z',
            endTime: '2026-07-13T15:00:00.000Z',
          },
          {
            hours: '6',
            billable: false,
            startTime: '2026-07-13T14:00:00.000Z',
            endTime: '2026-07-13T20:00:00.000Z',
          },
        ],
        settings,
      ),
    ).toThrow();
  });

  it('derives payroll-ready monthly status only when every required week is approved', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      timesheetWeek: {
        findMany: jest.fn().mockResolvedValue([
          {
            status: TimesheetWeekStatus.APPROVED,
            requiredHours: new Prisma.Decimal(40),
          },
          {
            status: TimesheetWeekStatus.PAYROLL_READY,
            requiredHours: new Prisma.Decimal(40),
          },
        ]),
      },
      timesheet: { update },
    };

    await (
      service as unknown as {
        reconcileMonthlyStatus: (
          tx: unknown,
          user: { tenantId: string; userId: string },
          timesheetId: string,
        ) => Promise<void>;
      }
    ).reconcileMonthlyStatus(
      tx,
      { tenantId: 'tenant-1', userId: 'user-1' },
      'timesheet-1',
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TimesheetStatus.PAYROLL_READY,
        }),
      }),
    );
  });

  it('derives partially-approved status for mixed approval progress', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      timesheetWeek: {
        findMany: jest.fn().mockResolvedValue([
          {
            status: TimesheetWeekStatus.APPROVED,
            requiredHours: new Prisma.Decimal(40),
          },
          {
            status: TimesheetWeekStatus.PENDING_APPROVAL,
            requiredHours: new Prisma.Decimal(40),
          },
        ]),
      },
      timesheet: { update },
    };

    await (
      service as unknown as {
        reconcileMonthlyStatus: (
          tx: unknown,
          user: { tenantId: string; userId: string },
          timesheetId: string,
        ) => Promise<void>;
      }
    ).reconcileMonthlyStatus(
      tx,
      { tenantId: 'tenant-1', userId: 'user-1' },
      'timesheet-1',
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TimesheetStatus.PARTIALLY_APPROVED,
        }),
      }),
    );
  });

  it('copies project entries by weekday and derives billable from the active assignment', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      timesheetWeek: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      timesheetEntry: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany,
      },
      timesheetDay: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      timesheet: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      timesheetWeek: {
        findFirst: jest.fn().mockResolvedValue({
          days: [
            {
              dayOfWeek: WorkWeekday.MONDAY,
              entries: [
                {
                  projectId: 'project-1',
                  hours: new Prisma.Decimal(8),
                  note: 'Previous note',
                  description: 'Previous note',
                  workLocationId: 'location-1',
                  billableFlag: true,
                },
              ],
            },
          ],
        }),
      },
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'assignment-1',
            projectId: 'project-1',
            billableFlag: false,
            startDate: new Date('2026-08-01T00:00:00.000Z'),
            endDate: null,
            project: { allowTimesheets: true, status: 'ACTIVE' },
          },
        ]),
      },
      $transaction: jest.fn(async (callback: (client: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const policyResolver = {
      resolveForEmployee: jest
        .fn()
        .mockResolvedValue({ values: { allowCopyPreviousWeek: true } }),
    };
    const calculationService = {
      recalculate: jest.fn().mockResolvedValue({ completionPercentage: 20 }),
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const copyService = new TimesheetWorkflowService(
      prisma as never,
      policyResolver as never,
      calculationService as never,
      {} as never,
      {} as never,
      auditService as never,
      {} as never,
    );
    (copyService as never as { findWeek: jest.Mock }).findWeek = jest
      .fn()
      .mockResolvedValue({
        id: 'week-2',
        weekNumber: 2,
        version: 3,
        status: TimesheetWeekStatus.DRAFT,
        lockStatus: TimesheetLockStatus.UNLOCKED,
        startDate: new Date('2026-07-06T00:00:00.000Z'),
        days: [
          {
            id: 'target-monday',
            date: new Date('2026-07-06T00:00:00.000Z'),
            dayOfWeek: WorkWeekday.MONDAY,
            isLocked: false,
            isWeekend: false,
            isHoliday: false,
            entries: [],
          },
        ],
        timesheet: {
          employeeId: 'employee-1',
          businessUnitId: null,
          employee: { userId: 'user-1' },
        },
      });

    const result = await copyService.copyPreviousWeek(
      {
        userId: 'user-1',
        tenantId: 'tenant-1',
        email: 'employee@example.com',
        roleIds: [],
        roleKeys: ['employee'],
        permissionKeys: ['timesheets.write'],
      },
      'timesheet-1',
      'week-2',
      { weekVersion: 3 },
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          timesheetDayId: 'target-monday',
          projectId: 'project-1',
          projectAssignmentId: 'assignment-1',
          billableFlag: false,
          note: 'Previous note',
        }),
      ],
    });
    expect(result.warnings).toEqual([
      "1 copied entry falls outside the employee's project assignment period.",
    ]);
  });

  it('grants an audited late-submission override when settings and permission allow it', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: unknown) => Promise<unknown>) =>
          callback({ timesheetWeek: { updateMany } }),
      ),
    };
    const policyResolver = {
      resolveForEmployee: jest.fn().mockResolvedValue({
        values: { allowPayrollLateSubmissionOverride: true },
        effectivePolicy: null,
      }),
    };
    const calculationService = {
      recalculate: jest.fn().mockResolvedValue({ payrollStatus: 'BLOCKED' }),
    };
    const overrideService = new TimesheetWorkflowService(
      prisma as never,
      policyResolver as never,
      calculationService as never,
      {} as never,
      {} as never,
      auditService as never,
      {} as never,
    );
    (overrideService as never as { findWeek: jest.Mock }).findWeek = jest
      .fn()
      .mockResolvedValue({
        id: 'week-1',
        version: 4,
        status: TimesheetWeekStatus.READY_TO_SUBMIT,
        submissionDeadline: new Date('2026-07-01T12:00:00.000Z'),
        startDate: new Date('2026-06-23T00:00:00.000Z'),
        timesheet: {
          employeeId: 'employee-1',
          businessUnitId: 'business-unit-1',
        },
      });

    await overrideService.grantLateSubmissionOverride(
      {
        userId: 'payroll-user-1',
        tenantId: 'tenant-1',
        email: 'payroll@example.com',
        roleIds: [],
        roleKeys: ['payroll_manager'],
        permissionKeys: ['timesheets.override'],
      },
      'timesheet-1',
      'week-1',
      { weekVersion: 4, reason: 'Approved payroll exception' },
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lateSubmissionOverrideById: 'payroll-user-1',
          lateSubmissionOverrideReason: 'Approved payroll exception',
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TIMESHEET_LATE_SUBMISSION_OVERRIDE_GRANTED',
      }),
      expect.anything(),
    );
  });
});
