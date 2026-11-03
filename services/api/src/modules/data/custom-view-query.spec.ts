import {
  CURRENT_USER_TOKEN,
  ViewDefinitionError,
  planView,
  sortRowsByColumns,
  type ViewPlanContext,
} from './custom-view-query';

const ctx = (over: Partial<ViewPlanContext> = {}): ViewPlanContext => ({
  userId: 'user-1',
  permissionKeys: ['custom-records.read'],
  columns: new Map([
    ['name', { readPermission: null }],
    ['stage', { readPermission: null }],
    ['salary', { readPermission: 'payroll.read' }],
  ]),
  ...over,
});

const view = (filtersJson: unknown, sortingJson: unknown = []) => ({
  filtersJson,
  sortingJson,
});
const refused = (v: ReturnType<typeof view>, c = ctx()) => {
  try {
    planView(v, c);
  } catch (e) {
    return e as ViewDefinitionError;
  }
  throw new Error('expected the view to be refused');
};

describe('planView — filters', () => {
  it('Active / Inactive become an isActive predicate', () => {
    expect(
      planView(
        view([{ columnKey: 'isActive', operator: 'eq', value: true }]),
        ctx(),
      ).where,
    ).toEqual([{ isActive: true }]);
    expect(
      planView(
        view([{ columnKey: 'isActive', operator: 'eq', value: false }]),
        ctx(),
      ).where,
    ).toEqual([{ isActive: false }]);
    expect(
      planView(
        view([{ columnKey: 'isActive', operator: 'neq', value: true }]),
        ctx(),
      ).where,
    ).toEqual([{ isActive: false }]);
  });

  it('@me resolves to the CALLER on the server, never to a client-supplied id', () => {
    const plan = planView(
      view([
        { columnKey: 'ownerUserId', operator: 'eq', value: CURRENT_USER_TOKEN },
      ]),
      ctx({ userId: 'caller-9' }),
    );
    expect(plan.where).toEqual([{ ownerUserId: 'caller-9' }]);
    expect(JSON.stringify(plan)).not.toContain('@me');
  });

  it('a tenant column filter reads the JSON values by path', () => {
    const plan = planView(
      view([{ columnKey: 'stage', operator: 'eq', value: 'Open' }]),
      ctx(),
    );
    expect(plan.where).toEqual([
      { values: { path: ['stage'], equals: 'Open' } },
    ]);
  });

  it('not-equals also keeps records that have no value (SQL NULL would drop them)', () => {
    const [clause] = planView(
      view([{ columnKey: 'stage', operator: 'neq', value: 'Open' }]),
      ctx(),
    ).where as Array<{ OR: unknown[] }>;
    expect(clause.OR).toHaveLength(2);
  });

  it('in / contains / startswith are supported; the web aliases equals / notEquals are accepted', () => {
    expect(
      planView(
        view([{ columnKey: 'stage', operator: 'in', value: ['A', 'B'] }]),
        ctx(),
      ).where,
    ).toHaveLength(1);
    expect(
      planView(
        view([{ columnKey: 'name', operator: 'contains', value: 'acme' }]),
        ctx(),
      ).where,
    ).toEqual([{ values: { path: ['name'], string_contains: 'acme' } }]);
    expect(
      planView(view([{ field: 'name', op: 'equals', value: 'x' }]), ctx())
        .where,
    ).toEqual([{ values: { path: ['name'], equals: 'x' } }]);
    expect(
      planView(
        view([{ fieldLogicalName: 'name', operator: 'notEquals', value: 'x' }]),
        ctx(),
      ).where,
    ).toHaveLength(1);
  });

  it('refuses rather than silently ignoring what it cannot evaluate', () => {
    expect(
      refused(view([{ columnKey: 'stage', operator: 'regex', value: 'x' }]))
        .code,
    ).toBe('VIEW_FILTER_UNSUPPORTED');
    expect(
      refused(view([{ columnKey: 'nope', operator: 'eq', value: 'x' }])).code,
    ).toBe('VIEW_FILTER_UNSUPPORTED');
    expect(
      refused(view([{ columnKey: 'stage', operator: 'in', value: [] }])).code,
    ).toBe('VIEW_FILTER_UNSUPPORTED');
    expect(
      refused(view([{ columnKey: 'isActive', operator: 'eq', value: 'yes' }]))
        .code,
    ).toBe('VIEW_FILTER_UNSUPPORTED');
    expect(
      refused(
        view([{ columnKey: 'isActive', operator: 'contains', value: true }]),
      ).code,
    ).toBe('VIEW_FILTER_UNSUPPORTED');
  });

  it('refuses a view that filters on a field the caller may not read (no inference through filtering)', () => {
    const v = view([{ columnKey: 'salary', operator: 'eq', value: 5000 }]);
    expect(refused(v).code).toBe('VIEW_FIELD_FORBIDDEN');
    expect(
      planView(v, ctx({ permissionKeys: ['payroll.read'] })).where,
    ).toHaveLength(1);
  });

  it('no filters means no extra predicate', () => {
    expect(planView(view([]), ctx()).where).toEqual([]);
    expect(planView(view(null), ctx()).where).toEqual([]);
  });
});

describe('planView — ordering', () => {
  it('defaults to newest first with a stable tie-break', () => {
    expect(planView(view([]), ctx()).orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('system-field sorts run in the database and always end on id (so pages never repeat or drop rows)', () => {
    const plan = planView(
      view([], [{ columnKey: 'updatedAt', direction: 'desc' }]),
      ctx(),
    );
    expect(plan.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }]);
    expect(plan.customSort).toBeNull();
  });

  it('a tenant-column sort is flagged for the bounded in-memory path', () => {
    const plan = planView(
      view([], [{ columnKey: 'name', direction: 'asc' }]),
      ctx(),
    );
    expect(plan.customSort).toEqual([{ field: 'name', direction: 'asc' }]);
  });

  it('a sort on an unreadable field is refused; an unknown sort field is ignored', () => {
    expect(
      refused(view([], [{ columnKey: 'salary', direction: 'asc' }])).code,
    ).toBe('VIEW_FIELD_FORBIDDEN');
    expect(
      planView(view([], [{ columnKey: 'ghost', direction: 'asc' }]), ctx())
        .orderBy,
    ).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });
});

describe('sortRowsByColumns', () => {
  const row = (
    id: string,
    values: Record<string, unknown>,
    createdAt = new Date('2026-01-01'),
  ) => ({ id, values: values as never, createdAt });

  it('orders by a column, numbers numerically and text naturally', () => {
    const rows = [row('a', { n: 10 }), row('b', { n: 2 }), row('c', { n: 33 })];
    expect(
      sortRowsByColumns(rows, [{ field: 'n', direction: 'asc' }]).map(
        (r) => r.id,
      ),
    ).toEqual(['b', 'a', 'c']);
    expect(
      sortRowsByColumns(
        [row('a', { t: 'Item 10' }), row('b', { t: 'Item 2' })],
        [{ field: 't', direction: 'asc' }],
      ).map((r) => r.id),
    ).toEqual(['b', 'a']);
  });

  it('missing values sort last in BOTH directions', () => {
    const rows = [row('none', {}), row('x', { n: 1 }), row('y', { n: 2 })];
    expect(
      sortRowsByColumns(rows, [{ field: 'n', direction: 'asc' }]).map(
        (r) => r.id,
      ),
    ).toEqual(['x', 'y', 'none']);
    expect(
      sortRowsByColumns(rows, [{ field: 'n', direction: 'desc' }]).map(
        (r) => r.id,
      ),
    ).toEqual(['y', 'x', 'none']);
  });

  it('ties break on id, and mixed system + column keys are honoured in order', () => {
    const rows = [
      row('b', { n: 1 }, new Date('2026-02-01')),
      row('a', { n: 1 }, new Date('2026-03-01')),
      row('c', { n: 1 }, new Date('2026-01-01')),
    ];
    expect(
      sortRowsByColumns(rows, [{ field: 'n', direction: 'asc' }]).map(
        (r) => r.id,
      ),
    ).toEqual(['a', 'b', 'c']);
    expect(
      sortRowsByColumns(rows, [
        { field: 'createdAt', direction: 'desc' },
        { field: 'n', direction: 'asc' },
      ]).map((r) => r.id),
    ).toEqual(['a', 'b', 'c']);
  });
});
