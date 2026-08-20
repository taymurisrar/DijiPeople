import { PlatformUserRole } from '@prisma/client';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  hasPlatformPermission,
  platformAccessForRole,
  PlatformPermissionsGuard,
  resolvePlatformPermission,
  userHasPlatformPermission,
} from './platform-permissions';
import { SuperAdminController } from '../super-admin/super-admin.controller';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../common/interfaces/authenticated-request.interface';

describe('platform operational role permissions', () => {
  it('grants full access to the owner while retaining signed-record rules in domain services', () => {
    expect(
      hasPlatformPermission(PlatformUserRole.PLATFORM_OWNER, 'roles.manage'),
    ).toBe(true);
    expect(
      platformAccessForRole(PlatformUserRole.PLATFORM_OWNER).roleKeys,
    ).toContain('system-admin');
  });

  /*
   * These are guard aliases for one role, not a list of roles. A duplicate is
   * harmless to a guard and highly visible to a person: Platform Admin rendered
   * the raw list on the Security page and in the account menu, so
   * `SUPER_ADMIN, super-admin, SUPER_ADMIN, system-admin` read as four roles.
   */
  it('emits each guard alias once per role', () => {
    for (const role of Object.values(PlatformUserRole)) {
      const { roleKeys } = platformAccessForRole(role);
      expect([role, new Set(roleKeys).size]).toEqual([role, roleKeys.length]);
    }
  });

  it('lists the role itself first, so a display that takes one is correct', () => {
    for (const role of Object.values(PlatformUserRole)) {
      expect(platformAccessForRole(role).roleKeys[0]).toBe(role);
    }
  });

  it('keeps the aliases every guard convention actually checks for', () => {
    /* Removing one of these silently locks a role out of a guard. */
    expect(
      platformAccessForRole(PlatformUserRole.PLATFORM_OWNER).roleKeys,
    ).toEqual(
      expect.arrayContaining([
        'PLATFORM_OWNER',
        'platform-owner',
        'SUPER_ADMIN',
        'system-admin',
      ]),
    );
    expect(platformAccessForRole(PlatformUserRole.MEMBER).roleKeys).toEqual(
      expect.arrayContaining(['MEMBER', 'member', 'system-customizer']),
    );
    expect(
      platformAccessForRole(PlatformUserRole.SUPPORT_AGENT).roleKeys,
    ).toEqual(['SUPPORT_AGENT', 'support-agent']);
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

const tenantSubject = (permissionKeys: string[]): AuthenticatedUser =>
  ({
    userId: 'tenant-user',
    tenantId: 'tenant-a',
    roleIds: [],
    roleKeys: ['system-admin'],
    permissionKeys,
    rolePrivileges: [],
  }) as unknown as AuthenticatedUser;

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
    platform: { id: 'platform-user', role },
  }) as unknown as AuthenticatedUser;

describe('who may hold a platform permission', () => {
  /*
   * BUG-0071. Six tenant permission key names collide exactly with platform
   * permission names. Before the fix the `permissionKeys` fallback read those
   * tenant keys and answered "yes", which is how a tenant administrator holding
   * the ordinary `system-admin` tenant role reached the platform console.
   */
  it.each([
    'settings.read',
    'settings.manage',
    'roles.manage',
    'billing.manage',
    'onboarding.read',
    'onboarding.create',
  ])('refuses a tenant subject holding the colliding key %s', (key) => {
    expect(userHasPlatformPermission(tenantSubject([key]), key as never)).toBe(
      false,
    );
  });

  it('refuses a tenant subject even when it holds the platform wildcard', () => {
    expect(
      userHasPlatformPermission(
        tenantSubject(['platform.*', 'tenants.read']),
        'tenants.read',
      ),
    ).toBe(false);
  });

  it('accepts a platform subject through its role', () => {
    expect(
      userHasPlatformPermission(
        platformSubject(PlatformUserRole.SUPER_ADMIN),
        'tenants.read',
      ),
    ).toBe(true);
  });

  it('accepts a platform subject through an explicit key when its role does not grant it', () => {
    /*
     * The fallback still exists for platform subjects — the fix scoped it, it
     * did not remove it. Removing it outright would lock the console out rather
     * than lock tenants out.
     */
    expect(
      userHasPlatformPermission(
        platformSubject(null, ['tenants.read']),
        'tenants.read',
      ),
    ).toBe(true);
  });

  it('refuses a platform subject holding neither the role nor the key', () => {
    expect(
      userHasPlatformPermission(
        platformSubject(null, ['dashboard.read']),
        'tenants.read',
      ),
    ).toBe(false);
  });
});

/*
 * Every super-admin route must map to a platform permission.
 *
 * `PlatformPermissionsGuard` allows a route that resolves no permission,
 * because refusing was what left `/operators`, `/feature-catalog` and
 * `/lifecycle-options` unreachable by the very operators they were built for.
 * That decision is only safe while "unmapped" cannot quietly grow — so this
 * enumerates the controller's own route metadata rather than a hand-written
 * list, and a route added later with no mapping fails here.
 */
describe('super-admin route coverage', () => {
  /*
   * Each route is read with its own HTTP verb from the controller's metadata.
   * Testing every path against every verb would assert things about requests
   * that cannot be made — a GET-only route has no POST to get wrong.
   */
  const HTTP_METHOD = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'ALL',
    'OPTIONS',
    'HEAD',
    'SEARCH',
  ];

  const routes = (): Array<{ method: string; path: string }> => {
    const proto = SuperAdminController.prototype as Record<string, unknown>;
    const found: Array<{ method: string; path: string }> = [];

    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const handler = proto[name];
      if (typeof handler !== 'function') continue;

      const path = Reflect.getMetadata(PATH_METADATA, handler) as
        | string
        | undefined;
      if (path === undefined) continue;

      const methodIndex = Reflect.getMetadata(METHOD_METADATA, handler) as
        | number
        | undefined;
      found.push({ method: HTTP_METHOD[methodIndex ?? 0] ?? 'GET', path });
    }
    return found;
  };

  const resolveFor = (method: string, path: string) => {
    const full = `/super-admin/${path}`.replace(/\/+/g, '/');
    return resolvePlatformPermission({
      method,
      route: { path: full },
      path: full,
      url: full,
      body: {},
    } as unknown as AuthenticatedRequest);
  };

  it('finds the controller routes at all', () => {
    /* Without this the suite could pass vacuously while asserting nothing. */
    expect(routes().length).toBeGreaterThan(20);
  });

  it('reads a plausible spread of verbs from the metadata', () => {
    /* If METHOD_METADATA stopped resolving, everything would read as GET and
     * the mutation test below would go quiet. */
    const verbs = new Set(routes().map((route) => route.method));
    expect([...verbs].sort()).toEqual(
      expect.arrayContaining(['DELETE', 'GET', 'PATCH', 'POST']),
    );
  });

  it('maps every route to a platform permission', () => {
    /* The guard refuses an unresolved permission, so a gap here is a route
     * nobody can reach — which is how BUG-0071 left four routes 403 for the
     * platform operators they were built for. */
    const unmapped = routes()
      .filter(({ method, path }) => resolveFor(method, path) === null)
      .map(({ method, path }) => `${method} ${path}`);

    expect(unmapped).toEqual([]);
  });

  it('never satisfies a mutating route with a read permission', () => {
    /* BUG-0072. The plans, invoices, subscriptions and payments branches
     * ignored the method and returned the read permission for every verb, so a
     * role holding only `*.read` passed authorization on writes. */
    const readMapped = routes()
      .filter(({ method }) => method !== 'GET')
      .map(({ method, path }) => ({
        label: `${method} ${path}`,
        permission: resolveFor(method, path),
      }))
      .filter((entry) => entry.permission?.endsWith('.read'))
      .map((entry) => `${entry.label} -> ${entry.permission}`);

    expect(readMapped).toEqual([]);
  });

  it('refuses the read-only auditor on the plan catalog it could once rewrite', () => {
    const auditor = platformSubject(PlatformUserRole.READ_ONLY_AUDITOR);

    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const permission = resolveFor(method, 'plans/:planId/prices/:priceId');
      expect([method, permission]).toEqual([method, 'plans.manage']);
      expect([
        method,
        userHasPlatformPermission(auditor, permission as never),
      ]).toEqual([method, false]);
    }
  });

  it('still lets the platform admin administer plans', () => {
    expect(
      userHasPlatformPermission(
        platformSubject(PlatformUserRole.PLATFORM_ADMIN),
        'plans.manage',
      ),
    ).toBe(true);
  });
});

describe('the platform boundary guard', () => {
  const guard = new PlatformPermissionsGuard();

  const contextFor = (user: AuthenticatedUser | undefined, path: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          method: 'GET',
          route: { path },
          path,
          url: path,
          body: {},
        }),
      }),
    }) as never;

  it('refuses a tenant subject on a platform route', () => {
    /*
     * BUG-0071, at the guard. The tenant subject below is exactly the demo
     * `system-admin`: the tenant role the controller's @RequireRoles accepts,
     * and a tenant permission key whose name matches the platform permission
     * the route resolves. Before the fix this returned true.
     */
    expect(() =>
      guard.canActivate(
        contextFor(
          tenantSubject(['tenants.read', 'settings.read']),
          '/super-admin/tenants',
        ),
      ),
    ).toThrow(/Platform access is required/);
  });

  it('refuses an unauthenticated request rather than reading it as internal', () => {
    expect(() =>
      guard.canActivate(contextFor(undefined, '/super-admin/tenants')),
    ).toThrow(/Platform access is required/);
  });

  it('admits a platform subject holding the permission', () => {
    expect(
      guard.canActivate(
        contextFor(
          platformSubject(PlatformUserRole.SUPER_ADMIN),
          '/super-admin/tenants',
        ),
      ),
    ).toBe(true);
  });

  it('admits a platform subject on the routes that used to 403 them', () => {
    /* /operators, /feature-catalog and /lifecycle-options resolved no
     * permission, so the guard threw at the people the console is for. */
    for (const path of [
      '/super-admin/operators',
      '/super-admin/feature-catalog',
      '/super-admin/lifecycle-options',
      '/super-admin/tenant-slug/availability',
    ]) {
      expect([
        path,
        guard.canActivate(
          contextFor(platformSubject(PlatformUserRole.READ_ONLY_AUDITOR), path),
        ),
      ]).toEqual([path, true]);
    }
  });

  it('still refuses a platform subject that lacks the route permission', () => {
    expect(() =>
      guard.canActivate(
        contextFor(
          platformSubject(PlatformUserRole.SUPPORT_AGENT),
          '/super-admin/plans',
        ),
      ),
    ).toThrow(/do not have permission/);
  });
});
