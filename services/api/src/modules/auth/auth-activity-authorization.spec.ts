import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PlatformUserRole } from '@prisma/client';
import { AUTHENTICATION_ONLY_KEY } from '../../common/decorators/authentication-only.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
} from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
import { AuthController } from './auth.controller';

/*
 * BUG-3545 / ADR-0018 decision 3. `POST /auth/activity` is the session
 * heartbeat: it touches only the caller's own session row. It demanded the
 * tenant permission `user-preferences.write`, which no platform role holds, so
 * the admin console's heartbeat was refused for almost every operator.
 *
 * These run the real PermissionsGuard against the real handler metadata, so
 * they fail if a permission decorator comes back on the handler or on the class.
 */
describe('BUG-3545 the session heartbeat needs a session and no permission', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);
  const handler = (
    AuthController.prototype as unknown as Record<string, () => unknown>
  ).activity;

  const contextFor = (user: AuthenticatedUser | undefined) =>
    ({
      getHandler: () => handler,
      getClass: () => AuthController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as never;

  const platformUser = (role: PlatformUserRole) => {
    const access = platformAccessForRole(role);
    return {
      userId: `platform-${role}`,
      tenantId: 'platform',
      roleIds: [role],
      roleKeys: access.roleKeys,
      permissionKeys: access.permissionKeys,
      rolePrivileges: [],
      authSubjectType: 'platform-user',
      appClientId: 'admin',
      platform: { id: `platform-${role}`, role, status: 'ACTIVE' },
    } as unknown as AuthenticatedUser;
  };

  it('declares no permission of either family, and is marked authentication-only', () => {
    const lookup = [handler, AuthController];
    expect(
      reflector.getAllAndOverride(REQUIRED_PERMISSIONS_KEY, lookup) ?? [],
    ).toEqual([]);
    expect(
      reflector.getAllAndOverride(REQUIRED_RBAC_PERMISSIONS_KEY, lookup) ?? [],
    ).toEqual([]);
    expect(reflector.getAllAndOverride(AUTHENTICATION_ONLY_KEY, lookup)).toBe(
      true,
    );
  });

  it('is not public: JwtAuthGuard still refuses an unauthenticated call with 401', () => {
    expect(
      reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler, AuthController]),
    ).not.toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, AuthController)).toEqual([
      JwtAuthGuard,
      PermissionsGuard,
    ]);
  });

  it.each(Object.values(PlatformUserRole))(
    'admits a %s platform session',
    (role) => {
      expect(guard.canActivate(contextFor(platformUser(role)))).toBe(true);
    },
  );

  it('admits a tenant user holding no permissions at all', () => {
    const tenantUser = {
      userId: 'tenant-user-1',
      tenantId: 'tenant-a',
      roleIds: [],
      roleKeys: ['employee'],
      permissionKeys: [],
      rolePrivileges: [],
    } as unknown as AuthenticatedUser;

    expect(guard.canActivate(contextFor(tenantUser))).toBe(true);
  });

  it('refuses a request that reached it with no user', () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
