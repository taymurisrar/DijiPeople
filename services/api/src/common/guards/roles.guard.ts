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
