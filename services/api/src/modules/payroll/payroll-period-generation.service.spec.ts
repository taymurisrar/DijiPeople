import { ConflictException } from '@nestjs/common';
import { PayrollCalendarFrequency, PayrollCycleStatus } from '@prisma/client';
import { PayrollService } from './payroll.service';

describe('PayrollService period generation', () => {
  function setup(overlap: Record<string, unknown> | null = null) {
    const cycle = {
      id: 'cycle-1',
      tenantId: 'tenant-1',
      name: 'Monthly Payroll',
      businessUnitId: null,
      payrollCalendarId: 'calendar-1',
      payrollCalendar: {
        id: 'calendar-1',
        name: 'Monthly Calendar',
        frequency: PayrollCalendarFrequency.MONTHLY,
        isActive: true,
      },
      payrollRegion: null,
      payFrequency: PayrollCalendarFrequency.MONTHLY,
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T00:00:00.000Z'),
      status: PayrollCycleStatus.DRAFT,
      cutoffDay: 31,
      paymentDay: 5,
      adjustDatesForWeekend: true,
      adjustDatesForHoliday: false,
      dateAdjustmentDirection: 'NEXT_BUSINESS_DAY',
    };
    const payrollRepository = {
      findCycleById: jest.fn().mockResolvedValue(cycle),
    };
    let createdSequence = 0;
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      payrollPeriod: {
        findFirst: jest.fn().mockResolvedValue(overlap),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation(({ data }) => {
          createdSequence += 1;
          return Promise.resolve({ id: `period-${createdSequence}`, ...data });
        }),
      },
      fiscalYear: {
        findFirst: jest.fn().mockResolvedValue({ id: 'fy-2026' }),
      },
    };
    const prisma = {
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue({}) };
    const service = new PayrollService(
      payrollRepository as never,
      {} as never,
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
    );
    const user = { tenantId: 'tenant-1', userId: 'user-1' } as never;
    return { audit, cycle, prisma, service, tx, user };
  }

  it('creates calendar-aligned periods with fiscal year and adjusted dates', async () => {
    const { audit, service, tx, user } = setup();

    const result = await service.generatePeriods(user, 'cycle-1', {
      periodCount: 3,
    });

    expect(result.createdCount).toBe(3);
    expect(result.skippedCount).toBe(0);
    expect(tx.payrollPeriod.create).toHaveBeenCalledTimes(3);
    expect(tx.payrollPeriod.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          payrollCalendarId: 'calendar-1',
          payrollCycleId: 'cycle-1',
          fiscalYearId: 'fy-2026',
          periodStart: new Date('2026-01-01T00:00:00.000Z'),
          periodEnd: new Date('2026-01-31T00:00:00.000Z'),
          cutoffDate: new Date('2026-02-02T00:00:00.000Z'),
          paymentDate: new Date('2026-02-05T00:00:00.000Z'),
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYROLL_PERIODS_GENERATED' }),
    );
  });

  it('is idempotent and links an exact legacy period', async () => {
    const { service, tx, user } = setup({
      id: 'legacy-period',
      name: 'January 2026',
      payrollCycleId: null,
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-01-31T00:00:00.000Z'),
    });

    const result = await service.generatePeriods(user, 'cycle-1', {
      periodCount: 1,
    });

    expect(result).toEqual(
      expect.objectContaining({ createdCount: 0, skippedCount: 1 }),
    );
    expect(tx.payrollPeriod.update).toHaveBeenCalledWith({
      where: { id: 'legacy-period' },
      data: { payrollCycleId: 'cycle-1' },
    });
    expect(tx.payrollPeriod.create).not.toHaveBeenCalled();
  });

  it('rejects an overlapping period instead of corrupting the calendar', async () => {
    const { service, user } = setup({
      id: 'overlap-period',
      name: 'Overlapping period',
      payrollCycleId: null,
      periodStart: new Date('2026-01-15T00:00:00.000Z'),
      periodEnd: new Date('2026-01-31T00:00:00.000Z'),
    });

    await expect(
      service.generatePeriods(user, 'cycle-1', { periodCount: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
