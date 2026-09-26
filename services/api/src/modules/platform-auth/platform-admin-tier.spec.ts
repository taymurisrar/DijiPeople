import { PlatformUserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  isPlatformAdminTier,
  platformAccessForRole,
  userHasPlatformPermission,
} from './platform-permissions';

/*
 * ITEM-0204. Six authorization decisions compared platform role literals after
 * ADR-0018 moved everything else to permission keys. They now read
 * `platform.administer`, `leads.manage` and `platform.monitoring.administer`.
 * The holders must be exactly the roles the literal lists named — this is a
 * refactor of how access is decided, not a change to who has it.
 */
function platformUser(role: PlatformUserRole): AuthenticatedUser {
  return {
    userId: `user-${role}`,
    tenantId: 'platform',
    roleIds: [],
    roleKeys: platformAccessForRole(role).roleKeys,
    permissionKeys: platformAccessForRole(role).permissionKeys,
    platform: { id: `user-${role}`, role, status: 'ACTIVE' },
  } as unknown as AuthenticatedUser;
}

const ALL_ROLES = Object.values(PlatformUserRole);

function holders(test: (user: AuthenticatedUser) => boolean) {
  return ALL_ROLES.filter((role) => test(platformUser(role))).sort();
}

describe('ITEM-0204 permission-based tiers keep their holders', () => {
  it('the administrator tier is SUPER_ADMIN, the PLATFORM_OWNER alias and PLATFORM_ADMIN', () => {
    expect(holders(isPlatformAdminTier)).toEqual(
      [
        PlatformUserRole.PLATFORM_ADMIN,
        PlatformUserRole.PLATFORM_OWNER,
        PlatformUserRole.SUPER_ADMIN,
      ].sort(),
    );
  });

  it('managing any lead is the four roles the lead tier named', () => {
    expect(
      holders((user) => userHasPlatformPermission(user, 'leads.manage')),
    ).toEqual(
      [
        PlatformUserRole.PLATFORM_ADMIN,
        PlatformUserRole.PLATFORM_OWNER,
        PlatformUserRole.PRESALES_MANAGER,
        PlatformUserRole.SUPER_ADMIN,
      ].sort(),
    );
  });

  it('platform log files stay SUPER_ADMIN (and the alias) only', () => {
    expect(
      holders((user) =>
        userHasPlatformPermission(user, 'platform.monitoring.administer'),
      ),
    ).toEqual(
      [PlatformUserRole.PLATFORM_OWNER, PlatformUserRole.SUPER_ADMIN].sort(),
    );
  });

  it('a tenant user carrying the same keys is never in the tier', () => {
    const tenantUser = {
      userId: 'tenant-user',
      tenantId: 'tenant-1',
      roleIds: [],
      roleKeys: ['system-admin', 'SUPER_ADMIN'],
      permissionKeys: ['platform.administer', 'platform.*'],
    } as unknown as AuthenticatedUser;
    expect(isPlatformAdminTier(tenantUser)).toBe(false);
  });
});
