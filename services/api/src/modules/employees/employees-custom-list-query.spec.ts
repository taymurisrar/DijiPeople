import { EmployeesService } from './employees.service';

/*
 * TASK-0036 / ADR-0025 — the seam between the list query and the custom-field
 * sort and filter. The repository and CustomFieldValuesService are each
 * tested on a real database; this pins the step between them: that an
 * `orderBy` string and a `customFilters` parameter as the web sends them reach
 * the custom path. A lost backslash in the orderBy pattern once left every
 * custom sort silently falling back to name order while both ends passed.
 */
function build() {
  const findByTenant = jest.fn().mockResolvedValue({ items: [], total: 0 });
  const values = {
    recordIdConstraints: jest.fn().mockResolvedValue([{ in: ['e1'] }]),
    orderedRecordIds: jest.fn().mockResolvedValue(['e1']),
  };
  const service = new EmployeesService(
    {} as never,
    { findByTenant } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    values as never,
  );
  return { service, findByTenant, values };
}

const user = {
  userId: 'u1',
  tenantId: 't1',
  email: 'hr@example.com',
  roleIds: [],
  roleKeys: ['hr'],
  permissionKeys: ['employees.read'],
  rolePrivileges: [],
};

type Custom = {
  idConstraints?: unknown[];
  sortIds?: (ids: string[]) => Promise<string[] | null>;
};

async function customFor(query: Record<string, unknown>) {
  const { service, findByTenant, values } = build();
  await service.findByTenant(
    user as never,
    {
      page: 1,
      pageSize: 20,
      ...query,
    } as never,
  );
  const calls = findByTenant.mock.calls as unknown[][];
  const custom = calls[0][4] as Custom;
  return { custom, values };
}

describe('EmployeesService — custom-field list query', () => {
  it('sends a custom-field orderBy to the custom sort', async () => {
    const { custom, values } = await customFor({ orderBy: 'bp_score desc' });
    expect(custom.sortIds).toBeDefined();
    await custom.sortIds?.(['e1', 'e2']);
    expect(values.orderedRecordIds).toHaveBeenCalledWith(
      user,
      'employees',
      'bp_score',
      'desc',
      ['e1', 'e2'],
    );
  });

  it('leaves a system-column orderBy to the ordinary order', async () => {
    const { custom } = await customFor({ orderBy: 'hireDate asc' });
    expect(custom.sortIds).toBeUndefined();
  });

  it('turns customFilters into id constraints', async () => {
    const filters = [{ field: 'bp_region', operator: 'equals', value: 'N' }];
    const { custom, values } = await customFor({
      customFilters: JSON.stringify(filters),
    });
    expect(values.recordIdConstraints).toHaveBeenCalledWith(
      user,
      'employees',
      filters,
    );
    expect(custom.idConstraints).toEqual([{ in: ['e1'] }]);
  });
});
