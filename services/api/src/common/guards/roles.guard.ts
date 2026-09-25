import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_ROLES_KEY } from '../decorators/require-roles.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    /*
     * ADR-0018: a platform subject is never decided by role key. This guard
     * used to wave the literal SUPER_ADMIN through outright, and MEMBER through
     * on its `system-customizer` alias, which is how four platform controllers
     * came to authorize operators by *tenant* role keys — refusing every role
     * the aliases did not happen to cover (BUG-3544). Those controllers now use
     * PlatformPermissionsGuard alone. A role-gated route reached by a platform
     * subject is a wiring mistake, so it is refused here rather than answered
     * with an alias; SUPER_ADMIN is the widest permission set, not a bypass.
     */
    if (request.user?.platform?.id) {
      throw new ForbiddenException({
        code: 'PLATFORM_PERMISSION_DENIED',
        message:
          'This route is authorized by tenant role, which does not apply to platform users.',
      });
    }

    const userRoleKeys = new Set(request.user?.roleKeys ?? []);

    const hasAtLeastOneRole = requiredRoles.some((role) =>
      userRoleKeys.has(role),
    );

    if (!hasAtLeastOneRole) {
      throw new ForbiddenException(
        'You do not have the required role for this action.',
      );
    }

    return true;
  }
}
