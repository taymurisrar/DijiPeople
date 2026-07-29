/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ClaimRequestStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollRunService } from './payroll-run.service';

describe('PayrollRunService claim inclusion', () => {
  it('includes only payroll-approved claims inside the payroll cutoff', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'claim-1',
        title: 'Travel reimbursement',
        lineItems: [
          {
            id: 'line-1',
            amount: new Prisma.Decimal(350),
            approvedAmount: new Prisma.Decimal(300),
            currencyCode: 'QAR',
            transactionDate: new Date('2026-04-02T00:00:00.000Z'),
            receiptDocumentId: null,
            claimType: { id: 'type-1', code: 'TRAVEL', name: 'Travel' },
            claimSubType: null,
          },
        ],
      },
    ]);
    const service = new PayrollRunService(
      { claimRequest: { findMany } } as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getPayrollSettings: jest.fn() } as never,
      { allocate: jest.fn() } as never,
      { lockRate: jest.fn(), convert: jest.fn() } as never,
    );
    const cutoffDate = new Date('2026-04-20T23:59:59.999Z');

    const result = await (
      service as unknown as {
        buildClaimPayrollInputs(input: {
          tenantId: string;
          employeeId: string;
          cutoffDate: Date;
        }): Promise<{
          snapshots: Array<{ amount: string }>;
          reimbursementTotal: Prisma.Decimal;
        }>;
      }
    ).buildClaimPayrollInputs({
      tenantId: 'tenant-1',
      employeeId: 'employee-1',
      cutoffDate,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ClaimRequestStatus.PAYROLL_APPROVED,
          payrollApprovedAt: { lte: cutoffDate },
        }),
        include: expect.objectContaining({
          lineItems: expect.objectContaining({
            where: {
              payrollRunEmployeeId: null,
              transactionDate: { lte: cutoffDate },
            },
          }),
        }),
      }),
    );
    expect(result.snapshots[0]?.amount).toBe('300');
    expect(result.reimbursementTotal.equals(300)).toBe(true);
  });
});
