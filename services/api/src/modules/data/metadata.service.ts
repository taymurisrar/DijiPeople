import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  EntityFieldMetadata,
  EntityMetadata,
  EntityPermissionMetadata,
} from './entity-query.types';
import { EntityPermissionResolver } from './entity-permission.resolver';
import { getEntityMetadata, listEntityMetadata } from './entity-registry';

@Injectable()
export class MetadataService {
  constructor(
    private readonly permissionResolver: EntityPermissionResolver,
  ) {}

  listEntities(user: AuthenticatedUser) {
    return {
      items: listEntityMetadata()
        .filter((metadata) => this.canRead(metadata, user))
        .map((metadata) => this.toPublicMetadata(metadata)),
    };
  }

  getEntity(entityLogicalName: string, user: AuthenticatedUser) {
    const metadata = getEntityMetadata(entityLogicalName);
    if (!metadata) {
      throw new NotFoundException(
        `Entity is not available: ${entityLogicalName}`,
      );
    }

    this.permissionResolver.assertCanRead(metadata, user);
    return this.toPublicMetadata(metadata);
  }

  private canRead(metadata: EntityMetadata, user: AuthenticatedUser) {
    try {
      this.permissionResolver.assertCanRead(metadata, user);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return false;
      }

      throw error;
    }
  }

  private toPublicMetadata(metadata: EntityMetadata) {
    return {
      logicalName: metadata.logicalName,
      primaryKey: metadata.primaryKey,
      permissions: this.toPublicPermissions(metadata.permissions),
      tenantScoped: metadata.tenantScoped,
      businessUnitScoped: metadata.businessUnitScoped,
      defaultSelect: metadata.defaultSelect,
      defaultOrderBy: metadata.defaultOrderBy,
      fields: Object.fromEntries(
        Object.entries(metadata.fields).map(([field, definition]) => [
          field,
          this.toPublicField(definition),
        ]),
      ),
      expands: Object.fromEntries(
        Object.entries(metadata.expands).map(([name, expand]) => [
          name,
          {
            maxDepth: expand.maxDepth,
            selectableFields: expand.selectableFields,
          },
        ]),
      ),
    };
  }

  private toPublicField(field: EntityFieldMetadata) {
    return {
      type: field.type,
      selectable: Boolean(field.selectable),
      filterable: Boolean(field.filterable),
      sortable: Boolean(field.sortable),
      searchable: Boolean(field.searchable),
    };
  }

  private toPublicPermissions(permissions: EntityPermissionMetadata) {
    return {
      read: permissions.read,
      create: permissions.create,
      update: permissions.update,
      delete: permissions.delete,
      assign: permissions.assign,
      share: permissions.share,
      import: permissions.import,
      export: permissions.export,
    };
  }
}
