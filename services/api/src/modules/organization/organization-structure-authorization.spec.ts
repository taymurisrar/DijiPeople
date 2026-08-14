import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  MISC_PERMISSION_KEYS,
  ROLE_KEYS,
} from '../../common/constants/rbac-matrix';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { BusinessUnitsController } from './business-units.controller';
import { OrganizationsController } from './organizations.controller';

/*
 * Authorization on the organization structure endpoints.
 *
 * Both controllers carried JwtAuthGuard alone and neither the controllers nor
 * OrganizationService performed any authorization, so a valid JWT was enough to
 * create, rename, reparent or delete an organization or business unit. That is
 * a privilege-escalation path rather than a data-exposure one: business-unit
 * membership feeds accessContext.accessibleBusinessUnitIds, which
 * buildScopedAccessWhere() uses to decide which rows a business-unit scoped
 * role may read.
 *
 * These drive the real PermissionsGuard against the real controller metadata,
 * so they fail if a decorator is dropped, if the guard stops being registered,
 * or if a new mutating route is added without authorization -- none of which a
 * metadata-only assertion would catch.
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
  controller: { prototype: Record<string, unknown> },
  handler: string,
  user: AuthenticatedUser | undefined,
): ExecutionContext {
  return {
    getHandler: () => controller.prototype[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const ORGANIZATION_MUTATIONS = [
  ['create', 'POST /organizations'],
  ['update', 'PATCH /organizations/:id'],
  ['remove', 'DELETE /organizations/:id'],
] as const;

const BUSINESS_UNIT_MUTATIONS = [
  ['create', 'POST /business-units'],
  ['update', 'PATCH /business-units/:id (also reparent / move organization)'],
  ['remove', 'DELETE /business-units/:id'],
] as const;

const READ_ROUTES = [
  'findAll',
  'findOne',
  'getChildren',
  'getParents',
  'getSubtree',
] as const;

const ORDINARY_EMPLOYEE = () =>
  buildUser(['dashboard.view', 'employees.read'], [ROLE_KEYS.EMPLOYEE]);

// The seeded HR role receives organization.manage through
// SYSTEM_ROLE_MISC_PERMISSIONS, which PermissionBootstrapService writes to
// RoleMiscPermission and loadAccessContext folds into permissionKeys.
const HR_USER = () =>
  buildUser([MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE], [ROLE_KEYS.HR]);

describe.each([
  ['OrganizationsController', OrganizationsController, ORGANIZATION_MUTATIONS],
  ['BusinessUnitsController', BusinessUnitsController, BUSINESS_UNIT_MUTATIONS],
] as const)('%s mutations', (_name, controller, mutations) => {
  it.each(mutations)(
    'refuses an ordinary authenticated employee: %s',
    (handler) => {
      expect(() =>
        guard.canActivate(
          contextFor(controller as never, handler, ORDINARY_EMPLOYEE()),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it.each(mutations)(
    'refuses a manager who lacks organization.manage: %s',
    (handler) => {
      const manager = buildUser(
        ['employees.read', 'employees.update', 'settings.read'],
        [ROLE_KEYS.MANAGER],
      );

      expect(() =>
        guard.canActivate(contextFor(controller as never, handler, manager)),
      ).toThrow(ForbiddenException);
    },
  );

  it.each(mutations)('allows HR holding organization.manage: %s', (handler) => {
    expect(
      guard.canActivate(contextFor(controller as never, handler, HR_USER())),
    ).toBe(true);
  });

  it.each(mutations)(
    'allows an elevated tenant role through the existing bypass: %s',
    (handler) => {
      const admin = buildUser([], [ROLE_KEYS.GLOBAL_ADMIN]);

      expect(
        guard.canActivate(contextFor(controller as never, handler, admin)),
      ).toBe(true);
    },
  );

  it.each(mutations)(
    'refuses a request with no tenant context: %s',
    (handler) => {
      const noTenant = {
        ...ORDINARY_EMPLOYEE(),
        tenantId: '',
      } as AuthenticatedUser;

      expect(() =>
        guard.canActivate(contextFor(controller as never, handler, noTenant)),
      ).toThrow(ForbiddenException);
    },
  );

  it('declares organization.manage on every mutating route', () => {
    const reflector = new Reflector();

    for (const [handler] of mutations) {
      const declared = reflector.get<string[]>(
        'required_permissions',
        (controller as unknown as { prototype: Record<string, unknown> })
          .prototype[handler] as never,
      );

      expect(declared).toEqual([MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE]);
    }
  });

  /*
   * The read routes deliberately keep their previous behaviour. Adding
   * PermissionsGuard at the class level does not change them, because the guard
   * returns true outright when a handler declares neither permission family.
   * business-units.read exists but is granted to no seeded role, so gating
   * these would black out user administration, timesheets and payroll settings
   * for everyone.
   */
  it.each(READ_ROUTES)(
    'leaves read route %s reachable for an ordinary employee',
    (handler) => {
      if (
        !(controller as unknown as { prototype: Record<string, unknown> })
          .prototype[handler]
      ) {
        return;
      }

      expect(
        guard.canActivate(
          contextFor(controller as never, handler, ORDINARY_EMPLOYEE()),
        ),
      ).toBe(true);
    },
  );
});

describe('organization structure authorization coverage', () => {
  /*
   * A guard on the class is not enough on its own: a mutating route added
   * without a @Permissions decorator would sail through, because
   * PermissionsGuard treats "nothing declared" as "nothing required". This
   * fails when that happens.
   */
  it.each([
    ['OrganizationsController', OrganizationsController],
    ['BusinessUnitsController', BusinessUnitsController],
  ] as const)('has no undeclared mutating route on %s', (_name, controller) => {
    const reflector = new Reflector();
    const prototype = (
      controller as unknown as { prototype: Record<string, unknown> }
    ).prototype;

    const undeclared = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .filter((name) => {
        const handler = prototype[name];
        if (typeof handler !== 'function') return false;

        // 1 = POST, 2 = PUT, 3 = DELETE, 4 = PATCH in Nest's RequestMethod.
        const method = Reflect.getMetadata('method', handler) as
          | number
          | undefined;
        if (method === undefined || ![1, 2, 3, 4].includes(method)) {
          return false;
        }

        const declared = reflector.get<string[]>(
          'required_permissions',
          handler as never,
        );

        return !declared || declared.length === 0;
      });

    expect(undeclared).toEqual([]);
  });
});
