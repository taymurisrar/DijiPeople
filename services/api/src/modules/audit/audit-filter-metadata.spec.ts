import { AuditRepository } from './audit.repository';

/** BUG-3171 — filter metadata must be a database-side GROUP BY, tenant-scoped. */
describe('AuditRepository.getFilterMetadata', () => {
  it('groups in the database instead of reading every row', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce([{ action: 'A' }])
      .mockResolvedValueOnce([{ entityType: 'E' }]);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      auditLog: { groupBy, findMany: jest.fn() },
      user: { findMany },
    };
    const repository = new AuditRepository(prisma as never);

    const result = await repository.getFilterMetadata('tenant-a');

    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    expect(groupBy).toHaveBeenCalledTimes(2);
    for (const call of groupBy.mock.calls) {
      expect(call[0].where).toEqual({ tenantId: 'tenant-a' });
    }
    expect(result.actions).toEqual(['A']);
    expect(result.entityTypes).toEqual(['E']);
  });
});
