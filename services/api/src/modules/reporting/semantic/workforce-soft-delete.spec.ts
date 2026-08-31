import { getDataSource } from './data-sources';
import { planWhere } from '../engine/query-planner';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';

/**
 * Soft-deleted employees must not reach a reporting number.
 *
 * BUG-2625 / REG-382. `Employee` is one of the few models in this schema that
 * carries `isDeleted`, and the legacy reports aggregates omitted it while the
 * Employees screen filtered it. The two disagreed by exactly the number of
 * employees the tenant had ever soft-deleted — always plausible, always larger,
 * never right, and growing silently.
 *
 * The fix places the predicate in the `workforce` data source's `baseWhere`
 * rather than in each metric, so every metric, breakdown, standard report and
 * export built on the source inherits it and opting out has to be deliberate.
 * These tests pin that: the first asserts the declaration, the second asserts it
 * actually survives into a composed `where`, because a `baseWhere` the planner
 * dropped on the floor would still satisfy the first test on its own.
 */
describe('workforce source excludes soft-deleted employees', () => {
  it('declares both halves of the soft-delete predicate in baseWhere', () => {
    // Both, not just `isDeleted`: the Employees screen requires both, and
    // asserting one would let the other be removed without a failure.
    expect(getDataSource('workforce').baseWhere).toMatchObject({
      isDeleted: false,
      deletedAt: null,
    });
  });

  it('carries the predicate into a planned where', () => {
    const user = { tenantId: 'tenant-1' } as unknown as AuthenticatedUser;

    const where = JSON.stringify(
      planWhere({
        source: getDataSource('workforce'),
        user,
        scopeWhere: {},
        filters: [],
      }),
    );

    expect(where).toContain('"isDeleted":false');
    expect(where).toContain('"deletedAt":null');
  });
});
