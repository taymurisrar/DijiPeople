import { ForbiddenException, Injectable } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { resolveEffectiveAccessLevel } from '../../common/security/rbac-query-scope';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { EntityMetadata } from './entity-query.types';

@Injectable()
export class EntityPermissionResolver {
  assertCanRead(metadata: EntityMetadata, user: AuthenticatedUser) {
    const userPermissions = new Set(user.permissionKeys ?? []);
    const hasPermission = userPermissions.has(metadata.permissions.read);
    const hasRbacRead =
      resolveEffectiveAccessLevel(
        user,
        metadata.rbacEntityKey,
        SecurityPrivilege.READ,
      ) !== SecurityAccessLevel.NONE;

    if (!hasPermission || !hasRbacRead) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }
  }
}
