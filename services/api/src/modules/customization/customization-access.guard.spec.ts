import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CustomizationAccessGuard } from './customization-access.guard';
import { CustomizationController } from './customization.controller';

/*
 * ADR-0013 / BUG-3491 — customization access is granted by the
 * `customization.*` permission keys, never by role membership.
 *
 * This spec used to assert the opposite on purpose ("does not give an ordinary
 * System Administrator customization access"). That assertion was the API half
 * of the disagreement that crashed every Customization screen for the workspace
 * owner, and it is inverted here deliberately.
 *
 * The guard runs with a real `Reflector` against the real
 * `CustomizationController` handlers, so the keys it checks are the ones the
 * controller actually declares — a mocked reflector would have let the test pass
 * against decorators that no longer exist.
 */
type Handler = keyof CustomizationController;

function contextFor(
  handler: Handler,
  user: { roleKeys: string[]; permissionKeys: string[] },
): ExecutionContext {
  const request = { user } as unknown as AuthenticatedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => CustomizationController.prototype[handler],
    getClass: () => CustomizationController,
  } as unknown as ExecutionContext;
}

describe('CustomizationAccessGuard', () => {
  const guard = new CustomizationAccessGuard(new Reflector());

  it('admits a System Administrator who holds the keys, with no customizer role', () => {
    expect(
      guard.canActivate(
        contextFor('listTables', {
          roleKeys: [ROLE_KEYS.SYSTEM_ADMIN],
          permissionKeys: ['customization.tables.read'],
        }),
      ),
    ).toBe(true);
  });

  it('admits a custom role that holds the keys', () => {
    expect(
      guard.canActivate(
        contextFor('createColumn', {
          roleKeys: ['tenant-configurator'],
          permissionKeys: ['customization.columns.create'],
        }),
      ),
    ).toBe(true);
  });

  it('refuses a System Customizer who does not hold the declared key', () => {
    expect(() =>
      guard.canActivate(
        contextFor('listTables', {
          roleKeys: [ROLE_KEYS.SYSTEM_CUSTOMIZER],
          permissionKeys: ['customization.read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('refuses a Global Administrator with no customization keys', () => {
    // Elevated roles bypass PermissionsGuard; this guard must not.
    expect(() =>
      guard.canActivate(
        contextFor('listTables', {
          roleKeys: [ROLE_KEYS.GLOBAL_ADMIN],
          permissionKeys: [],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('requires every declared key, not any one of them', () => {
    expect(() =>
      guard.canActivate(
        contextFor('createPackage', {
          roleKeys: [],
          permissionKeys: ['customization.read', 'customization.publish'],
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        contextFor('createPackage', {
          roleKeys: [],
          permissionKeys: ['customization.packages.manage'],
        }),
      ),
    ).toBe(true);
  });

  it('still requires customization.publish to publish', () => {
    const attempt = () =>
      guard.canActivate(
        contextFor('publishComponents', {
          roleKeys: [ROLE_KEYS.GLOBAL_ADMIN],
          permissionKeys: ['customization.read'],
        }),
      );
    expect(attempt).toThrow(ForbiddenException);
    try {
      attempt();
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'CUSTOMIZATION_PUBLISH_PERMISSION_REQUIRED',
      });
    }
    expect(
      guard.canActivate(
        contextFor('publishComponents', {
          roleKeys: [],
          permissionKeys: ['customization.publish'],
        }),
      ),
    ).toBe(true);
  });

  it('fails closed on a handler that declares no permission', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { roleKeys: [], permissionKeys: ['customization.read'] },
        }),
      }),
      getHandler: () => function undecorated() {},
      getClass: () => class Undecorated {},
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('refuses a request with no user', () => {
    const context = contextFor('listTables', {
      roleKeys: [],
      permissionKeys: [],
    });
    (context.switchToHttp().getRequest() as { user?: unknown }).user =
      undefined;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
