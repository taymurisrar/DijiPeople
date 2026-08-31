import { AppError } from '../../../common/errors/app-error';
import {
  MAX_SCHEDULE_RECIPIENTS,
  ReportScheduleService,
  type ReportScheduleWriteInput,
  toStringArray,
} from './report-schedule.service';

/*
 * The CRUD is not the interesting part; the two authorization decisions are.
 *
 *   1. A recipient must be a user of THIS tenant, checked at write time. A
 *      free-text address on a recurring export is an exfiltration channel with
 *      a nice UI.
 *   2. `ownerUserId` is the caller and only the caller. The worker runs the
 *      report under that person's access, so letting a caller nominate someone
 *      else would turn schedule-create into permission borrowing.
 *
 * Everything below is a hand-rolled double. No addresses here are deliverable:
 * tenant email is live in production.
 */

const CALLER = {
  userId: 'user-caller',
  tenantId: 'tenant-1',
  email: 'caller@demo.dijipeople.com',
  roleIds: [],
  roleKeys: ['hr'],
  permissionKeys: ['reports.manage'],
} as never;

function validInput(
  overrides: Partial<ReportScheduleWriteInput> = {},
): ReportScheduleWriteInput {
  return {
    name: 'Monthly headcount',
    targetKey: 'std:headcount',
    frequency: 'MONTHLY' as never,
    hour: 6,
    minute: 30,
    dayOfMonth: 1,
    timezone: 'Asia/Qatar',
    format: 'XLSX' as never,
    periodPreset: 'previous_month',
    recipients: ['user-recipient'],
    ...overrides,
  };
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'schedule-1',
    tenantId: 'tenant-1',
    name: 'Monthly headcount',
    targetKey: 'std:headcount',
    reportDefinitionId: null,
    ownerUserId: 'user-owner',
    frequency: 'MONTHLY',
    hour: 6,
    minute: 30,
    dayOfWeek: null,
    dayOfMonth: 1,
    timezone: 'Asia/Qatar',
    format: 'XLSX',
    periodPreset: 'previous_month',
    filtersJson: null,
    recipientUserIds: ['user-recipient'],
    isEnabled: true,
    nextRunAt: new Date('2026-09-01T03:30:00.000Z'),
    lastRunAt: null,
    lastRunStatus: null,
    lastFailureReason: null,
    consecutiveFailureCount: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildService(
  options: {
    users?: Array<{ id: string; email: string }>;
    existing?: Record<string, unknown> | null;
    updateCount?: number;
    deleteCount?: number;
  } = {},
) {
  const userFindMany = jest
    .fn()
    .mockResolvedValue(
      options.users ?? [
        { id: 'user-recipient', email: 'recipient@demo.dijipeople.com' },
      ],
    );
  const create = jest
    .fn()
    .mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(storedRow(args.data)),
    );
  const findFirst = jest
    .fn()
    .mockResolvedValue(
      options.existing === undefined ? storedRow() : options.existing,
    );
  const findMany = jest.fn().mockResolvedValue([storedRow()]);
  const updateMany = jest
    .fn()
    .mockResolvedValue({ count: options.updateCount ?? 1 });
  const deleteMany = jest
    .fn()
    .mockResolvedValue({ count: options.deleteCount ?? 1 });

  const prisma = {
    user: { findMany: userFindMany },
    reportSchedule: { create, findFirst, findMany, updateMany, deleteMany },
  };

  return {
    service: new ReportScheduleService(prisma as never),
    prisma,
    userFindMany,
    create,
    findFirst,
    findMany,
    updateMany,
    deleteMany,
  };
}

/**
 * The first argument of a mock call, typed.
 *
 * `jest.fn()` is `jest.Mock<any, any>`, so reading `.mock.calls[n][0]` inline
 * turns every assertion into an unsafe member access. One funnel keeps the
 * assertions readable and the rest of the file honest about its types.
 */
type PrismaCall = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  cursor?: Record<string, unknown>;
  skip?: number;
};

function callArg(mock: jest.Mock, index = 0): PrismaCall {
  return (mock.mock.calls[index] as PrismaCall[])[0];
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.errorCode;
    throw error;
  }
  throw new Error('Expected the call to reject, but it resolved.');
}

describe('toStringArray', () => {
  it('ignores anything that is not a string array, because the column is Json', () => {
    expect(toStringArray(['a', 'b'])).toEqual(['a', 'b']);
    expect(toStringArray(['a', 7, null])).toEqual(['a']);
    expect(toStringArray(null)).toEqual([]);
    expect(toStringArray({ a: 1 })).toEqual([]);
    expect(toStringArray('a')).toEqual([]);
  });
});

describe('ReportScheduleService.create — ownership', () => {
  it('stores the caller as the owner', async () => {
    const harness = buildService();

    await harness.service.create(CALLER, validInput());

    expect(callArg(harness.create).data?.ownerUserId).toBe('user-caller');
  });

  it('ignores an ownerUserId smuggled into the input', async () => {
    const harness = buildService();

    await harness.service.create(CALLER, {
      ...validInput(),
      // Not part of the input type; this is what a hand-built payload or a
      // future DTO widening would look like on the wire.
      ownerUserId: 'somebody-more-privileged',
    } as never);

    expect(callArg(harness.create).data?.ownerUserId).toBe('user-caller');
  });

  it('takes the tenant from the caller, never from the input', async () => {
    const harness = buildService();

    await harness.service.create(CALLER, {
      ...validInput(),
      tenantId: 'tenant-somebody-else',
    } as never);

    expect(callArg(harness.create).data?.tenantId).toBe('tenant-1');
  });

  it('computes nextRunAt on write', async () => {
    const harness = buildService();

    await harness.service.create(CALLER, validInput());

    const nextRunAt = callArg(harness.create).data?.nextRunAt as Date;
    expect(nextRunAt).toBeInstanceOf(Date);
    expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
    // 06:30 on the 1st in Asia/Qatar (UTC+3) is 03:30Z.
    expect(nextRunAt.toISOString()).toMatch(/T03:30:00\.000Z$/);
    expect(nextRunAt.toISOString().slice(8, 10)).toBe('01');
  });
});

describe('ReportScheduleService.create — recipients', () => {
  it('resolves a recipient email to a user of this tenant', async () => {
    const harness = buildService({
      users: [{ id: 'user-recipient', email: 'recipient@demo.dijipeople.com' }],
    });

    await harness.service.create(
      CALLER,
      validInput({ recipients: ['Recipient@Demo.DijiPeople.com'] }),
    );

    expect(callArg(harness.create).data?.recipientUserIds).toEqual([
      'user-recipient',
    ]);
    // The lookup is scoped to the caller's tenant, so a user of another tenant
    // simply does not resolve.
    expect(callArg(harness.userFindMany).where?.tenantId).toBe('tenant-1');
  });

  it('rejects an address that is not a user of this tenant', async () => {
    const harness = buildService({ users: [] });

    const code = await errorCodeOf(
      harness.service.create(
        CALLER,
        validInput({ recipients: ['someone@gmail.com'] }),
      ),
    );

    expect(code).toBe('REPORT_SCHEDULE_RECIPIENT_FORBIDDEN');
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('rejects a user id that belongs to another tenant', async () => {
    // The tenant-scoped lookup returns nothing for a foreign id, which is the
    // mechanism: there is no separate cross-tenant check to forget.
    const harness = buildService({ users: [] });

    const code = await errorCodeOf(
      harness.service.create(
        CALLER,
        validInput({ recipients: ['user-in-tenant-2'] }),
      ),
    );

    expect(code).toBe('REPORT_SCHEDULE_RECIPIENT_FORBIDDEN');
  });

  it('rejects the whole write when only one of several recipients is unknown', async () => {
    const harness = buildService({
      users: [{ id: 'user-recipient', email: 'recipient@demo.dijipeople.com' }],
    });

    const code = await errorCodeOf(
      harness.service.create(
        CALLER,
        validInput({ recipients: ['user-recipient', 'outsider@gmail.com'] }),
      ),
    );

    expect(code).toBe('REPORT_SCHEDULE_RECIPIENT_FORBIDDEN');
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('rejects an empty recipient list', async () => {
    const harness = buildService();

    expect(
      await errorCodeOf(
        harness.service.create(CALLER, validInput({ recipients: [] })),
      ),
    ).toBe('REPORT_SCHEDULE_INVALID');
    expect(
      await errorCodeOf(
        harness.service.create(CALLER, validInput({ recipients: ['  ', ''] })),
      ),
    ).toBe('REPORT_SCHEDULE_INVALID');
  });

  it('caps the recipient list', async () => {
    const harness = buildService();
    const tooMany = Array.from(
      { length: MAX_SCHEDULE_RECIPIENTS + 1 },
      (_value, index) => `user-${index}`,
    );

    expect(
      await errorCodeOf(
        harness.service.create(CALLER, validInput({ recipients: tooMany })),
      ),
    ).toBe('REPORT_SCHEDULE_INVALID');
  });

  it('de-duplicates a recipient listed twice', async () => {
    const harness = buildService({
      users: [{ id: 'user-recipient', email: 'recipient@demo.dijipeople.com' }],
    });

    await harness.service.create(
      CALLER,
      validInput({
        recipients: ['user-recipient', 'recipient@demo.dijipeople.com'],
      }),
    );

    expect(callArg(harness.create).data?.recipientUserIds).toEqual([
      'user-recipient',
    ]);
  });
});

describe('ReportScheduleService.create — validation', () => {
  const cases: Array<[string, Partial<ReportScheduleWriteInput>]> = [
    ['an empty name', { name: '   ' }],
    ['an over-long name', { name: 'x'.repeat(161) }],
    ['an hour above range', { hour: 24 }],
    ['a negative hour', { hour: -1 }],
    ['a minute above range', { minute: 60 }],
    ['an unrecognised timezone', { timezone: 'Mars/Olympus_Mons' }],
    ['a fixed offset in place of a zone', { timezone: '+03:00' }],
    ['an unknown frequency', { frequency: 'HOURLY' as never }],
    ['an unknown export format', { format: 'DOCX' as never }],
    ['an unknown period preset', { periodPreset: 'since_forever' }],
    [
      'a weekly schedule with no weekday',
      { frequency: 'WEEKLY' as never, dayOfWeek: null },
    ],
    [
      'a weekly schedule with weekday 7',
      { frequency: 'WEEKLY' as never, dayOfWeek: 7 },
    ],
    [
      'a monthly schedule with no day of month',
      { frequency: 'MONTHLY' as never, dayOfMonth: null },
    ],
    [
      'a monthly schedule with day 32',
      { frequency: 'MONTHLY' as never, dayOfMonth: 32 },
    ],
    ['an analytics surface as the target', { targetKey: 'srf:workforce' }],
  ];

  it.each(cases)('rejects %s', async (_label, override) => {
    const harness = buildService();

    expect(
      await errorCodeOf(harness.service.create(CALLER, validInput(override))),
    ).toBe('REPORT_SCHEDULE_INVALID');
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('rejects a fixed custom date range, which would mail the same rows forever', async () => {
    const harness = buildService();

    const code = await errorCodeOf(
      harness.service.create(CALLER, validInput({ periodPreset: 'custom' })),
    );

    expect(code).toBe('REPORT_SCHEDULE_INVALID');
  });

  it('rejects a target key that is not a report reference at all', async () => {
    const harness = buildService();

    // parseTargetKey owns this; the service does not re-implement the prefixes.
    await expect(
      harness.service.create(CALLER, validInput({ targetKey: 'headcount' })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('derives reportDefinitionId from a def: target', async () => {
    const harness = buildService();

    await harness.service.create(
      CALLER,
      validInput({ targetKey: 'def:11111111-2222-3333-4444-555555555555' }),
    );

    expect(callArg(harness.create).data?.reportDefinitionId).toBe(
      '11111111-2222-3333-4444-555555555555',
    );
  });

  it('accepts a weekly schedule and stores only the fields that apply', async () => {
    const harness = buildService();

    await harness.service.create(
      CALLER,
      validInput({
        frequency: 'WEEKLY' as never,
        dayOfWeek: 1,
        // Left over from a previous frequency choice in the form; it must not
        // be stored, or a later edit back to MONTHLY would silently inherit it.
        dayOfMonth: 15,
      }),
    );

    const data = callArg(harness.create).data ?? {};
    expect(data.dayOfWeek).toBe(1);
    expect(data.dayOfMonth).toBeNull();
  });
});

describe('ReportScheduleService tenant scoping', () => {
  it('loads a schedule with the tenant in the filter, not by bare id', async () => {
    const harness = buildService();

    await harness.service.get(CALLER, 'schedule-1');

    expect(harness.findFirst).toHaveBeenCalledWith({
      where: { id: 'schedule-1', tenantId: 'tenant-1' },
    });
  });

  it('reports another tenant schedule as not found', async () => {
    const harness = buildService({ existing: null });

    expect(await errorCodeOf(harness.service.get(CALLER, 'schedule-1'))).toBe(
      'REPORT_NOT_FOUND',
    );
  });

  it('updates through updateMany with the tenant in the filter', async () => {
    const harness = buildService();

    await harness.service.update(CALLER, 'schedule-1', validInput());

    expect(callArg(harness.updateMany).where).toEqual({
      id: 'schedule-1',
      tenantId: 'tenant-1',
    });
  });

  it('never rewrites ownerUserId on update', async () => {
    const harness = buildService();

    await harness.service.update(CALLER, 'schedule-1', {
      ...validInput(),
      ownerUserId: 'user-caller',
    } as never);

    expect(callArg(harness.updateMany).data).not.toHaveProperty('ownerUserId');
  });

  it('clears the failure streak on edit, because somebody has now looked at it', async () => {
    const harness = buildService();

    await harness.service.update(CALLER, 'schedule-1', validInput());

    expect(callArg(harness.updateMany).data).toMatchObject({
      consecutiveFailureCount: 0,
      lastFailureReason: null,
    });
  });

  it('deletes through deleteMany with the tenant in the filter', async () => {
    const harness = buildService();

    await harness.service.remove(CALLER, 'schedule-1');

    expect(harness.deleteMany).toHaveBeenCalledWith({
      where: { id: 'schedule-1', tenantId: 'tenant-1' },
    });
  });

  it('reports a delete that matched nothing as not found', async () => {
    const harness = buildService({ deleteCount: 0 });

    expect(
      await errorCodeOf(harness.service.remove(CALLER, 'schedule-1')),
    ).toBe('REPORT_NOT_FOUND');
  });

  it('lists only this tenant schedules', async () => {
    const harness = buildService();

    await harness.service.list(CALLER);

    expect(callArg(harness.findMany).where).toEqual({
      tenantId: 'tenant-1',
    });
  });
});

describe('ReportScheduleService.setEnabled', () => {
  it('recomputes nextRunAt from now when re-enabling, not from the stale cursor', async () => {
    // A schedule that has been off for a month must not fire immediately, and
    // must not fire once for every slot it missed.
    const harness = buildService({
      existing: storedRow({
        isEnabled: false,
        nextRunAt: new Date('2020-01-01T00:00:00.000Z'),
        consecutiveFailureCount: 5,
        lastFailureReason: 'Disabled after 5 consecutive failures.',
      }),
    });

    await harness.service.setEnabled(CALLER, 'schedule-1', true);

    const data = callArg(harness.updateMany).data;
    expect(data.isEnabled).toBe(true);
    expect((data.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(data.consecutiveFailureCount).toBe(0);
    expect(data.lastFailureReason).toBeNull();
  });

  it('clears nextRunAt when disabling, so the worker never sees it', async () => {
    const harness = buildService();

    await harness.service.setEnabled(CALLER, 'schedule-1', false);

    expect(callArg(harness.updateMany).data).toMatchObject({
      isEnabled: false,
      nextRunAt: null,
    });
  });
});
