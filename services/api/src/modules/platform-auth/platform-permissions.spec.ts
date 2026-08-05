import { PlatformUserRole } from '@prisma/client';
import {
  hasPlatformPermission,
  platformAccessForRole,
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
});
