import { repairRuntimeTableState } from './platform-users.service';

describe('platform runtime preference repair', () => {
  it('resets unversioned state from older deployments', () => {
    expect(
      repairRuntimeTableState('tenants', {
        savedFilters: [
          {
            filters: [
              { field: 'assignedToUserId', operator: 'eq', value: 'old' },
            ],
          },
        ],
      }),
    ).toBeNull();
  });

  it('removes a stale ownership filter that is not in the Tenant schema', () => {
    expect(
      repairRuntimeTableState('tenants', {
        version: 2,
        savedFilters: [
          {
            id: 'mine',
            filters: [
              { field: 'assignedToUserId', operator: 'eq', value: 'old' },
              { field: 'ownerUserId', operator: 'eq', value: 'canonical' },
            ],
          },
        ],
      }),
    ).toMatchObject({
      savedFilters: [
        {
          filters: [
            { field: 'ownerUserId', operator: 'eq', value: 'canonical' },
          ],
        },
      ],
    });
  });
});
