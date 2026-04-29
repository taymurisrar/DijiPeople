import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityAccessLevel } from '@prisma/client';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
  RequiredRbacPermission,
} from '../decorators/require-permissions.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { SECURITY_ACCESS_LEVEL_WEIGHT } from '../constants/rbac-matrix';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const requiredRbacPermissions =
      this.reflector.getAllAndOverride<RequiredRbacPermission[]>(
        REQUIRED_RBAC_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (
      requiredPermissions.length === 0 &&
      requiredRbacPermissions.length === 0
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant access context is required.');
    }

    const userPermissions = new Set(request.user?.permissionKeys ?? []);

    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    const hasRbacPermission =
      requiredRbacPermissions.length === 0 ||
      requiredRbacPermissions.some((requiredPermission) => {
        const accessLevel =
          user.rolePrivileges
            ?.filter(
              (privilege) =>
                privilege.entityKey === requiredPermission.entityKey &&
                privilege.privilege === requiredPermission.privilege,
            )
            .reduce((best, privilege) => {
              if (
                SECURITY_ACCESS_LEVEL_WEIGHT[privilege.accessLevel] >
                SECURITY_ACCESS_LEVEL_WEIGHT[best]
              ) {
                return privilege.accessLevel;
              }

              return best;
            }, SecurityAccessLevel.NONE) ?? SecurityAccessLevel.NONE;

        return accessLevel !== SecurityAccessLevel.NONE;
      });

    if (!hasAllPermissions || !hasRbacPermission) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
