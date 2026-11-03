import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { SuperAdminService } from './super-admin.service';

/*
 * DP-QA-052. The entitlement enforcement mode decides whether a plan is a boundary
 * or a suggestion, and a change to it used to leave no trace of who made it or what
 * it was before. Every change through the platform settings write path is now an
 * audit row (actor, previous value, new value), written in the same transaction.
 */
describe('SuperAdminService.updatePlatformSettings audits the entitlement enforcement mode', () => {
  const stored: { value: Record<string, unknown> | null } = { value: null };
  const tx = {
    platformSetting: {
      findUnique: jest.fn(async () =>
        stored.value ? { key: 'module-settings', value: stored.value } : null,
      ),
      upsert: jest.fn(async () => ({})),
    },
  };
  const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const auditService = { log: jest.fn() };

  const service = new SuperAdminService(
    prisma as never,
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
    {} as never,
    {} as never,
    auditService as never,
    {} as never,
    {} as never,
  );

  const actor: AuthenticatedUser = {
    userId: 'platform-user-1',
    tenantId: 'platform',
    email: 'admin@dijipeople.local',
    roleIds: ['SUPER_ADMIN'],
    roleKeys: ['SUPER_ADMIN'],
    permissionKeys: ['platform.*'],
    platform: { id: 'platform-user-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    stored.value = null;
    jest
      .spyOn(service, 'getPlatformSettings')
      .mockResolvedValue({} as never);
  });

  const update = (moduleSettings: Record<string, unknown>) =>
    service.updatePlatformSettings(actor, { moduleSettings } as never);

  it('records actor, previous and new value when the mode changes', async () => {
    stored.value = { exportEnabled: true, entitlementEnforcement: 'REPORT_ONLY' };

    await update({ entitlementEnforcement: 'ENFORCE' });

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: 'platform-user-1',
        action: 'ENTITLEMENT_ENFORCEMENT_CHANGED',
        entityType: 'PlatformSetting',
        entityId: 'module-settings',
        beforeSnapshot: { entitlementEnforcement: 'REPORT_ONLY' },
        afterSnapshot: { entitlementEnforcement: 'ENFORCE' },
      }),
      tx,
    );
  });

  it('records the first write of the mode (previous value null)', async () => {
    await update({ entitlementEnforcement: 'ENFORCE' });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeSnapshot: { entitlementEnforcement: null },
        afterSnapshot: { entitlementEnforcement: 'ENFORCE' },
      }),
      tx,
    );
  });

  it('writes no audit row when an unrelated module setting changes', async () => {
    stored.value = { exportEnabled: true, entitlementEnforcement: 'ENFORCE' };

    await update({ defaultPageSize: 50 });

    expect(tx.platformSetting.upsert).toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('writes no audit row when the mode is re-saved with the same value', async () => {
    stored.value = { entitlementEnforcement: 'ENFORCE' };

    await update({ entitlementEnforcement: 'ENFORCE' });

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('keeps the stored mode when only other keys are patched (merge)', async () => {
    stored.value = { entitlementEnforcement: 'ENFORCE', exportEnabled: true };

    await update({ exportEnabled: false });

    expect(tx.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          value: { entitlementEnforcement: 'ENFORCE', exportEnabled: false },
        }),
      }),
    );
  });
});
