import { PlatformRuntimeService } from './platform-runtime.service';

/**
 * REG — one runtime module, one shape for `features`.
 *
 * The Entitlements tab on a plan showed every capability unticked. The cause
 * was that `GET /platform-runtime/plans/:id` and `PATCH` on the same module
 * disagreed about what `features` is:
 *
 *   GET   → raw `PlanFeature` rows  [{ featureKey, isEnabled }, …]
 *   PATCH → `mapPlan`, filtered keys ['employees', …]
 *
 * The record page reads whichever the last response carried, so a plan looked
 * right until anything was saved and then read as granting nothing.
 *
 * Cosmetic is the wrong word for it. `SuperAdminService.updatePlan` applies
 * `featureKeys` with `deleteMany: {}` then `create`, so it stores exactly the
 * set it receives. From the blanked state an operator ticks the one they meant
 * to change and saves — and that removes every other entitlement from a plan
 * that live tenants are subscribed to.
 *
 * This asserts the GET side. `plan-entitlement-keys.spec.ts` in `apps/admin`
 * covers the client, which stays tolerant of both shapes regardless.
 */
describe('runtime plan record', () => {
  function findPlan(
    features: Array<{ featureKey: string; isEnabled: boolean }>,
  ) {
    const service = Object.create(
      PlatformRuntimeService.prototype,
    ) as PlatformRuntimeService & { prisma: unknown };

    service.prisma = {
      plan: {
        findUnique: async () => ({
          id: 'plan-1',
          monthlyBasePrice: 69,
          annualBasePrice: 690,
          prices: [],
          subscriptions: [],
          features,
        }),
      },
    };

    return (
      service as unknown as {
        findGeneric: (
          key: string,
          id: string,
        ) => Promise<{ features: unknown }>;
      }
    ).findGeneric('plans', 'plan-1');
  }

  it('returns entitlements as keys, the shape the update endpoint returns', async () => {
    const record = await findPlan([
      { featureKey: 'employees', isEnabled: true },
      { featureKey: 'leave', isEnabled: true },
    ]);

    expect(record.features).toEqual(['employees', 'leave']);
  });

  it('omits a disabled row, exactly as mapPlan does', async () => {
    const record = await findPlan([
      { featureKey: 'employees', isEnabled: true },
      { featureKey: 'payroll', isEnabled: false },
    ]);

    expect(record.features).toEqual(['employees']);
  });
});
