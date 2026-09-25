import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformUserRole } from '@prisma/client';
import { RequireRoles } from '../decorators/require-roles.decorator';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import { platformAccessForRole } from '../../modules/platform-auth/platform-permissions';
import { RolesGuard } from './roles.guard';

/*
 * ADR-0018 decision 2: Super Admin is the widest permission set, not a bypass,
 * and a platform subject is never decided by a tenant role key. RolesGuard used
 * to return true for the literal SUPER_ADMIN and for MEMBER on its
 * `system-customizer` alias.
 */
class Gated {
  @RequireRoles('system-admin', 'system-customizer')
  handler() {
    return undefined;
  }

  open() {
    return undefined;
  }
}

// Read off the prototype without binding, exactly as Nest hands it to a guard.
const method = (name: 'handler' | 'open') =>
  (Gated.prototype as unknown as Record<string, () => unknown>)[name];

describe('RolesGuard is tenant-only (ADR-0018)', () => {
  const guard = new RolesGuard(new Reflector());
  const contextFor = (user: AuthenticatedUser, handler: () => unknown) =>
    ({
      getHandler: () => handler,
      getClass: () => Gated,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as never;

  const platformUser = (role: PlatformUserRole) => {
    const access = platformAccessForRole(role);
    return {
      userId: `platform-${role}`,
      tenantId: 'platform',
      roleKeys: access.roleKeys,
      permissionKeys: access.permissionKeys,
      platform: { id: `platform-${role}`, role, status: 'ACTIVE' },
    } as unknown as AuthenticatedUser;
  };

  it.each([
    PlatformUserRole.SUPER_ADMIN,
    PlatformUserRole.PLATFORM_OWNER,
    PlatformUserRole.MEMBER,
  ])(
    'refuses a %s platform subject on a role-gated route, aliases notwithstanding',
    (role) => {
      expect(() =>
        guard.canActivate(contextFor(platformUser(role), method('handler'))),
      ).toThrow(ForbiddenException);
    },
  );

  it('still admits a tenant user holding a required role', () => {
    const tenantUser = {
      userId: 'tenant-user',
      tenantId: 'tenant-a',
      roleKeys: ['system-admin'],
    } as unknown as AuthenticatedUser;
    expect(guard.canActivate(contextFor(tenantUser, method('handler')))).toBe(
      true,
    );
  });

  it('still refuses a tenant user without one', () => {
    const tenantUser = {
      userId: 'tenant-user',
      tenantId: 'tenant-a',
      roleKeys: ['employee'],
    } as unknown as AuthenticatedUser;
    expect(() =>
      guard.canActivate(contextFor(tenantUser, method('handler'))),
    ).toThrow(ForbiddenException);
  });

  it('does nothing on a route that declares no roles', () => {
    expect(
      guard.canActivate(
        contextFor(
          platformUser(PlatformUserRole.READ_ONLY_AUDITOR),
          method('open'),
        ),
      ),
    ).toBe(true);
  });
});
