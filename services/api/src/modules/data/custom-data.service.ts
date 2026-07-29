import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomizationColumn,
  CustomizationFieldDataType,
  CustomizationTable,
  Prisma,
  SecurityPrivilege,
} from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntityPermissionResolver } from './entity-permission.resolver';
import { EntityScopeResolver } from './entity-scope.resolver';
import type { EntityMetadata } from './entity-query.types';
import { getEntityMetadata } from './entity-registry';

type CustomTable = CustomizationTable & { columns: CustomizationColumn[] };
type RelatedQuery = {
  parentEntity?: string;
  parentId?: string;
  relationship?: string;
  lookupField?: string;
  page?: string;
  pageSize?: string;
  search?: string;
};
type ParentScope = {
  organizationId?: string | null;
  businessUnitId?: string | null;
  ownerUserId?: string | null;
  ownerTeamId?: string | null;
};
type RelationshipResolution = {
  lookupField: string;
  parentId: string;
  parentScope: ParentScope;
};

const CUSTOM_METADATA: EntityMetadata = {
  logicalName: 'custom-records',
  prismaModel: 'customDataRecord',
  rbacEntityKey: ENTITY_KEYS.CUSTOM_RECORDS,
  primaryKey: 'id',
  permissions: {
    read: 'custom-records.read',
    create: 'custom-records.create',
    update: 'custom-records.write',
    delete: 'custom-records.delete',
  },
  tenantScoped: true,
  businessUnitScoped: true,
  scope: {
    tenantIdField: 'tenantId',
    businessUnitIdField: 'businessUnitId',
    organizationIdField: 'organizationId',
    ownerUserIdField: 'ownerUserId',
    ownerTeamIdField: 'ownerTeamId',
    createdByIdField: 'createdById',
  },
  defaultSelect: ['id'],
  defaultOrderBy: [{ field: 'createdAt', direction: 'desc' }],
  fields: {},
  expands: {},
};

@Injectable()
export class CustomDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionResolver: EntityPermissionResolver,
    private readonly scopeResolver: EntityScopeResolver,
    private readonly auditService: AuditService,
  ) {}

  async isCustomTable(entityLogicalName: string, tenantId: string) {
    return Boolean(await this.findTable(entityLogicalName, tenantId));
  }

  async getMetadata(entityLogicalName: string, user: AuthenticatedUser) {
    const table = await this.tableOrThrow(entityLogicalName, user.tenantId);
    this.permissionResolver.assertCan(
      CUSTOM_METADATA,
      user,
      SecurityPrivilege.READ,
    );
    const can = (privilege: SecurityPrivilege) => {
      try {
        this.permissionResolver.assertCan(CUSTOM_METADATA, user, privilege);
        return true;
      } catch (error) {
        if (error instanceof ForbiddenException) return false;
        throw error;
      }
    };
    return {
      logicalName: table.tableKey,
      primaryKey: 'id',
      isCustom: true,
      ownershipType: table.ownershipType ?? 'tenant',
      capabilities: {
        read: true,
        create: can(SecurityPrivilege.CREATE),
        update: can(SecurityPrivilege.WRITE),
        delete: can(SecurityPrivilege.DELETE),
        softDelete: true,
      },
      fields: Object.fromEntries(
        table.columns
          .filter((column) => column.isActive && column.isVisible)
          .filter((column) => {
            const permission = stringOrNull(
              readJson(column.validationJson).readPermission,
            );
            return !permission || user.permissionKeys.includes(permission);
          })
          .map((column) => [
            column.columnKey,
            {
              logicalName: column.columnKey,
              displayName: column.displayName,
              type: column.dataType,
              required: column.isRequired,
              readOnly:
                column.isReadOnly ||
                Boolean(
                  stringOrNull(
                    readJson(column.validationJson).writePermission,
                  ) &&
                  !user.permissionKeys.includes(
                    stringOrNull(
                      readJson(column.validationJson).writePermission,
                    )!,
                  ),
                ),
              maxLength: column.maxLength,
              lookupTargetTableKey: column.lookupTargetTableKey,
              validation: readJson(column.validationJson),
            },
          ]),
      ),
    };
  }

  async findMany(
    entityLogicalName: string,
    query: RelatedQuery,
    user: AuthenticatedUser,
  ) {
    const table = await this.tableOrThrow(entityLogicalName, user.tenantId);
    this.permissionResolver.assertCan(
      CUSTOM_METADATA,
      user,
      SecurityPrivilege.READ,
    );
    const relation = await this.resolveRelationship(table, query, user);
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(200, positiveInt(query.pageSize, 50));
    const scope = this.scopeResolver.buildScope(
      CUSTOM_METADATA,
      user,
      SecurityPrivilege.READ,
    ) as Prisma.CustomDataRecordWhereInput;
    const where: Prisma.CustomDataRecordWhereInput = {
      AND: [
        scope,
        { tenantId: user.tenantId, tableId: table.id, isDeleted: false },
        ...(relation
          ? [
              {
                values: {
                  path: [relation.lookupField],
                  equals: relation.parentId,
                },
              },
            ]
          : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.customDataRecord.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customDataRecord.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toPublicRecord(row, table, user)),
      meta: {
        entityLogicalName: table.tableKey,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async create(
    entityLogicalName: string,
    query: RelatedQuery,
    body: Record<string, unknown>,
    user: AuthenticatedUser,
  ) {
    const table = await this.tableOrThrow(entityLogicalName, user.tenantId);
    this.permissionResolver.assertCan(
      CUSTOM_METADATA,
      user,
      SecurityPrivilege.CREATE,
    );
    const relation = await this.resolveRelationship(table, query, user, true);
    const values = this.validateValues(
      table,
      body,
      user,
      'create',
      relation?.lookupField,
    );
    if (relation) values[relation.lookupField] = relation.parentId;
    const scope = await this.resolveCreateScope(table, relation, values, user);
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customDataRecord.create({
        data: {
          tenantId: user.tenantId,
          tableId: table.id,
          values: values as Prisma.InputJsonValue,
          ...scope,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          organizationId: created.organizationId,
          businessUnitId: created.businessUnitId,
          actorUserId: user.userId,
          action: 'custom-record.create',
          entityType: table.tableKey,
          entityId: created.id,
          sourceModule: 'data',
          afterSnapshot: this.toAuditRecord(created),
        },
        tx,
      );
      return created;
    });
    return this.toPublicRecord(record, table, user);
  }

  async update(
    entityLogicalName: string,
    recordId: string,
    query: RelatedQuery,
    body: Record<string, unknown>,
    user: AuthenticatedUser,
  ) {
    const table = await this.tableOrThrow(entityLogicalName, user.tenantId);
    this.permissionResolver.assertCan(
      CUSTOM_METADATA,
      user,
      SecurityPrivilege.WRITE,
    );
    const existing = await this.recordOrThrow(
      table,
      recordId,
      user,
      SecurityPrivilege.WRITE,
    );
    const relation = await this.resolveRelationship(table, query, user);
    if (
      relation &&
      readJson(existing.values)[relation.lookupField] !== relation.parentId
    ) {
      throw new NotFoundException('Related record was not found.');
    }
    const patch = this.validateValues(table, body, user, 'update');
    if (relation) delete patch[relation.lookupField];
    const values = { ...readJson(existing.values), ...patch };
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customDataRecord.update({
        where: { id: existing.id },
        data: {
          values: values as Prisma.InputJsonValue,
          updatedById: user.userId,
        },
      });
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          organizationId: updated.organizationId,
          businessUnitId: updated.businessUnitId,
          actorUserId: user.userId,
          action: 'custom-record.update',
          entityType: table.tableKey,
          entityId: updated.id,
          sourceModule: 'data',
          beforeSnapshot: this.toAuditRecord(existing),
          afterSnapshot: this.toAuditRecord(updated),
        },
        tx,
      );
      return updated;
    });
    return this.toPublicRecord(record, table, user);
  }

  async softDelete(
    entityLogicalName: string,
    recordIds: string[],
    query: RelatedQuery,
    user: AuthenticatedUser,
  ) {
    const table = await this.tableOrThrow(entityLogicalName, user.tenantId);
    this.permissionResolver.assertCan(
      CUSTOM_METADATA,
      user,
      SecurityPrivilege.DELETE,
    );
    if (!recordIds.length || recordIds.length > 200) {
      throw new BadRequestException('Provide between 1 and 200 record IDs.');
    }
    const relation = await this.resolveRelationship(table, query, user);
    const records = await Promise.all(
      [...new Set(recordIds)].map((id) =>
        this.recordOrThrow(table, id, user, SecurityPrivilege.DELETE),
      ),
    );
    if (
      relation &&
      records.some(
        (record) =>
          readJson(record.values)[relation.lookupField] !== relation.parentId,
      )
    ) {
      throw new NotFoundException('Related record was not found.');
    }
    await this.prisma.$transaction(async (tx) => {
      for (const record of records) {
        const deleted = await tx.customDataRecord.update({
          where: { id: record.id },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedById: user.userId,
          },
        });
        await this.auditService.log(
          {
            tenantId: user.tenantId,
            organizationId: deleted.organizationId,
            businessUnitId: deleted.businessUnitId,
            actorUserId: user.userId,
            action: 'custom-record.delete',
            entityType: table.tableKey,
            entityId: deleted.id,
            sourceModule: 'data',
            beforeSnapshot: this.toAuditRecord(record),
            afterSnapshot: this.toAuditRecord(deleted),
          },
          tx,
        );
      }
    });
    return {
      deleted: records.length,
      recordIds: records.map((record) => record.id),
    };
  }

  private async recordOrThrow(
    table: CustomTable,
    id: string,
    user: AuthenticatedUser,
    privilege: SecurityPrivilege,
  ) {
    const scope = this.scopeResolver.buildScope(
      CUSTOM_METADATA,
      user,
      privilege,
    );
    const record = await this.prisma.customDataRecord.findFirst({
      where: {
        AND: [
          scope as Prisma.CustomDataRecordWhereInput,
          { id, tenantId: user.tenantId, tableId: table.id, isDeleted: false },
        ],
      },
    });
    if (!record) throw new NotFoundException('Custom record was not found.');
    return record;
  }

  private async resolveRelationship(
    table: CustomTable,
    query: RelatedQuery,
    user: AuthenticatedUser,
    required = false,
  ): Promise<RelationshipResolution | null> {
    const supplied = Boolean(
      query.parentEntity || query.parentId || query.lookupField,
    );
    if (!supplied && !required) return null;
    if (!query.parentEntity || !query.parentId || !query.lookupField) {
      throw new BadRequestException(
        'parentEntity, parentId, and lookupField are required for related records.',
      );
    }
    const column = table.columns.find(
      (item) => item.columnKey === query.lookupField && item.isActive,
    );
    if (!column || column.dataType !== CustomizationFieldDataType.lookup) {
      throw new BadRequestException('Related lookup field is not configured.');
    }
    if (!sameEntity(column.lookupTargetTableKey, query.parentEntity)) {
      throw new BadRequestException(
        'Relationship parent does not match lookup metadata.',
      );
    }
    const parentScope = await this.resolveParentScope(
      query.parentEntity,
      query.parentId,
      user,
    );
    return {
      lookupField: column.columnKey,
      parentId: query.parentId,
      parentScope,
    };
  }

  private async resolveParentScope(
    entity: string,
    id: string,
    user: AuthenticatedUser,
  ) {
    if (sameEntity(entity, 'Employee') || sameEntity(entity, 'employees')) {
      const employeeMetadata = getEntityMetadata('employees');
      if (!employeeMetadata) {
        throw new NotFoundException('Parent entity metadata was not found.');
      }
      this.permissionResolver.assertCanRead(employeeMetadata, user);
      const employeeScope = this.scopeResolver.buildReadScope(
        employeeMetadata,
        user,
      );
      const employee = await this.prisma.employee.findFirst({
        where: {
          AND: [
            employeeScope as Prisma.EmployeeWhereInput,
            { id, tenantId: user.tenantId, isDeleted: false },
          ],
        },
        select: {
          id: true,
          businessUnitId: true,
          userId: true,
          businessUnit: { select: { organizationId: true } },
        },
      });
      if (!employee)
        throw new NotFoundException('Parent record was not found.');
      return {
        organizationId: employee.businessUnit?.organizationId,
        businessUnitId: employee.businessUnitId,
        ownerUserId: employee.userId,
      };
    }
    const parentTable = await this.tableOrThrow(entity, user.tenantId);
    const parent = await this.recordOrThrow(
      parentTable,
      id,
      user,
      SecurityPrivilege.READ,
    );
    return {
      organizationId: parent.organizationId,
      businessUnitId: parent.businessUnitId,
      ownerUserId: parent.ownerUserId,
      ownerTeamId: parent.ownerTeamId,
    };
  }

  private async resolveCreateScope(
    table: CustomTable,
    relation: RelationshipResolution | null,
    values: Record<string, unknown>,
    user: AuthenticatedUser,
  ) {
    const inherited = relation?.parentScope ?? {};
    const ownership = (table.ownershipType ?? 'tenant').toLowerCase();
    return {
      organizationId: stringOrNull(
        inherited.organizationId ??
          values.organizationId ??
          user.accessContext?.organizationId,
      ),
      businessUnitId: stringOrNull(
        inherited.businessUnitId ??
          values.businessUnitId ??
          user.accessContext?.businessUnitId,
      ),
      ownerUserId: stringOrNull(
        inherited.ownerUserId ??
          values.ownerUserId ??
          (ownership === 'user' ? user.userId : user.userId),
      ),
      ownerTeamId: stringOrNull(inherited.ownerTeamId ?? values.ownerTeamId),
    };
  }

  private validateValues(
    table: CustomTable,
    input: Record<string, unknown>,
    user: AuthenticatedUser,
    mode: 'create' | 'update',
    boundLookupField?: string,
  ) {
    const output: Record<string, unknown> = {};
    const errors: Record<string, string[]> = {};
    const columns = new Map(
      table.columns
        .filter((item) => item.isActive)
        .map((item) => [item.columnKey, item]),
    );
    for (const [key, value] of Object.entries(input)) {
      const column = columns.get(key);
      if (!column || !column.isVisible) continue;
      const rules = readJson(column.validationJson);
      const writePermission = stringOrNull(rules.writePermission);
      if (
        column.isReadOnly ||
        (writePermission && !user.permissionKeys.includes(writePermission))
      ) {
        errors[key] = ['Field is read-only.'];
        continue;
      }
      const error = validateValue(column, value);
      if (error) errors[key] = [error];
      else output[key] = value;
    }
    if (mode === 'create') {
      for (const column of columns.values()) {
        if (
          column.isRequired &&
          column.columnKey !== boundLookupField &&
          (output[column.columnKey] === undefined ||
            output[column.columnKey] === null ||
            output[column.columnKey] === '')
        ) {
          errors[column.columnKey] = ['Field is required.'];
        }
        if (
          output[column.columnKey] === undefined &&
          column.defaultValue !== null
        ) {
          output[column.columnKey] = column.defaultValue;
        }
      }
    }
    if (Object.keys(errors).length) {
      throw new BadRequestException({ message: 'Validation failed.', errors });
    }
    return output;
  }

  private toPublicRecord(
    record: {
      id: string;
      values: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
    },
    table: CustomTable,
    user: AuthenticatedUser,
  ) {
    const values = readJson(record.values);
    const secured: Record<string, unknown> = {};
    for (const column of table.columns.filter(
      (item) => item.isActive && item.isVisible,
    )) {
      const rules = readJson(column.validationJson);
      const readPermission = stringOrNull(rules.readPermission);
      if (readPermission && !user.permissionKeys.includes(readPermission))
        continue;
      const value = values[column.columnKey];
      secured[column.columnKey] =
        rules.mask === true && value ? maskValue(String(value)) : value;
    }
    return {
      id: record.id,
      ...secured,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toAuditRecord(record: {
    id: string;
    values: Prisma.JsonValue;
    isDeleted: boolean;
  }) {
    return {
      id: record.id,
      values: record.values,
      isDeleted: record.isDeleted,
    };
  }

  private async tableOrThrow(entity: string, tenantId: string) {
    const table = await this.findTable(entity, tenantId);
    if (!table)
      throw new NotFoundException(`Entity is not available: ${entity}`);
    return table;
  }

  private findTable(entity: string, tenantId: string) {
    return this.prisma.customizationTable.findFirst({
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
    });
  }
}

function readJson(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function sameEntity(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const normalize = (value: string | null | undefined) =>
    (value ?? '')
      .replace(/[^a-z0-9]/gi, '')
      .replace(/s$/i, '')
      .toLowerCase();
  return normalize(left) === normalize(right);
}
function maskValue(value: string) {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}
function validateValue(column: CustomizationColumn, value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (column.dataType === 'boolean' && typeof value !== 'boolean')
    return 'Must be a boolean.';
  if (
    ['number', 'decimal', 'currency'].includes(column.dataType) &&
    (typeof value !== 'number' || !Number.isFinite(value))
  )
    return 'Must be a number.';
  if (
    ['date', 'datetime'].includes(column.dataType) &&
    (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
  )
    return 'Must be a valid date.';
  if (
    typeof value === 'string' &&
    column.maxLength &&
    value.length > column.maxLength
  )
    return `Must not exceed ${column.maxLength} characters.`;
  return null;
}
