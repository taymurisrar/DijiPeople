import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

/*
 * ADR-0013 / BUG-3491 — Customization is authorized by the `customization.*`
 * permission keys, exactly like every other tenant capability. Role membership
 * is not consulted here or anywhere else on this path.
 *
 * This guard used to admit only the Global Administrator and System Customizer
 * roles. The web section had already moved to the permission model
 * (BUG-3374), so a workspace owner holding every customization key but the
 * System Administrator role got through the web layout and then a 403 from
 * every screen's first API call — a server error, not Customization.
 *
 * Why this guard still exists alongside `PermissionsGuard`: that guard returns
 * early for elevated tenant roles (`hasElevatedTenantRole`) without looking at a
 * single key. Customization metadata changes what every user in the tenant sees,
 * so here the declared keys are checked for everyone, elevated or not. That costs
 * elevated roles nothing — `AuthAccessService` gives them every foundation key at
 * login — and it means a custom role is admitted exactly when an administrator
 * granted it the keys.
 *
 * A handler that declares no key is refused rather than waved through. Every
 * route on this controller declares one; a route added without one should fail
 * closed where a reviewer will see it, not open.
 */
@Injectable()
export class CustomizationAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const heldKeys = new Set(request.user?.permissionKeys ?? []);

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      throw new ForbiddenException({
        code: 'CUSTOMIZATION_PERMISSION_REQUIRED',
        message: 'This customization action does not declare a permission.',
      });
    }

    const missing = requiredPermissions.filter((key) => !heldKeys.has(key));
    if (missing.length === 0) {
      return true;
    }

    if (missing.includes('customization.publish')) {
      throw new ForbiddenException({
        code: 'CUSTOMIZATION_PUBLISH_PERMISSION_REQUIRED',
        message:
          'Publishing customization requires the customization.publish permission.',
      });
    }

    throw new ForbiddenException({
      code: 'CUSTOMIZATION_PERMISSION_REQUIRED',
      message: `Customization requires the ${missing.join(', ')} permission.`,
    });
  }
}
