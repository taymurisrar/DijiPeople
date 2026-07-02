import { ConflictException } from '@nestjs/common';
import { LoanRequestStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPayrollEmployeeEligibilityWhere,
  compensationRequiresDisbursement,
  PayrollRunService,
} from './payroll-run.service';

describe('payroll readiness eligibility', () => {
  it('does not require disbursement for a genuine zero-pay package', () => {
    expect(
      compensationRequiresDisbursement({
        id: 'compensation-1',
        baseAmount: new Prisma.Decimal(0),
        currencyCode: 'QAR',
        components: [],
      } as never),
    ).toBe(false);
  });

  it('scopes employees to hire and termination dates without including inactive status', () => {
    const periodStart = new Date('2026-06-01T00:00:00.000Z');
    const periodEnd = new Date('2026-06-30T00:00:00.000Z');
    const where = buildPayrollEmployeeEligibilityWhere({
      tenantId: 'tenant-1',
      periodStart,
      periodEnd,
      businessUnitId: 'bu-1',
    });
    const serialized = JSON.stringify(where);

    expect(where.hireDate).toEqual({ lte: periodEnd });
    expect(where.businessUnitId).toBe('bu-1');
    expect(serialized).toContain('ACTIVE');
    expect(serialized).toContain('PROBATION');
    expect(serialized).toContain('NOTICE');
    expect(serialized).toContain('TERMINATED');
    expect(serialized).not.toContain('INACTIVE');
  });
});

describe('PayrollRunService loan inclusion', () => {
  it('claims installments and updates balances in one transaction', async () => {
    const tx = createTx(1);
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = createService(prisma);

    await includeLoanInputs(service);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.loanInstallment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SCHEDULED',
          payrollRunEmployeeId: null,
        }),
      }),
    );
    expect(tx.loanRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outstandingBalance: new Prisma.Decimal(0),
          status: LoanRequestStatus.SETTLED,
        }),
      }),
    );
  });

  it('fails before changing the loan balance when another run consumed the installment', async () => {
    const tx = createTx(0);
    const service = createService({
      $transaction: jest.fn((callback) => callback(tx)),
    });

    await expect(includeLoanInputs(service)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.loanRequest.findFirst).not.toHaveBeenCalled();
    expect(tx.loanRequest.update).not.toHaveBeenCalled();
  });
});

function includeLoanInputs(service: PayrollRunService) {
  return (
    service as unknown as {
      includeLoanInputs(input: {
        tenantId: string;
        payrollRunEmployeeId: string;
        snapshots: Array<{
          installmentId: string;
          loanRequestId: string;
          requestNumber: string;
          installmentNumber: number;
          dueDate: string;
          amount: string;
          currencyCode: string;
        }>;
        actorUserId: string;
      }): Promise<void>;
    }
  ).includeLoanInputs({
    tenantId: 'tenant-1',
    payrollRunEmployeeId: 'run-employee-1',
    actorUserId: 'payroll-user-1',
    snapshots: [
      {
        installmentId: 'installment-1',
        loanRequestId: 'loan-1',
        requestNumber: 'LN-1',
        installmentNumber: 1,
        dueDate: '2026-06-01T00:00:00.000Z',
        amount: '100.00',
        currencyCode: 'QAR',
      },
    ],
  });
}

function createTx(claimedCount: number) {
  return {
    loanInstallment: {
      updateMany: jest.fn().mockResolvedValue({ count: claimedCount }),
    },
    loanRequest: {
      findFirst: jest.fn().mockResolvedValue({
        outstandingBalance: new Prisma.Decimal(100),
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function createService(prisma: object) {
  return new PayrollRunService(
    prisma as PrismaService,
    { log: jest.fn().mockResolvedValue({}) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}
