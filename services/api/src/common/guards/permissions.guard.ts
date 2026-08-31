import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
  RequiredRbacPermission,
} from '../decorators/require-permissions.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { satisfiesPermissionRequirement } from '../security/permission-evaluation';

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
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'Tenant access context is required.',
      });
    }

    /*
     * The decision itself lives in `satisfiesPermissionRequirement` so that a
     * caller which dispatches into another module's handler without passing
     * through its controller — `POST /approvals/:id/approve` — applies the
     * identical test rather than a second copy of it that can drift.
     */
    if (
      !satisfiesPermissionRequirement(user, {
        legacyKeys: requiredPermissions,
        rbac: requiredRbacPermissions,
      })
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to perform this action.',
      });
    }

    return true;
  }
}
