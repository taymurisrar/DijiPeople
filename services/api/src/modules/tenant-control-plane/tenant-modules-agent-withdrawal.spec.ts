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
 * A tenant override can never grant a capability the tenant's plan does not include
 * (custom plans included), and withdrawing the Desktop Agent ends its sessions.
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
    tenantOverrideSource: override === null ? null : 'MANUAL',
  };
}

function build(planKey: string, before: unknown[], after: unknown[] = before) {
  const upsert = jest.fn();
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
      work({ tenantFeature: { upsert, deleteMany: jest.fn() } }),
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
  return { service, prisma, upsert, entitlements };
}

describe('tenant modules: plan cap and agent withdrawal', () => {
  it.each(['desktop-agent', 'email-white-label'])(
    'refuses to switch %s on when the plan does not include it',
    async (key) => {
      const { service, upsert } = build('acme-custom', [
        item(key, false, false),
      ]);

      await expect(
        service.update(platformUser, 'tenant-1', {
          overrides: [{ key, isEnabled: true }],
        }),
      ).rejects.toThrow(/does not include/);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('revokes the tenant agent sessions the moment the agent is withdrawn', async () => {
    const { service, prisma, entitlements } = build(
      'acme-custom',
      [item('desktop-agent', true, true)],
      [item('desktop-agent', true, false, false)],
    );

    await service.update(platformUser, 'tenant-1', {
      overrides: [{ key: 'desktop-agent', isEnabled: false }],
    });

    expect(entitlements.invalidate).toHaveBeenCalledWith('tenant-1');
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
