import { AppError } from '../errors/app-error';
import {
  formatSequenceNumber,
  validateNumberSequenceChange,
} from './number-sequence-format';
import { PlatformNumberingService } from './platform-numbering.service';

/*
 * ADR-0027 — the pure rules (format, bounds, raise-only) and the service's
 * use of them. That allocation is atomic and duplicate-free under concurrency
 * is a database property and is proven against PostgreSQL in
 * test/platform-numbering.e2e-spec.ts; a Prisma double cannot prove it.
 */

const PARTNER = { prefix: 'PART-', separator: '', suffix: '', padding: 6 };

describe('formatSequenceNumber', () => {
  it('is prefix + separator + zero-padded value + suffix', () => {
    expect(formatSequenceNumber(PARTNER, 1)).toBe('PART-000001');
    expect(
      formatSequenceNumber(
        { prefix: 'PART', separator: '/', suffix: '-Q', padding: 4 },
        12,
      ),
    ).toBe('PART/0012-Q');
  });

  it('treats padding as a minimum and never truncates a longer value', () => {
    expect(formatSequenceNumber(PARTNER, 1234567)).toBe('PART-1234567');
    expect(
      formatSequenceNumber(
        { prefix: '', separator: '', suffix: '', padding: 2 },
        1234,
      ),
    ).toBe('1234');
  });

  it('refuses a value that is not a non-negative integer', () => {
    expect(() => formatSequenceNumber(PARTNER, -1)).toThrow(RangeError);
    expect(() => formatSequenceNumber(PARTNER, 1.5)).toThrow(RangeError);
  });
});

describe('validateNumberSequenceChange', () => {
  it('accepts the bounded charset up to 12 characters, and empty parts', () => {
    expect(
      validateNumberSequenceChange(
        { prefix: 'PART-2026/A.', separator: '_', suffix: '', padding: 12 },
        5,
      ),
    ).toEqual({});
  });

  it.each(['part', 'PART ', 'PÄRT', 'PART#', 'ABCDEFGHIJKLM'])(
    'rejects prefix %p',
    (prefix) => {
      expect(validateNumberSequenceChange({ prefix }, 1)).toHaveProperty(
        'prefix',
      );
    },
  );

  it.each([0, 13, 2.5])('rejects padding %p', (padding) => {
    expect(validateNumberSequenceChange({ padding }, 1)).toHaveProperty(
      'padding',
    );
  });

  it('lets the next number stay or rise, never fall', () => {
    expect(validateNumberSequenceChange({ nextValue: 10 }, 10)).toEqual({});
    expect(validateNumberSequenceChange({ nextValue: 500 }, 10)).toEqual({});
    expect(validateNumberSequenceChange({ nextValue: 9 }, 10)).toEqual({
      nextValue: 'Next number can only increase (currently 10).',
    });
  });

  it('bounds the next number to the INTEGER column', () => {
    expect(
      validateNumberSequenceChange({ nextValue: 2_147_483_648 }, 1),
    ).toHaveProperty('nextValue');
    expect(validateNumberSequenceChange({ nextValue: 0 }, 1)).toHaveProperty(
      'nextValue',
    );
  });
});

function sequenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'seq-1',
    key: 'partner',
    label: 'Partner number',
    ...PARTNER,
    nextValue: 10,
    resetPolicy: 'NEVER',
    createdAt: new Date('2026-10-07T00:00:00Z'),
    updatedAt: new Date('2026-10-07T00:00:00Z'),
    updatedById: null,
    ...overrides,
  };
}

const admin = {
  userId: 'admin-1',
  tenantId: 'platform',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
  platform: { id: 'admin-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
} as never;

const settingsOnly = {
  userId: 'auditor-1',
  tenantId: 'platform',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
  platform: { id: 'auditor-1', role: 'READ_ONLY_AUDITOR', status: 'ACTIVE' },
} as never;

function harness(row = sequenceRow()) {
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
    sequenceRow({ ...row, ...data }),
  );
  const tx = {
    $queryRaw: jest.fn(async () => [{ id: row.id }]),
    platformNumberSequence: {
      findUnique: jest.fn(async () => row),
      update,
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
  };
  const auditLog = jest.fn();
  const service = new PlatformNumberingService(
    prisma as never,
    { log: auditLog } as never,
  );
  return { service, update, auditLog, tx, prisma };
}

describe('PlatformNumberingService', () => {
  it('formats the value the UPDATE … RETURNING handed back, on the caller transaction', async () => {
    const { service, prisma } = harness();
    const tx = {
      $queryRaw: jest.fn(async () => [{ ...PARTNER, value: 41 }]),
    };

    await expect(service.next('partner', tx as never)).resolves.toBe(
      'PART-000041',
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // Allocation must not escape the caller's transaction onto the root client.
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('throws a catalog error when the sequence row is missing', async () => {
    const { service } = harness();
    const tx = { $queryRaw: jest.fn(async () => []) };

    await expect(service.next('partner', tx as never)).rejects.toMatchObject({
      errorCode: 'NUMBER_SEQUENCE_NOT_CONFIGURED',
    });
  });

  it('raises the next number, audits before and after, and returns a preview', async () => {
    const { service, update, auditLog } = harness();

    const view = await service.update(admin, 'partner', {
      prefix: 'PTN',
      separator: '-',
      padding: 4,
      nextValue: 100,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'partner' },
        data: expect.objectContaining({
          prefix: 'PTN',
          separator: '-',
          padding: 4,
          nextValue: 100,
          updatedById: 'admin-1',
        }) as unknown,
      }),
    );
    expect(view.preview).toBe('PTN-0100');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'PLATFORM_NUMBER_SEQUENCE_UPDATED',
        entityType: 'PlatformNumberSequence',
        beforeSnapshot: expect.objectContaining({
          nextValue: 10,
          preview: 'PART-000010',
        }) as unknown,
        afterSnapshot: expect.objectContaining({
          nextValue: 100,
          preview: 'PTN-0100',
        }) as unknown,
      }),
      expect.anything(),
    );
  });

  it('refuses to lower the next number and writes nothing', async () => {
    const { service, update, auditLog } = harness();

    const failure = await service
      .update(admin, 'partner', { nextValue: 9 })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      errorCode: 'NUMBER_SEQUENCE_NEXT_VALUE_LOWERED',
      statusCode: 400,
    });
    expect(update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('refuses an out-of-charset prefix with a field error', async () => {
    const { service, update } = harness();

    await expect(
      service.update(admin, 'partner', { prefix: 'part ' }),
    ).rejects.toMatchObject({
      errorCode: 'NUMBER_SEQUENCE_INVALID',
      details: {
        fieldErrors: [expect.objectContaining({ field: 'prefix' })],
      },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('requires the administrator tier to change a sequence', async () => {
    const { service, update } = harness();

    await expect(
      service.update(settingsOnly, 'partner', { padding: 5 }),
    ).rejects.toMatchObject({ errorCode: 'PLATFORM_PERMISSION_DENIED' });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports an unknown key as not found', async () => {
    const { service, tx } = harness();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.update(admin, 'invoice', { padding: 5 }),
    ).rejects.toMatchObject({ errorCode: 'NUMBER_SEQUENCE_NOT_FOUND' });
    await expect(service.get('NOT A KEY')).rejects.toMatchObject({
      errorCode: 'NUMBER_SEQUENCE_NOT_FOUND',
    });
  });
});
