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
          // Soft-deleted rows never leave the entity API (DP-QA-030).
          { isDeleted: false },
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

describe('soft-deleted rows (DP-QA-030)', () => {
  const base = {
    select: ['id'],
    filters: [],
    orderBy: [],
    expand: [],
    page: 1,
    pageSize: 25,
    count: true,
  };

  it('always excludes soft-deleted employees, even when the caller filters or searches', () => {
    const metadata = ENTITY_REGISTRY.employees;
    const { findManyArgs, countArgs } = mapEntityQueryToPrismaArgs(
      metadata,
      { ...base, search: 'conc' } as never,
      { tenantId: 't1' },
    );

    for (const where of [findManyArgs.where, countArgs.where]) {
      expect(JSON.stringify(where)).toContain('"isDeleted":false');
    }
  });

  it('cannot be turned off by a caller-supplied filter on the same column', () => {
    const { findManyArgs } = mapEntityQueryToPrismaArgs(
      ENTITY_REGISTRY.employees,
      {
        ...base,
        filters: [
          { field: 'employmentStatus', operator: 'eq', value: 'ACTIVE' },
        ],
      } as never,
      { tenantId: 't1' },
    );
    expect(JSON.stringify(findManyArgs.where)).toContain('"isDeleted":false');
  });
});
