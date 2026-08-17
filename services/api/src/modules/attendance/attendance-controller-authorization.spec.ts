import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AttendanceController } from './attendance.controller';

const guard = new PermissionsGuard(new Reflector());

type RouteCase = {
  handler: keyof AttendanceController;
  legacyPermission: string;
  matrixPrivilege: SecurityPrivilege;
};

const DUAL_PERMISSION_ROUTES: RouteCase[] = [
  {
    handler: 'checkIn',
    legacyPermission: 'attendance.checkin',
    matrixPrivilege: SecurityPrivilege.CREATE,
  },
  {
    handler: 'checkOut',
    legacyPermission: 'attendance.checkout',
    matrixPrivilege: SecurityPrivilege.CREATE,
  },
  {
    handler: 'overrideAttendanceEntry',
    legacyPermission: 'attendance.override',
    matrixPrivilege: SecurityPrivilege.WRITE,
  },
];

function buildUser(
  permissionKeys: string[],
  matrixPrivilege?: SecurityPrivilege,
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@example.com',
    roleIds: [],
    roleKeys: ['employee'],
    permissionKeys,
    rolePrivileges: matrixPrivilege
      ? [
          {
            entityKey: ENTITY_KEYS.ATTENDANCE,
            privilege: matrixPrivilege,
            accessLevel: SecurityAccessLevel.SELF,
          },
        ]
      : [],
  };
}

function contextFor(
  handler: keyof AttendanceController,
  user: AuthenticatedUser,
): ExecutionContext {
  return {
    getHandler: () => AttendanceController.prototype[handler],
    getClass: () => AttendanceController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AttendanceController dual-permission routes', () => {
  it.each(DUAL_PERMISSION_ROUTES)(
    'allows $handler only when both permission families are present',
    ({ handler, legacyPermission, matrixPrivilege }) => {
      expect(
        guard.canActivate(
          contextFor(handler, buildUser([legacyPermission], matrixPrivilege)),
        ),
      ).toBe(true);
    },
  );

  it.each(DUAL_PERMISSION_ROUTES)(
    'denies $handler when the legacy permission is absent',
    ({ handler, matrixPrivilege }) => {
      expect(() =>
        guard.canActivate(contextFor(handler, buildUser([], matrixPrivilege))),
      ).toThrow(ForbiddenException);
    },
  );

  it.each(DUAL_PERMISSION_ROUTES)(
    'denies $handler when the matrix privilege is absent',
    ({ handler, legacyPermission }) => {
      expect(() =>
        guard.canActivate(contextFor(handler, buildUser([legacyPermission]))),
      ).toThrow(ForbiddenException);
    },
  );
});
