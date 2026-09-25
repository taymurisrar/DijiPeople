import { PlatformUserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import {
  declaredPlatformPermission,
  PlatformPermissionsGuard,
  userHasPlatformPermission,
} from '../platform-auth/platform-permissions';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformAuditController } from './platform-audit.controller';

/*
 * BUG-3564. `PlatformAuditController` is guarded by `PlatformPermissionsGuard`
 * with a declared `monitoring.read` permission on both handlers — the same
 * mechanism ADR-0018's narrow `platform.*` keys use, chosen here because
 * `monitoring.read` is already held by every audit-facing role and by no
 * commercial/presales role. This pins that choice directly: the acceptance
 * criteria named in BUG-3564 ("a role without audit read permission is
 * refused", "a tenant user can never reach the platform audit trail") plus
 * the roles the bug asked for by name (READ_ONLY_AUDITOR, SUPPORT_MANAGER,
 * MONITORING_OPERATOR).
 */

const platformSubject = (
  role: PlatformUserRole | null,
  permissionKeys: string[] = [],
): AuthenticatedUser =>
  ({
    userId: 'platform-user',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys,
    rolePrivileges: [],
    authSubjectType: 'platform-user',
    platform: { id: 'platform-user', role, status: 'ACTIVE' },
  }) as unknown as AuthenticatedUser;

const tenantSubject = (permissionKeys: string[]): AuthenticatedUser =>
  ({
    userId: 'tenant-user',
    tenantId: 'tenant-a',
    roleIds: [],
    roleKeys: ['system-admin'],
    permissionKeys,
    rolePrivileges: [],
  }) as unknown as AuthenticatedUser;

const reflector = new Reflector();

describe('PlatformAuditController declares monitoring.read on every route', () => {
  it.each(['list', 'detail'] as const)(
    'declares monitoring.read on %s',
    (handlerName) => {
      const handler = (
        PlatformAuditController.prototype as unknown as Record<
          string,
          (...args: unknown[]) => unknown
        >
      )[handlerName];
      const context = {
        getHandler: () => handler,
        getClass: () => PlatformAuditController,
      } as never;

      expect(declaredPlatformPermission(reflector, context)).toBe(
        'monitoring.read',
      );
    },
  );
});

describe('who may read the platform audit trail (BUG-3564 acceptance criteria)', () => {
  it.each([
    PlatformUserRole.SUPER_ADMIN,
    PlatformUserRole.PLATFORM_OWNER,
    PlatformUserRole.PLATFORM_ADMIN,
    PlatformUserRole.PLATFORM_OPERATIONS,
    PlatformUserRole.READ_ONLY_AUDITOR,
    PlatformUserRole.SUPPORT_MANAGER,
    PlatformUserRole.SUPPORT_AGENT,
    PlatformUserRole.MONITORING_OPERATOR,
  ])('admits %s', (role) => {
    expect(
      userHasPlatformPermission(platformSubject(role), 'monitoring.read'),
    ).toBe(true);
  });

  it.each([
    PlatformUserRole.PRESALES_MANAGER,
    PlatformUserRole.PRESALES_USER,
    PlatformUserRole.PARTNER_MANAGER,
    PlatformUserRole.CONTRACT_MANAGER,
    PlatformUserRole.LEGAL_REVIEWER,
    PlatformUserRole.FINANCE_MANAGER,
    PlatformUserRole.BILLING_USER,
  ])('refuses %s — a role without audit read permission is refused', (role) => {
    expect(
      userHasPlatformPermission(platformSubject(role), 'monitoring.read'),
    ).toBe(false);
  });

  it('a tenant user can never reach the platform audit trail, even holding the colliding tenant key', () => {
    // `monitoring.read` collides with no tenant permission constant, but the
    // guard clause in `userHasPlatformPermission` (BUG-0071) is what actually
    // decides this: no `platform.id` means refused, whatever keys are held.
    expect(
      userHasPlatformPermission(
        tenantSubject(['monitoring.read', 'audit.read']),
        'monitoring.read',
      ),
    ).toBe(false);
  });
});

describe('the platform boundary guard on PlatformAuditController', () => {
  const guard = new PlatformPermissionsGuard(reflector);

  const contextFor = (
    user: AuthenticatedUser | undefined,
    handlerName: string,
  ) => {
    const handler = (
      PlatformAuditController.prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >
    )[handlerName];
    return {
      getHandler: () => handler,
      getClass: () => PlatformAuditController,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          method: 'GET',
          route: { path: '/platform/audit-logs' },
          path: '/platform/audit-logs',
          url: '/platform/audit-logs',
          body: {},
        }),
      }),
    } as never;
  };

  it('refuses a tenant subject outright', () => {
    expect(() =>
      guard.canActivate(contextFor(tenantSubject(['audit.read']), 'list')),
    ).toThrow(/Platform access is required/);
  });

  it('refuses an unauthenticated request', () => {
    expect(() => guard.canActivate(contextFor(undefined, 'list'))).toThrow(
      /Platform access is required/,
    );
  });

  it('admits READ_ONLY_AUDITOR — the role BUG-3564 was written for', () => {
    expect(
      guard.canActivate(
        contextFor(platformSubject(PlatformUserRole.READ_ONLY_AUDITOR), 'list'),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        contextFor(
          platformSubject(PlatformUserRole.READ_ONLY_AUDITOR),
          'detail',
        ),
      ),
    ).toBe(true);
  });

  it('refuses a platform subject that lacks monitoring.read', () => {
    expect(() =>
      guard.canActivate(
        contextFor(platformSubject(PlatformUserRole.PRESALES_MANAGER), 'list'),
      ),
    ).toThrow(/do not have permission/);
  });
});
