import { Prisma } from '@prisma/client';
import { NavigationService } from './navigation.service';
import type { SidebarNavigationOverrideDto } from './dto/sidebar-navigation.dto';

type StoredRow = {
  itemKey: string;
  isHidden: boolean;
  label: string | null;
  sortOrder: number | null;
  visibilityRules: unknown;
  updatedAt: Date;
};

/*
 * A stand-in for the two calls the service makes, so the merge and
 * "don't store a no-op" rules can be asserted without a database.
 */
function createPrisma(initial: StoredRow[] = []) {
  let rows = [...initial];
  const created: Array<Record<string, unknown>> = [];
  const deleteCalls: Array<{ tenantId: string }> = [];

  const tx = {
    tenantNavigationOverride: {
      deleteMany: jest.fn(({ where }: { where: { tenantId: string } }) => {
        deleteCalls.push(where);
        rows = [];
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn(
        ({ data }: { data: Array<Record<string, unknown>> }) => {
          created.push(...data);
          rows = data.map((item) => ({
            itemKey: item.itemKey as string,
            isHidden: item.isHidden as boolean,
            label: (item.label ?? null) as string | null,
            sortOrder: (item.sortOrder ?? null) as number | null,
            visibilityRules:
              item.visibilityRules === Prisma.DbNull
                ? null
                : item.visibilityRules,
            updatedAt: new Date(0),
          }));
          return Promise.resolve({ count: data.length });
        },
      ),
    },
  };

  return {
    created,
    deleteCalls,
    prisma: {
      tenantNavigationOverride: {
        findMany: jest.fn(() => Promise.resolve(rows)),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    },
  };
}

function service(harness: ReturnType<typeof createPrisma>) {
  return new NavigationService(
    harness.prisma as unknown as ConstructorParameters<
      typeof NavigationService
    >[0],
  );
}

const TENANT = 'tenant-1';
const USER = 'user-1';

describe('NavigationService', () => {
  it('does not store an override that changes nothing', async () => {
    const harness = createPrisma();
    const items: SidebarNavigationOverrideDto[] = [
      { itemKey: '/employees' },
      { itemKey: '/leaves', isHidden: false, label: '   ' },
    ];

    await service(harness).replaceSidebarOverrides(TENANT, USER, items);

    expect(harness.created).toHaveLength(0);
  });

  it.each([
    ['hidden', { itemKey: '/reports', isHidden: true }],
    ['renamed', { itemKey: '/reports', label: 'Insights' }],
    ['reordered', { itemKey: '/reports', sortOrder: 0 }],
    [
      'gated',
      {
        itemKey: '/reports',
        visibilityRules: [
          { operator: 'has-any-role' as const, roleKeys: ['hr'] },
        ],
      },
    ],
  ])('stores an override that %s', async (_label, item) => {
    const harness = createPrisma();

    await service(harness).replaceSidebarOverrides(TENANT, USER, [
      item as SidebarNavigationOverrideDto,
    ]);

    expect(harness.created).toHaveLength(1);
    expect(harness.created[0]).toMatchObject({
      tenantId: TENANT,
      itemKey: '/reports',
    });
  });

  it('keeps sortOrder 0 rather than treating it as absent', async () => {
    const harness = createPrisma();

    await service(harness).replaceSidebarOverrides(TENANT, USER, [
      { itemKey: '/reports', sortOrder: 0 },
    ]);

    expect(harness.created[0]).toMatchObject({ sortOrder: 0 });
  });

  it('replaces the whole set inside one transaction, scoped to the tenant', async () => {
    const harness = createPrisma();

    await service(harness).replaceSidebarOverrides(TENANT, USER, [
      { itemKey: '/reports', isHidden: true },
    ]);

    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(harness.deleteCalls).toEqual([{ tenantId: TENANT }]);
  });

  it('resolves a duplicated key to the last one sent instead of failing', async () => {
    const harness = createPrisma();

    await service(harness).replaceSidebarOverrides(TENANT, USER, [
      { itemKey: '/reports', label: 'First' },
      { itemKey: '/reports', label: 'Second' },
    ]);

    expect(harness.created).toHaveLength(1);
    expect(harness.created[0]).toMatchObject({ label: 'Second' });
  });

  it('trims a label and stores a blank one as no override', async () => {
    const harness = createPrisma();

    await service(harness).replaceSidebarOverrides(TENANT, USER, [
      { itemKey: '/reports', isHidden: true, label: '  Insights  ' },
      { itemKey: '/leaves', isHidden: true, label: '   ' },
    ]);

    expect(harness.created).toEqual([
      expect.objectContaining({ itemKey: '/reports', label: 'Insights' }),
      expect.objectContaining({ itemKey: '/leaves', label: null }),
    ]);
  });

  it('reads back rules as an array and a missing value as null', async () => {
    const harness = createPrisma([
      {
        itemKey: '/reports',
        isHidden: false,
        label: null,
        sortOrder: null,
        visibilityRules: [{ operator: 'has-any-role', roleKeys: ['hr'] }],
        updatedAt: new Date(0),
      },
      {
        itemKey: '/leaves',
        isHidden: true,
        label: null,
        sortOrder: null,
        visibilityRules: null,
        updatedAt: new Date(0),
      },
    ]);

    const result = await service(harness).getSidebarOverrides(TENANT);

    expect(result[0].visibilityRules).toEqual([
      { operator: 'has-any-role', roleKeys: ['hr'] },
    ]);
    expect(result[1].visibilityRules).toBeNull();
  });
});
