import { Injectable } from '@nestjs/common';
import { SecurityPrivilege } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import { EntityMetadata } from './entity-query.types';

@Injectable()
export class EntityScopeResolver {
  buildReadScope(metadata: EntityMetadata, user: AuthenticatedUser) {
    if (!metadata.tenantScoped && !metadata.businessUnitScoped) {
      return {};
    }

    return buildScopedAccessWhere(
      user,
      metadata.rbacEntityKey,
      SecurityPrivilege.READ,
      metadata.scope,
    );
  }
}
