import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementGuard } from './entitlement.guard';
import { RequireEntitlement } from '../decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../constants/tenant-features';
import { ELEVATED_TENANT_ROLE_KEYS } from '../security/elevated-tenant-roles';
import { AppError } from '../errors/app-error';
import type { EntitlementDecision } from '../security/tenant-entitlement.service';

/*
 * BUG-1952. The gate the product never had: plan entitlements were a
 * presentation detail, the only throwing primitive had zero call sites, and the
 * one UI consumer skipped itself for the tenant's own administrators.
 *
 * Two of these tests are the whole point of the record and must never be
 * relaxed: an elevated tenant role is still refused, and a platform user is
 * exempt. The first is the opposite of how the elevated-role bypass works for
 * permissions, and it is deliberate — a permission is about what a person may
 * do, an entitlement is about what the tenant bought, and a tenant
 * administrator cannot sell their own tenant a module.
 */

@RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
class GatedController {
  handler() {
    return null;
  }
}

class UngatedController {
  handler() {
    return null;
  }
}

type UserShape = {
  userId: string;
  tenantId: string;
  roleKeys: string[];
  platform?: { id: string; role: string; status: string };
};

function buildContext(
  user: UserShape | null,
  controller: object = GatedController,
): ExecutionContext {
  const target = controller as { prototype: { handler: () => unknown } };
  return {
    getHandler: () => target.prototype.handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        method: 'GET',
        path: '/api/payroll/cycles',
      }),
    }),
  } as unknown as ExecutionContext;
}

function buildEntitlements(options: {
  mode?: 'OFF' | 'REPORT_ONLY' | 'ENFORCE';
  decision?: Partial<EntitlementDecision>;
}) {
  const decision: EntitlementDecision = {
    outcome: 'NOT_ENTITLED',
    allowed: false,
    featureKeys: [TENANT_FEATURE_KEYS.PAYROLL],
    stale: false,
    ...options.decision,
  };

  return {
    mode: jest.fn().mockResolvedValue(options.mode ?? 'ENFORCE'),
    decide: jest.fn().mockResolvedValue(decision),
  };
}

function buildGuard(entitlements: ReturnType<typeof buildEntitlements>) {
  const guard = new EntitlementGuard(new Reflector(), entitlements as never);
  const logger = (guard as unknown as { logger: Record<string, unknown> })
    .logger;
  jest.spyOn(logger as never, 'warn').mockImplementation(() => undefined);
  return guard;
}

const tenantUser: UserShape = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  roleKeys: ['employee'],
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EntitlementGuard', () => {
  it('allows a module the tenant is entitled to', async () => {
    const entitlements = buildEntitlements({
      decision: { outcome: 'ENTITLED', allowed: true },
    });
    const guard = buildGuard(entitlements);

    await expect(guard.canActivate(buildContext(tenantUser))).resolves.toBe(
      true,
    );
  });

  it('refuses a module the tenant is not entitled to', async () => {
    const entitlements = buildEntitlements({});
    const guard = buildGuard(entitlements);

    await expect(
      guard.canActivate(buildContext(tenantUser)),
    ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
  });

  /*
   * The refusal must not be a bare 403 that reads as a permissions bug. Three
   * frontends, an Electron agent and a .NET gateway consume this contract, and
   * ACCESS_DENIED already occupies the same status code with a very different
   * meaning — "you lack permission", shown to a tenant administrator who holds
   * every permission there is.
   */
  it('refuses with a catalog code distinct from ACCESS_DENIED', async () => {
    const entitlements = buildEntitlements({});
    const guard = buildGuard(entitlements);

    const error = await guard
      .canActivate(buildContext(tenantUser))
      .then(() => null)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.errorCode).toBe('TENANT_FEATURE_NOT_ENTITLED');
    expect(appError.errorCode).not.toBe('ACCESS_DENIED');
    expect(appError.statusCode).toBe(403);
  });

  /*
   * The defect this record names in as many words. `hasElevatedTenantRole`
   * short-circuits PermissionsGuard entirely; it must have no effect here.
   * Driven off the real elevated-role set so adding a role to that list cannot
   * quietly open a hole in the commercial boundary.
   */
  it.each([...ELEVATED_TENANT_ROLE_KEYS])(
    'still refuses an unentitled module for the elevated role %s',
    async (roleKey) => {
      const entitlements = buildEntitlements({});
      const guard = buildGuard(entitlements);

      await expect(
        guard.canActivate(buildContext({ ...tenantUser, roleKeys: [roleKey] })),
      ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
    },
  );

  it('still refuses when the caller holds every elevated role at once', async () => {
    const entitlements = buildEntitlements({});
    const guard = buildGuard(entitlements);

    await expect(
      guard.canActivate(
        buildContext({
          ...tenantUser,
          roleKeys: [...ELEVATED_TENANT_ROLE_KEYS, 'system-customizer'],
        }),
      ),
    ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
  });

  /*
   * A platform administrator acting across tenants is not a tenant using a
   * plan. Cross-tenant endpoints live in super-admin, platform-* and tenants,
   * and none of them may be subject to a tenant's entitlements.
   */
  it('exempts a platform user without resolving anything', async () => {
    const entitlements = buildEntitlements({});
    const guard = buildGuard(entitlements);

    await expect(
      guard.canActivate(
        buildContext({
          ...tenantUser,
          platform: { id: 'p-1', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
        }),
      ),
    ).resolves.toBe(true);
    expect(entitlements.decide).not.toHaveBeenCalled();
  });

  it('is inert on a controller that declares no entitlement', async () => {
    const entitlements = buildEntitlements({});
    const guard = buildGuard(entitlements);

    await expect(
      guard.canActivate(buildContext(tenantUser, UngatedController)),
    ).resolves.toBe(true);
    expect(entitlements.mode).not.toHaveBeenCalled();
    expect(entitlements.decide).not.toHaveBeenCalled();
  });

  it('leaves an unauthenticated request to the auth guard', async () => {
    const entitlements = buildEntitlements({});
    const guard = buildGuard(entitlements);

    await expect(guard.canActivate(buildContext(null))).resolves.toBe(true);
    expect(entitlements.decide).not.toHaveBeenCalled();
  });

  it('reads the tenant only from the authenticated subject', async () => {
    const entitlements = buildEntitlements({
      decision: { outcome: 'ENTITLED', allowed: true },
    });
    const guard = buildGuard(entitlements);

    await guard.canActivate(buildContext(tenantUser));

    expect(entitlements.decide).toHaveBeenCalledWith('tenant-1', [
      TENANT_FEATURE_KEYS.PAYROLL,
    ]);
  });

  it('answers a cold-cache resolver failure as unavailable, not unentitled', async () => {
    const entitlements = buildEntitlements({
      decision: { outcome: 'UNRESOLVABLE', allowed: false },
    });
    const guard = buildGuard(entitlements);

    const error = await guard
      .canActivate(buildContext(tenantUser))
      .then(() => null)
      .catch((thrown: unknown) => thrown);

    expect((error as AppError).errorCode).toBe(
      'TENANT_ENTITLEMENT_UNAVAILABLE',
    );
    expect((error as AppError).statusCode).toBe(503);
  });
});

describe('EntitlementGuard enforcement modes', () => {
  /*
   * The rollout control, and the reason this change is safe to merge before
   * anybody decides to start refusing. Switching straight to ENFORCE would cut
   * off every tenant already using a module it never bought, with no warning to
   * them and no list for the platform owner.
   */
  it('logs and allows in report-only mode', async () => {
    const entitlements = buildEntitlements({ mode: 'REPORT_ONLY' });
    const guard = buildGuard(entitlements);
    const logger = (guard as unknown as { logger: { warn: jest.Mock } }).logger;

    await expect(guard.canActivate(buildContext(tenantUser))).resolves.toBe(
      true,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ENTITLEMENT_WOULD_REFUSE'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('tenant=tenant-1'),
    );
  });

  it('does not refuse an elevated role in report-only mode either', async () => {
    const entitlements = buildEntitlements({ mode: 'REPORT_ONLY' });
    const guard = buildGuard(entitlements);

    await expect(
      guard.canActivate(
        buildContext({
          ...tenantUser,
          roleKeys: [...ELEVATED_TENANT_ROLE_KEYS],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('allows without resolving when enforcement is off', async () => {
    const entitlements = buildEntitlements({ mode: 'OFF' });
    const guard = buildGuard(entitlements);

    await expect(guard.canActivate(buildContext(tenantUser))).resolves.toBe(
      true,
    );
    expect(entitlements.decide).not.toHaveBeenCalled();
  });

  it('logs the refusal it throws in enforce mode', async () => {
    const entitlements = buildEntitlements({ mode: 'ENFORCE' });
    const guard = buildGuard(entitlements);
    const logger = (guard as unknown as { logger: { warn: jest.Mock } }).logger;

    await expect(guard.canActivate(buildContext(tenantUser))).rejects.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ENTITLEMENT_REFUSED'),
    );
  });

  it('does not log a query string with the refusal', async () => {
    const entitlements = buildEntitlements({ mode: 'REPORT_ONLY' });
    const guard = buildGuard(entitlements);
    const logger = (guard as unknown as { logger: { warn: jest.Mock } }).logger;

    await guard.canActivate(buildContext(tenantUser));

    const line = logger.warn.mock.calls[0][0] as string;
    expect(line).toContain('/api/payroll/cycles');
    expect(line).not.toContain('?');
  });
});
