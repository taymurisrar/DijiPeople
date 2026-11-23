import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformRuntimeService } from './platform-runtime.service';
import {
  buildRuntimeDbQuery,
  RUNTIME_LIST_SPECS,
  runtimePageEnvelope,
  toPageArgs,
} from './runtime-db-query';

/*
 * BUG-3175. The nine whole-table runtime lists now push search, view, filter,
 * sort and the page cut into Prisma.
 */
const none = { sort: [], filters: [] };

describe('buildRuntimeDbQuery', () => {
  it('builds a case-insensitive OR over the documented search columns', () => {
    const query = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.plans, {
      ...none,
      search: '  growth ',
    });
    expect(query?.where).toEqual({
      AND: [
        {
          OR: [
            { key: { contains: 'growth', mode: 'insensitive' } },
            { name: { contains: 'growth', mode: 'insensitive' } },
            { description: { contains: 'growth', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('nests relation search paths', () => {
    const query = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.payments, {
      ...none,
      search: 'acme',
    });
    expect(JSON.stringify(query?.where)).toContain(
      '{"tenant":{"customerAccount":{"companyName":{"contains":"acme","mode":"insensitive"}}}}',
    );
  });

  it('has an empty where and the legacy order when nothing is requested', () => {
    const query = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.tenants, none);
    expect(query?.where).toEqual({});
    expect(query?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });

  it('keeps only whitelisted sort fields and breaks ties on the old order then id', () => {
    const query = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.invoices, {
      search: undefined,
      filters: [],
      sort: [
        { field: 'passwordHash', direction: 'asc' },
        { field: 'tenant.name', direction: 'desc' },
        { field: 'amount', direction: 'asc' },
      ],
    });
    expect(query?.orderBy).toEqual([
      { tenant: { name: 'desc' } },
      { amount: 'asc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('ignores a sort made only of unknown fields, keeping the default order', () => {
    const query = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.plans, {
      search: undefined,
      filters: [],
      sort: [{ field: 'nope', direction: 'asc' }],
    });
    expect(query?.orderBy).toEqual([
      { sortOrder: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('agrees with the shared view rules, including boolean rules', () => {
    const plans = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.plans, {
      ...none,
      viewKey: 'active',
    });
    expect(plans?.where).toEqual({ AND: [{ isActive: true }] });
    const invoices = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.invoices, {
      ...none,
      viewKey: 'active',
    });
    expect(invoices?.where).toEqual({
      AND: [{ status: { in: ['ISSUED', 'OVERDUE', 'PAYMENT_FAILED'] } }],
    });
  });

  it('pins a personal view to the platform user and matches nothing without one', () => {
    const mine = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.tenants, {
      ...none,
      viewKey: 'my-records',
      platformUserId: 'p1',
    });
    expect(mine?.where).toEqual({ AND: [{ createdById: 'p1' }] });
    const anonymous = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.tenants, {
      ...none,
      viewKey: 'my-records',
    });
    expect(anonymous?.where).toEqual({
      AND: [{ createdById: '__no_platform_identity__' }],
    });
  });

  it('pushes a valid enum filter down and falls back for one it cannot express', () => {
    const ok = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.invoices, {
      search: undefined,
      sort: [],
      filters: [{ field: 'status', operator: 'eq', value: 'PAID' }],
    });
    expect(ok?.where).toEqual({ AND: [{ status: { equals: 'PAID' } }] });
    const invalidEnum = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.invoices, {
      search: undefined,
      sort: [],
      filters: [{ field: 'status', operator: 'eq', value: 'NOT_A_STATUS' }],
    });
    expect(invalidEnum).toBeNull();
    const notWhitelisted = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.invoices, {
      search: undefined,
      sort: [],
      filters: [{ field: 'amount', operator: 'gt', value: 5 }],
    });
    expect(notWhitelisted).toBeNull();
  });

  it('computes skip/take from the page', () => {
    const query = buildRuntimeDbQuery(RUNTIME_LIST_SPECS.plans, none);
    expect(query && toPageArgs(query, 3, 25)).toMatchObject({
      skip: 50,
      take: 25,
    });
  });

  it('reports an empty page beyond the end with the true total', () => {
    expect(runtimePageEnvelope([], 30, 9, 25)).toEqual({
      items: [],
      meta: {
        page: 9,
        pageSize: 25,
        total: 30,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });
});

function platformUser(): AuthenticatedUser {
  return {
    userId: 'platform-super-admin',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: { id: 'p1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
  } as unknown as AuthenticatedUser;
}

describe('PlatformRuntimeService.list pushes the page into Prisma', () => {
  function build() {
    const findMany = jest.fn(async () => [{ id: 'i1', status: 'NEW' }]);
    const count = jest.fn(async () => 41);
    const prisma = { partnerInquiry: { findMany, count } };
    const service = new PlatformRuntimeService(
      prisma as never,
      ...(Array(14).fill({}) as [never]),
    );
    return { service, findMany, count };
  }

  it('passes where, orderBy, skip and take to findMany and counts the same where', async () => {
    const { service, findMany, count } = build();
    const result = (await service.list(platformUser(), 'partner-inquiries', {
      page: '2',
      pageSize: '10',
      search: 'acme',
      sort: JSON.stringify([
        { field: 'email', direction: 'asc' },
        { field: 'phone', direction: 'desc' },
      ]),
    })) as { items: unknown[]; meta: Record<string, unknown> };

    const args = (findMany.mock.calls as unknown[][])[0][0] as {
      where: unknown;
      orderBy: unknown;
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(JSON.stringify(args.where)).toContain('"OR"');
    expect(args.orderBy).toEqual([
      { email: 'asc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
    expect((count.mock.calls as unknown[][])[0][0]).toEqual({
      where: args.where,
    });
    expect(result.meta).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 41,
      totalPages: 5,
      hasNextPage: true,
    });
  });

  it('returns no items but the real total for a page past the end', async () => {
    const { service, findMany } = build();
    findMany.mockResolvedValueOnce([]);
    const result = (await service.list(platformUser(), 'partner-inquiries', {
      page: '99',
      pageSize: '25',
    })) as { items: unknown[]; meta: Record<string, unknown> };
    expect(result.items).toEqual([]);
    expect(result.meta).toMatchObject({ total: 41, hasNextPage: false });
  });
});
