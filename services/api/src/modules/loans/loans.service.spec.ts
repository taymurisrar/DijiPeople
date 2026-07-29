import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { Prisma } from '@prisma/client';
import { LoansService } from './loans.service';

const user: AuthenticatedUser = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  email: 'employee@example.com',
  roleIds: [],
  roleKeys: ['employee'],
  permissionKeys: ['employee-bank-accounts.read-own'],
};

describe('LoansService bank account security', () => {
  it('masks account identifiers in API responses', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }),
      },
      employeeBankAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-1',
            employeeId: 'employee-1',
            accountNumber: '1234567890',
            iban: 'QA001234567890123456789012345',
            bank: { id: 'bank-1', name: 'Bank' },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest
        .fn()
        .mockImplementation((queries) => Promise.all(queries)),
    };
    const service = createService(prisma);

    const result = await service.listBankAccounts(user, '', {}, true);

    expect(result.items[0]?.accountNumber).toBe('******7890');
    expect(result.items[0]?.iban).toBe('*************************2345');
    expect(JSON.stringify(result)).not.toContain('1234567890');
  });

  it('rejects self-service access when no employee is linked', async () => {
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue(null) },
      employeeBankAccount: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = createService(prisma);

    await expect(service.listBankAccounts(user, '', {}, true)).rejects.toThrow(
      'No employee profile is linked to this user.',
    );
    expect(prisma.employeeBankAccount.findMany).not.toHaveBeenCalled();
  });
});

describe('LoansService approval routing', () => {
  it('passes the requested currency to approval-matrix resolution', async () => {
    const prisma = {
      loanRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'loan-1',
          tenantId: 'tenant-1',
          employeeId: 'employee-1',
          loanPolicyId: 'policy-1',
          requestNumber: 'LN-1',
          requestedAmount: new Prisma.Decimal(12000),
          approvedAmount: null,
          monthlyDeduction: null,
          outstandingBalance: new Prisma.Decimal(12000),
          currencyCode: 'PKR',
          installmentCount: 6,
          requestedStartDate: new Date('2026-07-01'),
          status: 'DRAFT',
          employee: {},
          loanPolicy: null,
          installments: [],
        }),
      },
      employee: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'employee-1',
          userId: null,
          managerEmployeeId: null,
          departmentId: null,
          businessUnitId: null,
          employeeLevelId: null,
          manager: null,
          businessUnit: null,
        }),
      },
    };
    const approvalResolver = {
      resolveApprovalRoute: jest.fn().mockRejectedValue(new Error('stop')),
    };
    const service = createService(prisma, { approvalResolver });

    await expect(service.submit(user, 'loan-1')).rejects.toThrow('stop');
    expect(approvalResolver.resolveApprovalRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionContext: expect.objectContaining({
          amount: '12000',
          loanPolicyId: 'policy-1',
          currencyCode: 'PKR',
        }),
      }),
    );
  });
});

function createService(
  prisma: object,
  overrides: { approvalResolver?: object } = {},
) {
  return new LoansService(
    prisma as PrismaService,
    { log: jest.fn() } as never,
    {} as never,
    (overrides.approvalResolver ?? {}) as never,
    {} as never,
  );
}
