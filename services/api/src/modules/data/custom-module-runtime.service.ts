import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomizationColumn,
  CustomizationTable,
  SecurityPrivilege,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CUSTOM_RECORDS_METADATA } from './custom-records.metadata';
import { EntityPermissionResolver } from './entity-permission.resolver';
import {
  readPublishedCustomizationIndex,
  type PublishedCustomizationIndex,
} from './published-custom-modules';

export type PublishedCustomTable = CustomizationTable & {
  columns: CustomizationColumn[];
};

/*
 * Resolves which custom modules exist for end users, and what they look like.
 *
 * ADR-0016 / BUG-3494. A custom module is runtime-available when its live table
 * is an active custom table AND the tenant's latest published snapshot lists
 * it. Both halves are required: the snapshot alone would keep a deactivated
 * module alive, and the live row alone is what made draft modules reachable
 * through `/data` before this existed.
 *
 * The snapshot is read here rather than through `CustomizationService`
 * deliberately. Injecting that service would pull `CustomizationModule` — and
 * its access guard — into the data module to share one indexed `findFirst`;
 * this module already reads `customizationTable` directly for the same reason
 * (`custom-data.service.ts`).
 */
@Injectable()
export class CustomModuleRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionResolver: EntityPermissionResolver,
  ) {}

  /**
   * The live table for `entity` if it is runtime-available, with its columns
   * narrowed to the published ones; otherwise `null`.
   *
   * Narrowing columns matters for writes too: a column added in draft after
   * the last publish is neither shown on the published form nor accepted or
   * required by the record service.
   */
  async resolvePublishedTable(
    tenantId: string,
    entity: string,
  ): Promise<PublishedCustomTable | null> {
    const [index, table] = await Promise.all([
      this.loadPublishedIndex(tenantId),
      this.prisma.customizationTable.findFirst({
        where: {
          tenantId,
          isCustom: true,
          isActive: true,
          OR: [
            { tableKey: { equals: entity, mode: 'insensitive' } },
            { systemName: { equals: entity, mode: 'insensitive' } },
          ],
        },
        include: {
          columns: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
      }),
    ]);

    if (!index || !table || !index.tableIds.has(table.id)) return null;

    return {
      ...table,
      columns: table.columns.filter((column) => index.columnIds.has(column.id)),
    };
  }

  async listModules(user: AuthenticatedUser) {
    this.permissionResolver.assertCan(
      CUSTOM_RECORDS_METADATA,
      user,
      SecurityPrivilege.READ,
    );
    const index = await this.loadPublishedIndex(user.tenantId);
    if (!index || index.tableIds.size === 0) return { items: [] };

    const tables = await this.prisma.customizationTable.findMany({
      where: {
        tenantId: user.tenantId,
        isCustom: true,
        isActive: true,
        id: { in: [...index.tableIds] },
      },
      orderBy: [{ displayOrder: 'asc' }, { displayName: 'asc' }],
      select: {
        tableKey: true,
        displayName: true,
        pluralDisplayName: true,
        icon: true,
        displayOrder: true,
      },
    });

    return {
      items: tables.map((table) => ({
        moduleKey: table.tableKey,
        displayName: table.displayName,
        pluralDisplayName: table.pluralDisplayName || table.displayName,
        icon: table.icon,
        displayOrder: table.displayOrder,
      })),
    };
  }

  async getModule(user: AuthenticatedUser, moduleKey: string) {
    this.permissionResolver.assertCan(
      CUSTOM_RECORDS_METADATA,
      user,
      SecurityPrivilege.READ,
    );
    const [index, table] = await Promise.all([
      this.loadPublishedIndex(user.tenantId),
      this.resolvePublishedTable(user.tenantId, moduleKey),
    ]);
    if (!index || !table) {
      throw new NotFoundException(`Entity is not available: ${moduleKey}`);
    }

    const fields = table.columns
      .filter((column) => column.isVisible)
      .filter((column) => {
        const permission = stringOrNull(
          readJson(column.validationJson).readPermission,
        );
        return !permission || user.permissionKeys.includes(permission);
      })
      .map((column) => {
        const writePermission = stringOrNull(
          readJson(column.validationJson).writePermission,
        );
        return {
          logicalName: column.columnKey,
          displayName: column.displayName,
          dataType: column.dataType,
          required: column.isRequired,
          readOnly:
            column.isReadOnly ||
            Boolean(
              writePermission && !user.permissionKeys.includes(writePermission),
            ),
          isPrimaryName: column.isPrimaryName,
          maxLength: column.maxLength,
          lookupTargetTableKey: column.lookupTargetTableKey,
          options: readOptions(column.optionSetJson),
        };
      });

    return {
      moduleKey: table.tableKey,
      displayName: table.displayName,
      pluralDisplayName: table.pluralDisplayName || table.displayName,
      icon: table.icon,
      primaryNameField: resolvePrimaryNameField(fields),
      fields,
      forms: index.forms
        .filter((form) => form.tableId === table.id)
        .map(({ tableId: _tableId, ...form }) => form),
      views: index.views
        .filter((view) => view.tableId === table.id)
        .map(({ tableId: _tableId, ...view }) => view),
      capabilities: {
        read: true,
        create: this.can(user, SecurityPrivilege.CREATE),
        update: this.can(user, SecurityPrivilege.WRITE),
        delete: this.can(user, SecurityPrivilege.DELETE),
      },
    };
  }

  private async loadPublishedIndex(
    tenantId: string,
  ): Promise<PublishedCustomizationIndex | null> {
    const snapshot = await this.prisma.customizationPublishSnapshot.findFirst({
      where: { tenantId, status: 'published' },
      orderBy: { version: 'desc' },
      select: { snapshotJson: true },
    });
    return snapshot
      ? readPublishedCustomizationIndex(snapshot.snapshotJson)
      : null;
  }

  private can(user: AuthenticatedUser, privilege: SecurityPrivilege) {
    try {
      this.permissionResolver.assertCan(
        CUSTOM_RECORDS_METADATA,
        user,
        privilege,
      );
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }
}

function resolvePrimaryNameField(
  fields: ReadonlyArray<{
    logicalName: string;
    dataType: string;
    isPrimaryName: boolean;
  }>,
) {
  return (
    fields.find((field) => field.isPrimaryName)?.logicalName ??
    fields.find((field) => field.dataType === 'text')?.logicalName ??
    fields[0]?.logicalName ??
    'id'
  );
}

/*
 * `optionSetJson` is accepted as either an array or `{ options: [] }` by
 * `CustomizationService.validateValueRules`; entries have been written with
 * `value`, `key` or only `label`, so all three are read.
 */
function readOptions(value: unknown) {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(readJson(value).options)
      ? (readJson(value).options as unknown[])
      : [];
  return list.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim()) {
      return [{ value: entry.trim(), label: entry.trim() }];
    }
    const option = readJson(entry);
    const optionValue =
      stringOrNull(option.value) ??
      stringOrNull(option.key) ??
      stringOrNull(option.label);
    if (!optionValue) return [];
    return [
      {
        value: optionValue,
        label: stringOrNull(option.label) ?? optionValue,
      },
    ];
  });
}

function readJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
