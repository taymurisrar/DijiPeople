import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CustomizationAccessGuard } from './customization-access.guard';

describe('CustomizationAccessGuard', () => {
  function createGuard(requiredPermissions: string[] = []) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredPermissions),
    } as unknown as Reflector;

    return new CustomizationAccessGuard(reflector);
  }

  function createContext(roleKeys: string[], permissionKeys: string[] = []) {
    const request = {
      user: { roleKeys, permissionKeys },
    } as unknown as AuthenticatedRequest;

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  it('allows a Global Administrator', () => {
    const guard = createGuard();

    expect(guard.canActivate(createContext([ROLE_KEYS.GLOBAL_ADMIN]))).toBe(
      true,
    );
  });

  it('allows a System Customizer', () => {
    const guard = createGuard();

    expect(
      guard.canActivate(createContext([ROLE_KEYS.SYSTEM_CUSTOMIZER])),
    ).toBe(true);
  });

  it('does not give an ordinary System Administrator customization access', () => {
    const guard = createGuard();

    expect(() =>
      guard.canActivate(createContext([ROLE_KEYS.SYSTEM_ADMIN])),
    ).toThrow(ForbiddenException);
  });

  it('requires publish permission for publish operations', () => {
    const guard = createGuard(['customization.publish']);

    expect(() =>
      guard.canActivate(createContext([ROLE_KEYS.GLOBAL_ADMIN])),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        createContext([ROLE_KEYS.GLOBAL_ADMIN], ['customization.publish']),
      ),
    ).toBe(true);
  });
});
