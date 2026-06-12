import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { hasAnyRole } from '../../common/security/role-matching';

const SYSTEM_CUSTOMIZER_ROLES = [
  ROLE_KEYS.SYSTEM_CUSTOMIZER,
  'system customizer',
  'system-customizer',
] as const;

@Injectable()
export class CustomizationAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!hasAnyRole(user?.roleKeys ?? [], SYSTEM_CUSTOMIZER_ROLES)) {
      throw new ForbiddenException({
        code: 'CUSTOMIZATION_REQUIRES_SYSTEM_CUSTOMIZER',
        message: 'Customization requires the System Customizer role.',
      });
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (
      requiredPermissions.includes('customization.publish') &&
      !user.permissionKeys.includes('customization.publish')
    ) {
      throw new ForbiddenException({
        code: 'CUSTOMIZATION_PUBLISH_PERMISSION_REQUIRED',
        message:
          'Publishing customization requires the customization.publish permission.',
      });
    }

    return true;
  }
}
