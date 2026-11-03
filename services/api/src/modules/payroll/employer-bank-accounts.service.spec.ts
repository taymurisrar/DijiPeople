import { EmployerBankAccountsService } from './employer-bank-accounts.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

const user = { tenantId: 'tenant-a', userId: 'user-a' } as AuthenticatedUser;

function build(existing: Record<string, unknown> | null) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const update = jest
    .fn()
    .mockResolvedValue({ ...existing, isDefaultPayrollAccount: true });
  const tx = { employerBankAccount: { updateMany, update } };
  const prisma = {
    employerBankAccount: { findFirst: jest.fn().mockResolvedValue(existing) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: jest.fn() };
  const encryption = {
    encrypt: jest.fn((v: string) => v),
    decrypt: jest.fn((v: string) => v),
    encryptNullable: jest.fn((v: string | null) => v),
    decryptNullable: jest.fn((v: string | null) => v),
  };
  const service = new EmployerBankAccountsService(
    prisma as never,
    audit as never,
    encryption as never,
  );
  return { service, prisma, updateMany };
}

describe('EmployerBankAccountsService.update', () => {
  it('flipping only the default flag scopes the un-default to the tenant and the ACCOUNT currency', async () => {
    const { service, updateMany } = build({
      id: 'acc-1',
      tenantId: 'tenant-a',
      currencyCode: 'qar',
      accountPurpose: 'PAYROLL',
      isActive: true,
      isDefaultPayrollAccount: false,
      bank: null,
    });
    await service
      .update(user, 'acc-1', { isDefaultPayrollAccount: true } as never)
      .catch(() => undefined);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const [args] = updateMany.mock.calls[0] as [{ where: unknown }];
    expect(args.where).toMatchObject({
      tenantId: 'tenant-a',
      currencyCode: 'QAR',
      accountPurpose: 'PAYROLL',
      id: { not: 'acc-1' },
    });
  });

  it("another tenant's account is not found, and nothing is written", async () => {
    const { service, prisma } = build(null);
    await expect(
      service.update(user, 'acc-x', { isDefaultPayrollAccount: true } as never),
    ).rejects.toThrow('Employer bank account was not found.');
    expect(prisma.employerBankAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a', id: 'acc-x' } }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
