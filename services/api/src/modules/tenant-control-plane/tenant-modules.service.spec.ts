import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantModulesService } from './tenant-modules.service';

const platformUser = {
  userId: 'platform-user-1',
  tenantId: 'platform',
  email: 'ops@dijipeople.com',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
  platform: { id: 'platform-user-1', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

/**
 * Effective module state, and the one rule that makes overrides safe: a tenant
 * override can restrict what the plan sells but it can never grant what the plan
 * does not include. Accepting such a write would put the product out of step
 * with what the customer is paying for.
 */
describe('TenantModulesService', () => {
  function build(items: Array<Record<string, unknown>>) {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          name: 'Maseer Group',
          slug: 'maseer',
          status: 'ACTIVE',
          customerAccountId: 'customer-1',
          ownerUserId: 'owner-1',
        }),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          plan: { id: 'plan-1', key: 'enterprise', name: 'Enterprise' },
        }),
      },
      tenantFeature: { upsert: jest.fn(), deleteMany: jest.fn() },
      platformUser: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({
          tenantFeature: { upsert: jest.fn(), deleteMany: jest.fn() },
        }),
      ),
    };
    const featureAccess = {
      getResolvedTenantFeatures: jest.fn().mockResolvedValue({
        items,
        enabledKeys: items
          .filter((item) => item.isEnabled)
          .map((item) => item.key),
      }),
    };
    const service = new TenantModulesService(
      prisma as never,
      featureAccess as never,
      { log: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    return { service, prisma, featureAccess };
  }

  const resolved = [
    {
      key: 'attendance',
      label: 'Attendance',
      description: 'Check-ins',
      isIncludedInPlan: true,
      isEnabled: true,
      tenantOverrideEnabled: null,
    },
    {
      key: 'payroll',
      label: 'Payroll',
      description: 'Payroll',
      isIncludedInPlan: false,
      isEnabled: false,
      tenantOverrideEnabled: null,
    },
    {
      key: 'leave',
      label: 'Leave',
      description: 'Leave',
      isIncludedInPlan: true,
      isEnabled: false,
      tenantOverrideEnabled: false,
    },
  ];

  it('labels each module with how its effective state was reached', async () => {
    const { service } = build(resolved);
    const view = await service.list(platformUser, 'tenant-1');

    expect(view.modules.find((item) => item.key === 'attendance')!.state).toBe(
      'ENABLED_BY_PLAN',
    );
    expect(view.modules.find((item) => item.key === 'payroll')!.state).toBe(
      'DISABLED_BY_PLAN',
    );
    expect(view.modules.find((item) => item.key === 'leave')!.state).toBe(
      'DISABLED_BY_OVERRIDE',
    );
    expect(view.enabledCount).toBe(1);
    expect(view.overrideCount).toBe(1);
    expect(view.plan?.name).toBe('Enterprise');
  });

  it('marks a module the plan excludes as not enableable', async () => {
    const { service } = build(resolved);
    const view = await service.list(platformUser, 'tenant-1');
    expect(view.modules.find((item) => item.key === 'payroll')!.canEnable).toBe(
      false,
    );
  });

  it('refuses an override that would enable a module the plan does not include', async () => {
    const { service, prisma } = build(resolved);

    await expect(
      service.update(platformUser, 'tenant-1', {
        overrides: [{ key: 'payroll', isEnabled: true }],
      }),
    ).rejects.toThrow(/does not include payroll/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown module key before touching the database', async () => {
    const { service, prisma } = build(resolved);

    await expect(
      service.update(platformUser, 'tenant-1', {
        overrides: [{ key: 'teleportation', isEnabled: false }],
      }),
    ).rejects.toThrow(/Unknown module/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports no plan entitlement while the subscription is not live', async () => {
    const { service, prisma } = build(resolved);
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'CANCELLED',
      plan: { id: 'plan-1', key: 'enterprise', name: 'Enterprise' },
    });

    const view = await service.list(platformUser, 'tenant-1');
    expect(view.planEntitlementActive).toBe(false);
    expect(view.subscriptionStatus).toBe('CANCELLED');
  });
});
