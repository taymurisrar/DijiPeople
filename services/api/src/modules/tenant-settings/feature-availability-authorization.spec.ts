import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEYS } from '../../common/constants/permissions';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantSettingsController } from './tenant-settings.controller';

/*
 * Authorization on GET /tenant-settings/features/availability.
 *
 * The route declared no permission, and PermissionsGuard returns true outright
 * when a handler declares neither permission family, so it was an unguarded
 * alias for GET /tenant-settings/features -- same service call, same payload,
 * but reachable without settings.read.
 *
 * The fix has to hold two things at once: no blanket authenticated access, and
 * no 403 for the ordinary roles whose every page load depends on it. That is
 * why the key is tenant-settings.resolved.read rather than settings.read, and
 * why the roles below are asserted individually against the seeded mappings.
 */

const guard = new PermissionsGuard(new Reflector());

function buildUser(
  permissionKeys: string[],
  roleKeys: string[] = [],
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@example.com',
    roleIds: [],
    roleKeys,
    permissionKeys,
  };
}

function contextFor(
  handler: string,
  user: AuthenticatedUser,
): ExecutionContext {
  const prototype = TenantSettingsController.prototype as unknown as Record<
    string,
    unknown
  >;

  return {
    getHandler: () => prototype[handler],
    getClass: () => TenantSettingsController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const RESOLVED_READ = PERMISSION_KEYS.TENANT_SETTINGS_RESOLVED_READ;

/*
 * The seeded grants these mirror: hr, manager, employee and recruiter all carry
 * tenant-settings.resolved.read in BASE_ROLE_PERMISSION_KEYS, and only the
 * first three of those carry settings.read -- employee does not, which is the
 * whole reason settings.read cannot be used here.
 */
const ROLES_THAT_MUST_KEEP_ACCESS: Array<[string, string[]]> = [
  ['employee', [RESOLVED_READ, 'dashboard.view']],
  ['manager', [RESOLVED_READ, 'settings.read', 'employees.read']],
  ['hr', [RESOLVED_READ, 'settings.read', 'employees.update']],
  ['recruiter', [RESOLVED_READ, 'settings.read', 'recruitment.read']],
];

describe('GET /tenant-settings/features/availability authorization', () => {
  it.each(ROLES_THAT_MUST_KEEP_ACCESS)(
    'keeps feature availability reachable for %s',
    (roleKey, permissionKeys) => {
      expect(
        guard.canActivate(
          contextFor(
            'getFeatureAvailability',
            buildUser(permissionKeys, [roleKey]),
          ),
        ),
      ).toBe(true);
    },
  );

  it('refuses an authenticated user without the resolved-settings permission', () => {
    const outsider = buildUser(['dashboard.view'], ['employee']);

    expect(() =>
      guard.canActivate(contextFor('getFeatureAvailability', outsider)),
    ).toThrow(ForbiddenException);
  });

  it('no longer allows blanket authenticated access', () => {
    // Before the fix this user reached the route purely by being logged in.
    const anyAuthenticatedUser = buildUser([], []);

    expect(() =>
      guard.canActivate(
        contextFor('getFeatureAvailability', anyAuthenticatedUser),
      ),
    ).toThrow(ForbiddenException);
  });

  it('refuses a request with no tenant context', () => {
    const noTenant = {
      ...buildUser([RESOLVED_READ], ['employee']),
      tenantId: '',
    } as AuthenticatedUser;

    expect(() =>
      guard.canActivate(contextFor('getFeatureAvailability', noTenant)),
    ).toThrow(ForbiddenException);
  });

  it('preserves access for elevated tenant roles through the existing bypass', () => {
    const admin = buildUser([], ['global-admin']);

    expect(guard.canActivate(contextFor('getFeatureAvailability', admin))).toBe(
      true,
    );
  });

  it('declares tenant-settings.resolved.read on the route', () => {
    const declared = new Reflector().get<string[]>(
      'required_permissions',
      (TenantSettingsController.prototype as unknown as Record<string, unknown>)
        .getFeatureAvailability as never,
    );

    expect(declared).toEqual([RESOLVED_READ]);
  });

  /*
   * The two routes are intentionally not equivalent any more. features is the
   * settings-administration view and keeps settings.read; features/availability
   * is the application view and takes the lighter resolved-settings key. This
   * fails if either drifts back to the other, or if availability loses its
   * declaration and becomes an open alias again.
   */
  it('keeps features and features/availability on deliberately different keys', () => {
    const reflector = new Reflector();
    const prototype = TenantSettingsController.prototype as unknown as Record<
      string,
      unknown
    >;

    const featuresKeys = reflector.get<string[]>(
      'required_permissions',
      prototype.getFeatures as never,
    );
    const availabilityKeys = reflector.get<string[]>(
      'required_permissions',
      prototype.getFeatureAvailability as never,
    );

    expect(featuresKeys).toEqual(['settings.read']);
    expect(availabilityKeys).toEqual([RESOLVED_READ]);
    expect(availabilityKeys).not.toEqual(featuresKeys);
  });

  it('refuses the settings-administration route to an ordinary employee', () => {
    // Guards the other direction: availability must not become a way in here.
    const employee = buildUser([RESOLVED_READ], ['employee']);

    expect(() =>
      guard.canActivate(contextFor('getFeatures', employee)),
    ).toThrow(ForbiddenException);
  });
});

describe('feature availability response shaping', () => {
  function createController(featurePayload: Record<string, unknown>) {
    const service = {
      getTenantFeatures: jest.fn(async () => featurePayload),
    };

    return {
      controller: new TenantSettingsController(service as never, {} as never),
      service,
    };
  }

  const payload = {
    subscription: {
      id: 'sub-1',
      status: 'ACTIVE',
      plan: { id: 'plan-1', key: 'growth', name: 'Growth' },
      billingCycle: 'MONTHLY',
      finalPrice: 4999,
      currency: 'USD',
    },
    items: [{ key: 'payroll', isEnabled: true }],
    enabledKeys: ['payroll'],
  };

  it('does not return subscription pricing to ordinary application users', async () => {
    const { controller } = createController(payload);

    const result = await controller.getFeatureAvailability(
      buildUser([RESOLVED_READ], ['employee']),
    );

    expect(result).not.toHaveProperty('subscription');
    expect(JSON.stringify(result)).not.toContain('4999');
  });

  it('still returns what the authenticated layout renders from', async () => {
    const { controller } = createController(payload);

    const result = await controller.getFeatureAvailability(
      buildUser([RESOLVED_READ], ['employee']),
    );

    // layout.tsx reads featureAvailability?.enabledKeys and nothing else.
    expect(result.enabledKeys).toEqual(['payroll']);
    expect(result.items).toEqual([{ key: 'payroll', isEnabled: true }]);
  });

  it('scopes the lookup to the caller tenant', async () => {
    const { controller, service } = createController(payload);

    await controller.getFeatureAvailability(
      buildUser([RESOLVED_READ], ['employee']),
    );

    expect(service.getTenantFeatures).toHaveBeenCalledWith('tenant-1');
    expect(service.getTenantFeatures).toHaveBeenCalledTimes(1);
  });

  it('leaves the settings-administration route returning the full payload', async () => {
    const { controller } = createController(payload);

    const result = await controller.getFeatures(
      buildUser(['settings.read'], ['hr']),
    );

    expect(result).toHaveProperty('subscription');
  });
});
