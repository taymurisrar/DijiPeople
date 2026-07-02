import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
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
      },
    };
    const service = createService(prisma);

    const result = await service.listBankAccounts(user, '', true);

    expect(result[0]?.accountNumber).toBe('******7890');
    expect(result[0]?.iban).toBe('*************************2345');
    expect(JSON.stringify(result)).not.toContain('1234567890');
  });

  it('rejects self-service access when no employee is linked', async () => {
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue(null) },
      employeeBankAccount: { findMany: jest.fn() },
    };
    const service = createService(prisma);

    await expect(service.listBankAccounts(user, '', true)).rejects.toThrow(
      'No employee profile is linked to this user.',
    );
    expect(prisma.employeeBankAccount.findMany).not.toHaveBeenCalled();
  });
});

function createService(prisma: object) {
  return new LoansService(
    prisma as PrismaService,
    { log: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
  );
}
