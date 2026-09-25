import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATION_ONLY_KEY } from '../decorators/authentication-only.decorator';
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
    /*
     * ADR-0018: a self-scoped handler needs a session and nothing more, for
     * tenant and platform subjects alike. Read first and explicitly, so a
     * permission declared on the controller later cannot silently re-apply to
     * it through `getAllAndOverride`. The session itself is JwtAuthGuard's job,
     * which runs before this guard; the user check is defence in depth.
     */
    if (
      this.reflector.getAllAndOverride<boolean>(AUTHENTICATION_ONLY_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      if (!context.switchToHttp().getRequest<AuthenticatedRequest>().user) {
        throw new UnauthorizedException();
      }
      return true;
    }

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
