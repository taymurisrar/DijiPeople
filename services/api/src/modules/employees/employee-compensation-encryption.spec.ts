import { EmployeeProfilesService } from './employee-profiles.service';

/*
 * BUG-3154 / EXECPLAN-0036 requirements 3 and 4, for EmployeeCompensation's
 * tenant path (TASK-0036, which gives it a screen):
 * - every write also writes the encrypted copy;
 * - every read returns the decrypted value and never the ciphertext;
 * - an update that omits a secret keeps it (it used to wipe it), and an
 *   explicit null clears both copies.
 */

const user = {
  userId: 'u1',
  tenantId: 't1',
  email: 'hr@example.com',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
};

function build(stored: Record<string, unknown> | null = null) {
  const prisma = {
    employeeCompensation: {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(stored),
    },
  };
  const codec = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
    hmac: jest.fn(),
  };
  const service = new EmployeeProfilesService(
    prisma as never,
    {
      findByIdAndTenant: jest
        .fn()
        .mockResolvedValue({ id: 'e1', tenantId: 't1' }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      canViewEmployeeRecord: jest.fn().mockResolvedValue(true),
      getEmployeeRecordAccess: jest.fn().mockResolvedValue('SELF'),
    } as never,
    {} as never,
    codec as never,
  );
  return { service, prisma };
}

type UpsertArgs = {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

function upsertArgs(prisma: { employeeCompensation: { upsert: jest.Mock } }) {
  const calls = prisma.employeeCompensation.upsert.mock.calls as UpsertArgs[][];
  return calls[0][0];
}

const base = {
  basicSalary: '1000',
  payFrequency: 'MONTHLY',
  effectiveDate: '2026-01-01',
} as const;

describe('EmployeeCompensation encryption at rest', () => {
  it('dual-writes secrets on create', async () => {
    const { service, prisma } = build();
    await service.upsertCompensation(user as never, 'e1', {
      ...base,
      bankAccountNumber: ' 1234567890 ',
      taxIdentifier: 'TX-9',
    } as never);
    const { create } = upsertArgs(prisma);
    expect(create).toMatchObject({
      bankAccountNumber: '1234567890',
      bankAccountNumberEnc: 'enc:1234567890',
      taxIdentifierEnc: 'enc:TX-9',
    });
  });

  it('keeps an omitted secret on update and clears an explicit null', async () => {
    const { service, prisma } = build();
    await service.upsertCompensation(user as never, 'e1', {
      ...base,
      bankIban: 'PK36SCBL0000001123456702',
      bankAccountNumber: null,
    } as never);
    const { update } = upsertArgs(prisma);
    expect(update).toMatchObject({
      bankIban: 'PK36SCBL0000001123456702',
      bankIbanEnc: 'enc:PK36SCBL0000001123456702',
      bankAccountNumber: null,
      bankAccountNumberEnc: null,
    });
    /* Undefined is Prisma for leave-as-is: nothing is written for an omitted secret. */
    expect(update.taxIdentifier).toBeUndefined();
    expect(update.taxIdentifierEnc).toBeUndefined();
    expect(update.bankRoutingNumber).toBeUndefined();
  });

  it('reads the decrypted value and never returns ciphertext', async () => {
    const { service } = build({
      id: 'c1',
      basicSalary: { toString: () => '1000.00' },
      bankAccountNumber: 'stale-plaintext',
      bankAccountNumberEnc: 'enc:1234567890',
      bankIban: 'PK36-plain',
      bankIbanEnc: null,
      bankRoutingNumber: null,
      bankRoutingNumberEnc: null,
      taxIdentifier: null,
      taxIdentifierEnc: null,
    });
    const read = (await service.getCurrentCompensation(
      user as never,
      'e1',
    )) as Record<string, unknown>;
    expect(read.bankAccountNumber).toBe('1234567890');
    expect(read.bankIban).toBe('PK36-plain');
    expect(Object.keys(read).some((key) => key.endsWith('Enc'))).toBe(false);
  });
});
