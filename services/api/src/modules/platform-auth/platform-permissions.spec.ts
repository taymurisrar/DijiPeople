import { PlatformUserRole } from '@prisma/client';
import {
  hasPlatformPermission,
  platformAccessForRole,
  resolvePlatformPermission,
} from './platform-permissions';

describe('platform operational role permissions', () => {
  it('grants full access to the owner while retaining signed-record rules in domain services', () => {
    expect(
      hasPlatformPermission(PlatformUserRole.PLATFORM_OWNER, 'roles.manage'),
    ).toBe(true);
    expect(
      platformAccessForRole(PlatformUserRole.PLATFORM_OWNER).roleKeys,
    ).toContain('system-admin');
  });

  it('separates support, contracts, monitoring, and presales duties', () => {
    expect(
      hasPlatformPermission(PlatformUserRole.SUPPORT_AGENT, 'support.manage'),
    ).toBe(true);
    expect(
      hasPlatformPermission(PlatformUserRole.SUPPORT_AGENT, 'contracts.manage'),
    ).toBe(false);
    expect(
      hasPlatformPermission(
        PlatformUserRole.LEGAL_REVIEWER,
        'contracts.approve',
      ),
    ).toBe(true);
    expect(
      hasPlatformPermission(
        PlatformUserRole.MONITORING_OPERATOR,
        'monitoring.manage',
      ),
    ).toBe(true);
    expect(
      hasPlatformPermission(PlatformUserRole.PRESALES_USER, 'leads.update'),
    ).toBe(true);
  });

  it('keeps the auditor read-only', () => {
    expect(
      hasPlatformPermission(PlatformUserRole.READ_ONLY_AUDITOR, 'support.read'),
    ).toBe(true);
    expect(
      hasPlatformPermission(
        PlatformUserRole.READ_ONLY_AUDITOR,
        'support.manage',
      ),
    ).toBe(false);
    expect(
      hasPlatformPermission(
        PlatformUserRole.READ_ONLY_AUDITOR,
        'contracts.manage',
      ),
    ).toBe(false);
  });

  it('lets platform admins manage settings without exposing credential rotation', () => {
    expect(
      hasPlatformPermission(
        PlatformUserRole.PLATFORM_ADMIN,
        'settings.appearance.manage',
      ),
    ).toBe(true);
    expect(
      hasPlatformPermission(
        PlatformUserRole.PLATFORM_ADMIN,
        'settings.email.manage',
      ),
    ).toBe(true);
    expect(
      hasPlatformPermission(
        PlatformUserRole.PLATFORM_ADMIN,
        'settings.email.credentials',
      ),
    ).toBe(false);
  });

  it('routes appearance-only writes through the fine-grained permission', () => {
    expect(
      resolvePlatformPermission({
        method: 'PATCH',
        path: '/super-admin/platform-settings',
        body: { branding: { themePreset: 'ocean' } },
      } as never),
    ).toBe('settings.appearance.manage');
    expect(
      resolvePlatformPermission({
        method: 'PATCH',
        path: '/super-admin/platform-settings',
        body: {
          branding: { themePreset: 'ocean' },
          platformDefaults: {},
        },
      } as never),
    ).toBe('settings.manage');
  });

  it('routes promotion and Stripe health actions through billing permissions', () => {
    expect(
      resolvePlatformPermission({
        method: 'GET',
        path: '/super-admin/promotions/targets',
      } as never),
    ).toBe('billing.read');
    expect(
      resolvePlatformPermission({
        method: 'DELETE',
        path: '/super-admin/promotions/promotion-id',
      } as never),
    ).toBe('billing.manage');
    expect(
      resolvePlatformPermission({
        method: 'POST',
        path: '/super-admin/billing/test-stripe-connection',
      } as never),
    ).toBe('billing.manage');
  });
});
