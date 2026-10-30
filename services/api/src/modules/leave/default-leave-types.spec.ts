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
    const args = createMany.mock.calls[0][0];
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
