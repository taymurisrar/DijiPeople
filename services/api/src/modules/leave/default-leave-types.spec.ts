import {
  DEFAULT_LEAVE_TYPES,
  ensureDefaultLeaveTypes,
} from './default-leave-types';

describe('ensureDefaultLeaveTypes', () => {
  it('inserts the defaults for the tenant only, never updating existing rows', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 4 });
    const db = { leaveType: { createMany, update: jest.fn() } };

    const created = await ensureDefaultLeaveTypes(
      db as never,
      'tenant-1',
      'actor-1',
    );

    expect(created).toBe(4);
    expect(db.leaveType.update).not.toHaveBeenCalled();
    const [args] = createMany.mock.calls[0] as [
      {
        skipDuplicates: boolean;
        data: Array<{
          tenantId: string;
          createdById: string;
          requiresApproval: boolean;
        }>;
      },
    ];
    // skipDuplicates keeps an admin's rename/deactivation intact on replay.
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toHaveLength(DEFAULT_LEAVE_TYPES.length);
    for (const row of args.data) {
      expect(row.tenantId).toBe('tenant-1');
      expect(row.createdById).toBe('actor-1');
      expect(row.requiresApproval).toBe(true);
    }
  });

  it('ships at least one paid and one unpaid type an employee can request', () => {
    expect(DEFAULT_LEAVE_TYPES.some((t) => t.isPaid)).toBe(true);
    expect(DEFAULT_LEAVE_TYPES.some((t) => !t.isPaid)).toBe(true);
  });
});

/**
 * `seed-config` runs this on every deploy. It must leave an admin's changes
 * alone: the previous implementation updated existing rows and forced
 * `isActive: true`, re-enabling a deliberately deactivated type at each release.
 */
describe('ensureDefaultLeaveTypes idempotency', () => {
  type Row = {
    tenantId: string;
    code: string;
    name: string;
    isActive: boolean;
  };

  /** A stand-in for the table honouring @@unique([tenantId, code|name]). */
  function fakeDb(rows: Row[]) {
    const writes = { updates: 0 };
    return {
      rows,
      writes,
      db: {
        leaveType: {
          update: () => {
            writes.updates += 1;
          },
          createMany: async ({ data }: { data: Row[] }) => {
            let count = 0;
            for (const row of data) {
              const clash = rows.some(
                (r) =>
                  r.tenantId === row.tenantId &&
                  (r.code === row.code || r.name === row.name),
              );
              if (!clash) {
                rows.push({ ...row });
                count += 1;
              }
            }
            return { count };
          },
        },
      },
    };
  }

  it('creates the four defaults once and then does nothing', async () => {
    const { db, rows } = fakeDb([]);
    expect(await ensureDefaultLeaveTypes(db as never, 't1')).toBe(4);
    expect(await ensureDefaultLeaveTypes(db as never, 't1')).toBe(0);
    expect(rows).toHaveLength(4);
  });

  it('keeps a deliberately deactivated default type deactivated', async () => {
    const { db, rows, writes } = fakeDb([
      { tenantId: 't1', code: 'SICK', name: 'Sick Leave', isActive: false },
    ]);

    await ensureDefaultLeaveTypes(db as never, 't1');
    await ensureDefaultLeaveTypes(db as never, 't1');

    expect(rows.find((r) => r.code === 'SICK')?.isActive).toBe(false);
    expect(writes.updates).toBe(0);
  });

  it('keeps a renamed default type and does not add a duplicate by code', async () => {
    const { db, rows } = fakeDb([
      { tenantId: 't1', code: 'ANNUAL', name: 'Vacation', isActive: true },
    ]);

    await ensureDefaultLeaveTypes(db as never, 't1');

    expect(rows.filter((r) => r.code === 'ANNUAL')).toHaveLength(1);
    expect(rows.find((r) => r.code === 'ANNUAL')?.name).toBe('Vacation');
  });

  it('does not touch another tenant', async () => {
    const { db, rows } = fakeDb([
      { tenantId: 't2', code: 'ANNUAL', name: 'Annual Leave', isActive: false },
    ]);

    await ensureDefaultLeaveTypes(db as never, 't1');

    expect(rows.filter((r) => r.tenantId === 't2')).toHaveLength(1);
    expect(rows.filter((r) => r.tenantId === 't1')).toHaveLength(4);
  });
});
