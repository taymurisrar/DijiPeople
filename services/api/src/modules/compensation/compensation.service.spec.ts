import type { Prisma } from '@prisma/client';
import { retireOpenActiveCompensations } from './compensation.service';

describe('compensation effective-date replacement', () => {
  it('retires only an earlier open active compensation snapshot', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const nextEffectiveFrom = new Date('2026-07-01T00:00:00.000Z');

    await retireOpenActiveCompensations(
      {
        employeeCompensationHistory: { updateMany },
      } as unknown as Prisma.TransactionClient,
      'tenant-1',
      'employee-1',
      nextEffectiveFrom,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        employeeId: 'employee-1',
        status: 'ACTIVE',
        effectiveTo: null,
        effectiveFrom: { lt: nextEffectiveFrom },
      },
      data: {
        status: 'RETIRED',
        effectiveTo: new Date('2026-06-30T00:00:00.000Z'),
      },
    });
  });
});
