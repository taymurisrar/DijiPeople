import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
} from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CustomModuleRuntimeController } from './custom-module-runtime.controller';
import { DataController } from './data.controller';

/*
 * BUG-3494 / EXECPLAN-0046. The custom-module record endpoints are now what
 * end users reach from the sidebar, so each one must be refused at the guard,
 * in both permission systems, and not only inside the service. This reads the
 * real decorator metadata and runs the real guard against it.
 */

type HandlerCase = readonly [
  controller: object,
  handler: string,
  legacyKey: string,
  privilege: SecurityPrivilege,
];

const CASES: readonly HandlerCase[] = [
  [DataController, 'findOne', 'custom-records.read', SecurityPrivilege.READ],
  [DataController, 'create', 'custom-records.create', SecurityPrivilege.CREATE],
  [DataController, 'update', 'custom-records.write', SecurityPrivilege.WRITE],
  [
    DataController,
    'deleteOne',
    'custom-records.delete',
    SecurityPrivilege.DELETE,
  ],
  [
    DataController,
    'deleteMany',
    'custom-records.delete',
    SecurityPrivilege.DELETE,
  ],
  [
    CustomModuleRuntimeController,
    'listModules',
    'custom-records.read',
    SecurityPrivilege.READ,
  ],
  [
    CustomModuleRuntimeController,
    'getModule',
    'custom-records.read',
    SecurityPrivilege.READ,
  ],
];

function handlerOf(controller: object, name: string) {
  return (controller as { prototype: Record<string, () => unknown> }).prototype[
    name
  ];
}

function contextFor(
  controller: object,
  handler: string,
  user: Partial<AuthenticatedUser>,
): ExecutionContext {
  return {
    getHandler: () => handlerOf(controller, handler),
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function userWith(
  permissionKeys: string[],
  privileges: SecurityPrivilege[],
): Partial<AuthenticatedUser> {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    roleKeys: ['hr'],
    permissionKeys,
    rolePrivileges: privileges.map((privilege) => ({
      entityKey: ENTITY_KEYS.CUSTOM_RECORDS,
      privilege,
      accessLevel: SecurityAccessLevel.TENANT,
      roleId: 'role-1',
    })),
  };
}

describe('custom-module endpoints declare and enforce both permission systems', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  it('CustomModuleRuntimeController runs JwtAuthGuard then PermissionsGuard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CustomModuleRuntimeController),
    ).toEqual([JwtAuthGuard, PermissionsGuard]);
  });

  /*
   * DataController authenticates at the class and guards per handler, because
   * its dispatching list handler cannot carry one static declaration (it stays
   * on the reviewed service-authorized list in wiring-invariants.spec.ts).
   */
  it('DataController authenticates every handler at the class', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DataController)).toEqual([
      JwtAuthGuard,
    ]);
  });

  it.each(CASES.filter(([controller]) => controller === DataController))(
    '%p.%s runs PermissionsGuard',
    (controller, handler) => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, handlerOf(controller, handler)),
      ).toEqual([PermissionsGuard]);
    },
  );

  it('the dispatching list handler is the only DataController handler without the guard', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        handlerOf(DataController, 'findMany'),
      ),
    ).toBeUndefined();
  });

  it.each(CASES)(
    '%p.%s declares %s and the matching matrix privilege',
    (controller, handler, legacyKey, privilege) => {
      const method = handlerOf(controller, handler);
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, method)).toEqual([
        legacyKey,
      ]);
      expect(
        Reflect.getMetadata(REQUIRED_RBAC_PERMISSIONS_KEY, method),
      ).toEqual([{ entityKey: ENTITY_KEYS.CUSTOM_RECORDS, privilege }]);
    },
  );

  it.each(CASES)(
    '%p.%s denies a caller holding only the matrix privilege',
    (controller, handler, _legacyKey, privilege) => {
      expect(() =>
        guard.canActivate(
          contextFor(controller, handler, userWith([], [privilege])),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it.each(CASES)(
    '%p.%s denies a caller holding only the legacy key',
    (controller, handler, legacyKey) => {
      expect(() =>
        guard.canActivate(
          contextFor(controller, handler, userWith([legacyKey], [])),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it.each(CASES)(
    '%p.%s admits a caller holding both',
    (controller, handler, legacyKey, privilege) => {
      expect(
        guard.canActivate(
          contextFor(controller, handler, userWith([legacyKey], [privilege])),
        ),
      ).toBe(true);
    },
  );

  it('a reader cannot create: read does not satisfy the create endpoint', () => {
    expect(() =>
      guard.canActivate(
        contextFor(
          DataController,
          'create',
          userWith(['custom-records.read'], [SecurityPrivilege.READ]),
        ),
      ),
    ).toThrow(ForbiddenException);
  });
});
