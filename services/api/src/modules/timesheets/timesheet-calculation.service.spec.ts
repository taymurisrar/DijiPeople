import { Prisma } from '@prisma/client';
import { TimesheetCalculationService } from './timesheet-calculation.service';

describe('TimesheetCalculationService', () => {
  function setup(expectedHours: number, enteredHours: number) {
    const tx = {
      timesheetDay: { update: jest.fn().mockResolvedValue({}) },
      timesheetWeek: { update: jest.fn().mockResolvedValue({}) },
      timesheet: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      timesheet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'timesheet-1',
          employeeId: 'employee-1',
          periodStart: new Date('2026-07-01T00:00:00.000Z'),
          weeks: [
            {
              id: 'week-1',
              status: 'DRAFT',
              startDate: new Date('2026-07-01T00:00:00.000Z'),
              endDate: new Date('2026-07-07T00:00:00.000Z'),
              days: [
                {
                  id: 'day-1',
                  dayType: 'WORKING_DAY',
                  expectedHours: new Prisma.Decimal(expectedHours),
                  availableHours: new Prisma.Decimal(expectedHours),
                  attendanceHours: new Prisma.Decimal(0),
                  approvedLeaveHours: new Prisma.Decimal(0),
                  entries: enteredHours
                    ? [
                        {
                          hours: new Prisma.Decimal(enteredHours),
                          billableFlag: true,
                        },
                      ]
                    : [],
                },
              ],
            },
          ],
        }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      ),
    };
    const policyResolver = {
      resolveForEmployee: jest.fn().mockResolvedValue({
        values: { payrollUsage: 'NOT_USED' },
        effectiveAt: '2026-07-01T00:00:00.000Z',
        effectivePolicy: null,
        appliedPolicies: [],
      }),
    };
    return {
      service: new TimesheetCalculationService(
        prisma as never,
        policyResolver as never,
      ),
      tx,
    };
  }

  it('calculates completion from entered hours against schedule-required hours', async () => {
    const { service } = setup(8, 4);

    const result = await service.recalculate('tenant-1', 'timesheet-1');

    expect(result.totals.requiredHours).toBe(8);
    expect(result.totals.enteredHours).toBe(4);
    expect(result.completionPercentage).toBe(50);
  });

  it('never reports 100 percent when entered time has no required-hour basis', async () => {
    const { service, tx } = setup(0, 4);

    const result = await service.recalculate('tenant-1', 'timesheet-1');

    expect(result.completionPercentage).toBe(0);
    expect(tx.timesheetDay.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completionStatus: 'EXCEPTION' }),
      }),
    );
  });
});
