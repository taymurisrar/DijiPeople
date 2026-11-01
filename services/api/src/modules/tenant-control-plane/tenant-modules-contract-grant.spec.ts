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

/*
 * DP-QA-042 - Custom (the `enterprise-plus` contract plan) gets the desktop
 * agent and white-label e-mail only by explicit grant. The grant is a CUSTOM
 * `TenantFeature` row written through the existing tenant-modules control plane;
 * no other plan can be granted them, and withdrawing the agent ends its sessions.
 */
function item(
  key: string,
  included: boolean,
  enabled: boolean,
  override: boolean | null = null,
) {
  return {
    key,
    label: key,
    description: key,
    isIncludedInPlan: included,
    isEnabled: enabled,
    tenantOverrideEnabled: override,
    tenantOverrideSource: override === null ? null : 'CUSTOM',
  };
}

function build(planKey: string, before: unknown[], after: unknown[] = before) {
  const upsert = jest.fn();
  const deleteMany = jest.fn();
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        name: 'Acme',
        slug: 'acme',
        status: 'ACTIVE',
        customerAccountId: 'c1',
        ownerUserId: 'o1',
      }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        plan: { id: 'p', key: planKey, name: planKey },
      }),
    },
    platformUser: { findUnique: jest.fn().mockResolvedValue(null) },
    agentRefreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({ tenantFeature: { upsert, deleteMany } }),
    ),
  };
  const featureAccess = {
    getResolvedTenantFeatures: jest
      .fn()
      .mockResolvedValueOnce({ items: before, enabledKeys: [] })
      .mockResolvedValue({ items: after, enabledKeys: [] }),
  };
  const entitlements = { invalidate: jest.fn() };
  const service = new TenantModulesService(
    prisma as never,
    featureAccess as never,
    { log: jest.fn() } as never,
    { record: jest.fn() } as never,
    entitlements as never,
  );
  return { service, prisma, upsert, deleteMany, entitlements };
}

describe('Custom contract explicit grants (DP-QA-042)', () => {
  const notGranted = [
    item('desktop-agent', false, false),
    item('email-white-label', false, false),
  ];

  it.each(['desktop-agent', 'email-white-label'])(
    'stores an explicit %s grant on the contract plan as source CUSTOM',
    async (key) => {
      const { service, upsert, entitlements } = build(
        'enterprise-plus',
        notGranted,
        [item(key, false, true, true)],
      );

      await service.update(platformUser, 'tenant-1', {
        overrides: [{ key, isEnabled: true }],
        reason: 'Signed contract 42',
      });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            key,
            isEnabled: true,
            source: 'CUSTOM',
          }) as unknown,
          update: expect.objectContaining({
            isEnabled: true,
            source: 'CUSTOM',
          }) as unknown,
        }),
      );
      expect(entitlements.invalidate).toHaveBeenCalledWith('tenant-1');
    },
  );

  it.each(['starter', 'growth', 'enterprise'])(
    'refuses to grant the agent beyond the %s plan',
    async (planKey) => {
      const { service, upsert } = build(planKey, [
        item('desktop-agent', false, false),
      ]);

      await expect(
        service.update(platformUser, 'tenant-1', {
          overrides: [{ key: 'desktop-agent', isEnabled: true }],
        }),
      ).rejects.toThrow(/does not include/);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('does not let the contract plan grant a non-optional module beyond the plan', async () => {
    const { service, upsert } = build('enterprise-plus', [
      item('payroll', false, false),
    ]);

    await expect(
      service.update(platformUser, 'tenant-1', {
        overrides: [{ key: 'payroll', isEnabled: true }],
      }),
    ).rejects.toThrow(/does not include/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('offers the grant in the module view only on the contract plan', async () => {
    const onContract = await build('enterprise-plus', notGranted).service.list(
      platformUser,
      'tenant-1',
    );
    const onGrowth = await build('growth', notGranted).service.list(
      platformUser,
      'tenant-1',
    );

    expect(
      onContract.modules.find((m) => m.key === 'desktop-agent')?.canEnable,
    ).toBe(true);
    expect(
      onGrowth.modules.find((m) => m.key === 'desktop-agent')?.canEnable,
    ).toBe(false);
  });

  it("revokes the tenant's agent sessions the moment the agent is withdrawn", async () => {
    const { service, prisma } = build(
      'enterprise-plus',
      [item('desktop-agent', false, true, true)],
      [item('desktop-agent', false, false)],
    );

    await service.update(platformUser, 'tenant-1', {
      overrides: [{ key: 'desktop-agent', isEnabled: null }],
    });

    expect(prisma.agentRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });

  it('does not touch agent sessions when the agent stays on', async () => {
    const { service, prisma } = build(
      'enterprise',
      [item('desktop-agent', true, true)],
      [item('desktop-agent', true, true)],
    );

    await service.update(platformUser, 'tenant-1', { overrides: [] });

    expect(prisma.agentRefreshToken.updateMany).not.toHaveBeenCalled();
  });
});
