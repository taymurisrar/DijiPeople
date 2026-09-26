import { PlatformUserRole } from '@prisma/client';
import type { ExecutionContext } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  hasPlatformPermission,
  platformAccessForRole,
  PlatformPermissionsGuard,
  declaredPlatformPermission,
  resolvePlatformPermission,
  userHasPlatformPermission,
  type PlatformPermission,
} from './platform-permissions';
import { REQUIRED_ROLES_KEY } from '../../common/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminLeadsController } from '../leads/admin-leads.controller';
import { AdminLegalController } from '../legal/admin-legal.controller';
import { DemoDataController } from '../demo-data/demo-data.controller';
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

  const contextFor = (
    user: AuthenticatedUser | undefined,
    path: string,
    handler: (...args: unknown[]) => unknown = () => undefined,
    controller: object = class Undecorated {},
    method = 'GET',
  ) =>
    ({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          method,
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

/*
 * ADR-0018 — platform routes are decided by platform permission only.
 *
 * Four controllers used to stack `RolesGuard` + `@RequireRoles(<tenant role
 * key>)` on top of `PlatformPermissionsGuard`. This block enumerates every route
 * on all four from the controllers' own metadata, computes the permission the
 * guard will actually require (a declared `@RequirePlatformPermission`, else the
 * path-derived one), and pins three things:
 *
 *   1. no route is unmapped, and none still carries role metadata;
 *   2. the routes that are SUPER_ADMIN-only are exactly the ones listed below —
 *      a route cannot drift into or out of that set unnoticed;
 *   3. the narrow keys are held by no role but SUPER_ADMIN and the
 *      PLATFORM_OWNER alias.
 */
describe('ADR-0018 platform route authorization', () => {
  const controllers: Array<{ name: string; type: object }> = [
    { name: 'SuperAdminController', type: SuperAdminController },
    { name: 'AdminLeadsController', type: AdminLeadsController },
    { name: 'AdminLegalController', type: AdminLegalController },
    { name: 'DemoDataController', type: DemoDataController },
  ];

  const VERBS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS'];
  const reflector = new Reflector();

  type Route = {
    controller: string;
    handler: string;
    method: string;
    path: string;
    permission: PlatformPermission | null;
    roleMetadata: unknown;
  };

  const allRoutes = (): Route[] => {
    const found: Route[] = [];
    for (const { name, type } of controllers) {
      const base = Reflect.getMetadata(PATH_METADATA, type) as string;
      const proto = (type as { prototype: Record<string, unknown> }).prototype;
      for (const handlerName of Object.getOwnPropertyNames(proto)) {
        if (handlerName === 'constructor') continue;
        const handler = proto[handlerName];
        if (typeof handler !== 'function') continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as
          | string
          | undefined;
        if (sub === undefined) continue;
        const method =
          VERBS[Reflect.getMetadata(METHOD_METADATA, handler) as number] ??
          'GET';
        const path = `/${base}/${sub}`
          .replace(/\/+/g, '/')
          .replace(/(.)\/$/, '$1');
        const context = {
          getHandler: () => handler,
          getClass: () => type,
        } as unknown as ExecutionContext;
        const permission =
          declaredPlatformPermission(reflector, context) ??
          resolvePlatformPermission({
            method,
            route: { path },
            path,
            url: path,
            body: {},
          } as unknown as AuthenticatedRequest);
        found.push({
          controller: name,
          handler: handlerName,
          method,
          path,
          permission,
          roleMetadata: reflector.getAllAndOverride(REQUIRED_ROLES_KEY, [
            handler as () => unknown,
            type as () => unknown,
          ]),
        });
      }
    }
    return found;
  };

  const ALL_ROLES = Object.values(PlatformUserRole);
  const allowedRoles = (permission: PlatformPermission | null) =>
    permission
      ? ALL_ROLES.filter((role) => hasPlatformPermission(role, permission))
      : [];

  it('enumerates routes on all four controllers', () => {
    const byController = new Set(allRoutes().map((route) => route.controller));
    expect([...byController].sort()).toEqual(
      controllers.map((c) => c.name).sort(),
    );
    expect(allRoutes().length).toBeGreaterThan(90);
  });

  it('maps every route to a platform permission', () => {
    expect(
      allRoutes()
        .filter((route) => route.permission === null)
        .map((route) => `${route.method} ${route.path}`),
    ).toEqual([]);
  });

  it('leaves no tenant role-key gate on any platform route', () => {
    /* A `@RequireRoles` left behind would be read by nothing now that
     * RolesGuard is gone — it would look like a control and not be one. */
    expect(
      allRoutes()
        .filter((route) => route.roleMetadata !== undefined)
        .map((route) => `${route.controller}.${route.handler}`),
    ).toEqual([]);
    for (const { name, type } of controllers) {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, type) ??
        []) as unknown[];
      expect([name, guards]).toEqual([
        name,
        [JwtAuthGuard, PlatformPermissionsGuard],
      ]);
    }
  });

  it('keeps exactly the deliberately narrow routes SUPER_ADMIN-only', () => {
    const superAdminOnly = allRoutes()
      .filter((route) =>
        allowedRoles(route.permission).every(
          (role) =>
            role === PlatformUserRole.SUPER_ADMIN ||
            role === PlatformUserRole.PLATFORM_OWNER,
        ),
      )
      .map((route) => `${route.method} ${route.path} -> ${route.permission}`)
      .sort();

    expect(superAdminOnly).toEqual(SUPER_ADMIN_ONLY_ROUTES.slice().sort());
  });

  it('gives the narrow platform keys to SUPER_ADMIN and the PLATFORM_OWNER alias only', () => {
    for (const key of [
      'platform-users.manage',
      'platform.tenants.administer',
      'platform.billing.administer',
      'platform.legal.administer',
      'platform.demoData.delete',
    ] as PlatformPermission[]) {
      expect([key, allowedRoles(key)]).toEqual([
        key,
        [PlatformUserRole.SUPER_ADMIN, PlatformUserRole.PLATFORM_OWNER],
      ]);
    }
  });

  it('BUG-3544: admits PLATFORM_ADMIN, PLATFORM_OPERATIONS and MEMBER on the tenant profile edit route', () => {
    const route = allRoutes().find(
      (r) =>
        r.method === 'PATCH' && r.path === '/super-admin/tenants/:tenantId',
    );
    expect(route?.permission).toBe('tenants.update');
    const roles = allowedRoles(route?.permission ?? null);
    expect(roles).toEqual(
      expect.arrayContaining([
        PlatformUserRole.SUPER_ADMIN,
        PlatformUserRole.PLATFORM_OWNER,
        PlatformUserRole.PLATFORM_ADMIN,
        PlatformUserRole.PLATFORM_OPERATIONS,
        PlatformUserRole.MEMBER,
      ]),
    );
    expect(roles).not.toContain(PlatformUserRole.READ_ONLY_AUDITOR);
    expect(roles).not.toContain(PlatformUserRole.SUPPORT_AGENT);
  });

  it('enforces a declared permission over the path-derived one', () => {
    const guard = new PlatformPermissionsGuard(reflector);
    const handler = (
      AdminLegalController.prototype as unknown as Record<string, unknown>
    ).listDocuments as () => unknown;
    const context = (role: PlatformUserRole) =>
      ({
        getHandler: () => handler,
        getClass: () => AdminLegalController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: platformSubject(role),
            method: 'GET',
            route: { path: '/super-admin/legal/documents' },
            path: '/super-admin/legal/documents',
            url: '/super-admin/legal/documents',
            body: {},
          }),
        }),
      }) as never;

    // LEGAL_REVIEWER holds the path-derived `legal.read` and is still refused:
    // the controller declares `platform.legal.administer`.
    expect(() =>
      guard.canActivate(context(PlatformUserRole.LEGAL_REVIEWER)),
    ).toThrow(/do not have permission/);
    expect(guard.canActivate(context(PlatformUserRole.SUPER_ADMIN))).toBe(true);
  });
});

/*
 * Every route only `platform.*` can reach. The first fourteen repeated
 * `@RequireRoles('system-admin')` (SUPER_ADMIN and PLATFORM_OWNER only) before
 * ADR-0018; their allowed set is unchanged. Adding a route here, or removing
 * one, is an access decision and should be reviewed as one. The legacy
 * `PATCH /super-admin/tenants/:tenantId/status` was retired (ITEM-0204).
 */
const SUPER_ADMIN_ONLY_ROUTES = [
  'GET /super-admin/agent-assignments -> platform.tenants.administer',
  'PATCH /super-admin/tenants/:tenantId/agent-assignment -> platform.tenants.administer',
  'GET /super-admin/tenants/:tenantId/audit-logs -> platform.tenants.administer',
  'GET /super-admin/tenants/:tenantId/access-users -> platform.tenants.administer',
  'POST /super-admin/tenants/:tenantId/access-users -> platform.tenants.administer',
  'PATCH /super-admin/tenants/:tenantId/access-users/:userId -> platform.tenants.administer',
  'POST /super-admin/tenants/:tenantId/access-users/:userId/reset-activation -> platform.tenants.administer',
  'POST /super-admin/tenants/:tenantId/access-users/:userId/reset-password -> platform.tenants.administer',
  'GET /super-admin/tenants/:tenantId/invoices -> platform.billing.administer',
  'PATCH /super-admin/tenants/:tenantId/subscription -> platform.billing.administer',
  'GET /super-admin/invoices/:invoiceId/pdf -> platform.billing.administer',
  'POST /super-admin/invoices/:invoiceId/email -> platform.billing.administer',
  'PATCH /super-admin/invoices/:invoiceId/status -> platform.billing.administer',
  'POST /super-admin/subscriptions/:subscriptionId/invoices -> platform.billing.administer',
  // SuperAdminService.updateTenantSlug already refused everyone else.
  'PATCH /super-admin/tenants/:tenantId/slug -> platform.tenants.administer',
  // Class-level @RequireRoles('system-admin') before ADR-0018.
  'GET /super-admin/legal/documents -> platform.legal.administer',
  'GET /super-admin/legal/versions/:versionId -> platform.legal.administer',
  'PATCH /super-admin/legal/versions/:versionId -> platform.legal.administer',
  'POST /super-admin/legal/documents/:documentId/drafts -> platform.legal.administer',
  'POST /super-admin/legal/versions/:versionId/publish -> platform.legal.administer',
  // Class-level @RequireRoles('SUPER_ADMIN') before ADR-0018.
  'GET /admin/demo-data/summary -> platform.demoData.delete',
  'DELETE /admin/demo-data -> platform.demoData.delete',
  'POST /admin/demo-data/reseed -> platform.demoData.delete',
];
