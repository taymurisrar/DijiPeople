import { PayslipsService } from './payslips.service';

/** BUG-3172 — GET /payslips must never read the whole table in one response. */
describe('PayslipsService.listPayslips bounds', () => {
  const makeService = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = Object.create(PayslipsService.prototype) as PayslipsService;
    Object.assign(service, { prisma: { payslip: { findMany } } });
    return { service, findMany };
  };

  it('applies a default ceiling and stays tenant-scoped', async () => {
    const { service, findMany } = makeService();
    await service.listPayslips({ tenantId: 'tenant-a' });
    const args = findMany.mock.calls[0][0];
    expect(args.take).toBe(200);
    expect(args.skip).toBe(0);
    expect(args.where.tenantId).toBe('tenant-a');
  });

  it('walks pages with a stable tiebreaker order', async () => {
    const { service, findMany } = makeService();
    await service.listPayslips({ tenantId: 'tenant-a', page: 3, pageSize: 50 });
    const args = findMany.mock.calls[0][0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(50);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});
