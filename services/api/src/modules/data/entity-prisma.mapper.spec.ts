import { ENTITY_REGISTRY } from './entity-registry';
import { mapEntityQueryToPrismaArgs } from './entity-prisma.mapper';

describe('mapEntityQueryToPrismaArgs', () => {
  it('maps validated entity query into safe Prisma args with scope', () => {
    const args = mapEntityQueryToPrismaArgs(
      ENTITY_REGISTRY.employees,
      {
        select: ['id', 'firstName', 'email'],
        filters: [
          { field: 'employmentStatus', operator: 'eq', value: 'ACTIVE' },
        ],
        orderBy: [{ field: 'firstName', direction: 'asc' }],
        expand: [{ relation: 'manager', select: ['id', 'firstName'] }],
        page: 2,
        pageSize: 25,
        count: true,
      },
      { tenantId: 'tenant-1', businessUnitId: { in: ['bu-1'] } },
    );

    expect(args.findManyArgs).toEqual({
      where: {
        AND: [
          { tenantId: 'tenant-1', businessUnitId: { in: ['bu-1'] } },
          { employmentStatus: 'ACTIVE' },
        ],
      },
      select: {
        id: true,
        firstName: true,
        email: true,
        manager: { select: { id: true, firstName: true } },
      },
      orderBy: [{ firstName: 'asc' }],
      skip: 25,
      take: 25,
    });
    expect(args.countArgs).toEqual({
      where: args.findManyArgs.where,
    });
  });
});
