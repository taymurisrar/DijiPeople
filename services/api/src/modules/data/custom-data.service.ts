import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomizationFieldDataType,
  Prisma,
  SecurityPrivilege,
  type CustomDataRecord,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { lifecycleOf, parseStatusFilter } from './custom-record-lifecycle';
import {
  CUSTOM_SORT_ROW_CAP,
  ViewDefinitionError,
  SYSTEM_SORT_FIELDS,
  parseOrderBy,
  planView,
  sortRowsByColumns,
  type ViewSortKey,
} from './custom-view-query';
import { AuditService } from '../audit/audit.service';
import {
  CustomModuleRuntimeService,
  type PublishedCustomTable,
} from './custom-module-runtime.service';
import { CUSTOM_RECORDS_METADATA } from './custom-records.metadata';
import { EntityPermissionResolver } from './entity-permission.resolver';
import { EntityScopeResolver } from './entity-scope.resolver';
import { getEntityMetadata } from './entity-registry';
import {
  maskValue,
  validateCustomFieldValue as validateValue,
} from '../customization/custom-field-values';

type CustomTable = PublishedCustomTable;
type RelatedQuery = {
  /** Key of a published view: its filters, sort and the page total are applied server-side. */
  view?: string;
  /** Header-click ordering, "<field> asc|desc": applied to the whole filtered set, ahead of the view's own sort. */
  orderBy?: string;
  /** "active" | "inactive" | "all" (default). Server-side, so paging stays correct. */
  status?: string;
  /** "me" = only records owned by the caller. */
  owner?: string;
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

const CUSTOM_METADATA = CUSTOM_RECORDS_METADATA;

@Injectable()
export class CustomDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionResolver: EntityPermissionResolver,
    private readonly scopeResolver: EntityScopeResolver,
    private readonly auditService: AuditService,
    private readonly runtimeService: CustomModuleRuntimeService,
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
      moduleKind: table.moduleKind,
      capabilities: {
        read: true,
        create: can(SecurityPrivilege.CREATE),
        update:
          can(SecurityPrivilege.WRITE) && lifecycleOf(table.moduleKind).update,
        delete:
          can(SecurityPrivilege.DELETE) && lifecycleOf(table.moduleKind).delete,
        deactivate:
          can(SecurityPrivilege.WRITE) &&
          lifecycleOf(table.moduleKind).deactivate,
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

  /**
   * One record of a published custom module, for the runtime record screen.
   *
   * Same checks as every other path here, in the same order: the table must
   * be runtime-available for the caller's tenant (404 otherwise), the caller
   * must hold READ in both permission systems, and the record must fall inside
   * their `custom-records` READ row scope — `findFirst` with `tenantId`, never a
   * bare-id lookup.
   */
  async findOne(
    entityLogicalName: string,
    recordId: string,
    user: AuthenticatedUser,
  ) {
    const table = await this.tableOrThrow(entityLogicalName, user.tenantId);
    this.permissionResolver.assertCan(
      CUSTOM_METADATA,
      user,
      SecurityPrivilege.READ,
    );
    const record = await this.recordOrThrow(
      table,
      recordId,
      user,
      SecurityPrivilege.READ,
    );
    return this.toPublicRecord(record, table, user);
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
    const status = parseStatusFilter(query.status);
    if (!status) {
      throw new BadRequestException(
        'status must be one of: active, inactive, all.',
      );
    }
    if (query.owner !== undefined && query.owner !== 'me') {
      throw new BadRequestException('owner may only be "me".');
    }
    const viewPlan = await this.planRequestedView(
      table,
      query.view,
      query.orderBy,
      user,
    );
    const where: Prisma.CustomDataRecordWhereInput = {
      AND: [
        scope,
        { tenantId: user.tenantId, tableId: table.id, isDeleted: false },
        ...(status === 'all' ? [] : [{ isActive: status === 'active' }]),
        ...(query.owner === 'me' ? [{ ownerUserId: user.userId }] : []),
        ...(viewPlan?.where ?? []),
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
    const [rows, total] = viewPlan?.customSort
      ? await this.pageOrderedInMemory(
          where,
          viewPlan.customSort,
          page,
          pageSize,
        )
      : await Promise.all([
          this.prisma.customDataRecord.findMany({
            where,
            orderBy: viewPlan?.orderBy ?? [
              { createdAt: 'desc' },
              { id: 'asc' },
            ],
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

  /**
   * The query plan of a published view, or null when none was asked for. A view
   * that does not exist is Not Found rather than "all records": showing everything
   * under the name of a filtered view is the wrong answer this exists to remove.
   */
  private async planRequestedView(
    table: CustomTable,
    viewKey: string | undefined,
    orderBy: string | undefined,
    user: AuthenticatedUser,
  ) {
    const requestedSort = parseOrderBy(orderBy);
    const hasView = viewKey !== undefined && viewKey !== '';
    if (!hasView && !requestedSort) return null;
    let view: { filtersJson: unknown; sortingJson: unknown } = {
      filtersJson: [],
      sortingJson: [],
    };
    if (hasView) {
      if (!/^[a-z][a-zA-Z0-9]*$/.test(viewKey)) {
        throw new BadRequestException('view must be a view key.');
      }
      const resolved = await this.runtimeService.resolvePublishedView(
        user.tenantId,
        table.id,
        viewKey,
      );
      if (!resolved) throw new NotFoundException('View was not found.');
      view = resolved;
    }
    if (
      requestedSort &&
      !SYSTEM_SORT_FIELDS.has(requestedSort.field) &&
      !table.columns.some((column) => column.columnKey === requestedSort.field)
    ) {
      // An unknown field is a refusal, not "unsorted": the header the user clicked would silently do nothing.
      throw new BadRequestException(`Cannot sort by "${requestedSort.field}".`);
    }
    if (requestedSort) {
      view = {
        filtersJson: view.filtersJson,
        sortingJson: [
          { field: requestedSort.field, direction: requestedSort.direction },
        ],
      };
    }
    const columns = new Map(
      table.columns.map((column) => [
        column.columnKey,
        {
          readPermission: stringOrNull(
            readJson(column.validationJson).readPermission,
          ),
        },
      ]),
    );
    try {
      return planView(view, {
        userId: user.userId,
        permissionKeys: user.permissionKeys,
        columns,
      });
    } catch (error) {
      if (error instanceof ViewDefinitionError) {
        if (error.code === 'VIEW_FIELD_FORBIDDEN')
          throw new ForbiddenException(error.message);
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Ordering by a tenant column cannot be expressed in the query (the values live
   * in one JSON column), so the FILTERED set is read, ordered here and sliced.
   * Bounded: past the cap the caller is asked to narrow the view, never silently
   * given a partial or mis-ordered page.
   */
  private async pageOrderedInMemory(
    where: Prisma.CustomDataRecordWhereInput,
    sortKeys: ViewSortKey[],
    page: number,
    pageSize: number,
  ): Promise<[CustomDataRecord[], number]> {
    const total = await this.prisma.customDataRecord.count({ where });
    if (total > CUSTOM_SORT_ROW_CAP) {
      throw new BadRequestException(
        `This view sorts by a custom field and matches ${total} records; narrow it with a filter (limit ${CUSTOM_SORT_ROW_CAP}) or sort by a date.`,
      );
    }
    const all = await this.prisma.customDataRecord.findMany({ where });
    const ordered = sortRowsByColumns(all, sortKeys);
    return [ordered.slice((page - 1) * pageSize, page * pageSize), total];
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
    /*
     * BUG-3494 / ADR-0016 — a published custom module is a top-level runtime
     * module, so a record is created from its own list screen with no parent.
     * Before that, custom tables were reachable only as related records and
     * this call forced a parent on every create, which made the module's New
     * button unusable. A parent is still validated in full whenever any parent
     * field is supplied — a partial parent is refused inside
     * resolveRelationship — it is just no longer mandatory.
     */
    const relation = await this.resolveRelationship(table, query, user);
    const values = this.validateValues(
      table,
      body,
      user,
      'create',
      relation?.lookupField,
    );
    await this.assertLookupTargets(table, values, user);
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
    // `isActive` is record status, not a field value: it is read here by name and
    // never reaches validateValues or the values JSON (no mass assignment).
    const { isActive: requestedActive, ...valueBody } = body;
    if (requestedActive !== undefined && typeof requestedActive !== 'boolean') {
      throw new BadRequestException('isActive must be true or false.');
    }
    const lifecycle = lifecycleOf(table.moduleKind);
    if (Object.keys(valueBody).length > 0 && !lifecycle.update) {
      throw new AppError('CUSTOM_RECORD_IMMUTABLE');
    }
    if (requestedActive !== undefined && !lifecycle.deactivate) {
      throw new AppError('CUSTOM_RECORD_IMMUTABLE');
    }
    const patch = this.validateValues(table, valueBody, user, 'update');
    await this.assertLookupTargets(table, patch, user);
    if (relation) delete patch[relation.lookupField];
    const values = { ...readJson(existing.values), ...patch };
    const statusOnly = Object.keys(valueBody).length === 0;
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customDataRecord.update({
        where: { id: existing.id },
        data: {
          values: values as Prisma.InputJsonValue,
          updatedById: user.userId,
          ...(requestedActive !== undefined
            ? { isActive: requestedActive }
            : {}),
        },
      });
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          organizationId: updated.organizationId,
          businessUnitId: updated.businessUnitId,
          actorUserId: user.userId,
          action:
            statusOnly && requestedActive !== undefined
              ? requestedActive
                ? 'custom-record.activate'
                : 'custom-record.deactivate'
              : 'custom-record.update',
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
    if (!lifecycleOf(table.moduleKind).delete) {
      throw new AppError(
        table.moduleKind === 'IMMUTABLE'
          ? 'CUSTOM_RECORD_IMMUTABLE'
          : 'CUSTOM_RECORD_DELETE_NOT_ALLOWED',
      );
    }
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

  /**
   * A lookup to another CUSTOM module must name a live record of THAT module in
   * this tenant. Without the check a made-up id, or an id copied from another
   * tenant, was stored as if it were a relationship. A lookup to a SUPPORTED
   * built-in module (employees, users, organizations, business units, departments)
   * must name a record of the caller's own tenant that the caller may read; other
   * built-in targets are still resolved by their own services and not checked here.
   */
  private async assertLookupTargets(
    table: CustomTable,
    values: Record<string, unknown>,
    user: AuthenticatedUser,
  ) {
    const tenantId = user.tenantId;
    const errors: Record<string, string[]> = {};
    for (const column of table.columns) {
      const value = values[column.columnKey];
      if (
        column.dataType !== 'lookup' ||
        !column.lookupTargetTableKey ||
        value === undefined ||
        value === null ||
        value === ''
      )
        continue;
      const target = await this.prisma.customizationTable.findFirst({
        where: {
          tenantId,
          tableKey: column.lookupTargetTableKey,
          isCustom: true,
        },
        select: { id: true },
      });
      if (!target) {
        const builtIn = await this.builtInLookupExists(
          column.lookupTargetTableKey,
          value,
          user,
        );
        if (builtIn === false)
          errors[column.columnKey] = ['The selected record does not exist.'];
        continue;
      }
      const exists =
        typeof value === 'string' &&
        (await this.prisma.customDataRecord.count({
          where: { id: value, tenantId, tableId: target.id, isDeleted: false },
        })) > 0;
      if (!exists)
        errors[column.columnKey] = ['The selected record does not exist.'];
    }
    if (Object.keys(errors).length) {
      throw new BadRequestException({ message: 'Validation failed.', errors });
    }
  }

  /**
   * true / false for a supported built-in target, null when the target is not one
   * this service can check. A caller without read access to the target gets the
   * SAME answer as a missing record, so a lookup cannot be used to probe ids.
   */
  private async builtInLookupExists(
    targetKey: string,
    value: unknown,
    user: AuthenticatedUser,
  ): Promise<boolean | null> {
    const simple: Record<string, { model: string; permission: string }> = {
      users: { model: 'user', permission: 'users.read' },
      organizations: { model: 'organization', permission: 'hierarchy.read' },
      businessUnits: { model: 'businessUnit', permission: 'hierarchy.read' },
      departments: { model: 'department', permission: 'hierarchy.read' },
    };
    const isId = typeof value === 'string' && value.length > 0;
    if (targetKey === 'employees') {
      const metadata = getEntityMetadata('employees');
      if (!metadata) return null;
      if (!isId) return false;
      try {
        this.permissionResolver.assertCanRead(metadata, user);
      } catch {
        return false;
      }
      const scope = this.scopeResolver.buildReadScope(
        metadata,
        user,
      ) as Prisma.EmployeeWhereInput;
      return (
        (await this.prisma.employee.count({
          where: { AND: [scope, { id: value, tenantId: user.tenantId }] },
        })) > 0
      );
    }
    const target = simple[targetKey];
    if (!target) return null;
    if (!isId) return false;
    if (!(user.permissionKeys ?? []).includes(target.permission)) return false;
    const delegate = (
      this.prisma as unknown as Record<
        string,
        { count(args: unknown): Promise<number> }
      >
    )[target.model];
    return (
      (await delegate.count({
        where: { id: value, tenantId: user.tenantId },
      })) > 0
    );
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
      isActive: boolean;
      ownerUserId: string | null;
      createdById: string | null;
      updatedById: string | null;
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
      const value: unknown = values[column.columnKey];
      secured[column.columnKey] =
        rules.mask === true && value
          ? maskValue(
              typeof value === 'object'
                ? JSON.stringify(value)
                : String(value as string | number | boolean),
            )
          : value;
    }
    return {
      id: record.id,
      ...secured,
      isActive: record.isActive,
      ownerUserId: record.ownerUserId,
      createdById: record.createdById,
      updatedById: record.updatedById,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toAuditRecord(record: {
    id: string;
    values: Prisma.JsonValue;
    isDeleted: boolean;
    isActive: boolean;
  }) {
    return {
      id: record.id,
      values: record.values,
      isDeleted: record.isDeleted,
      isActive: record.isActive,
    };
  }

  private async tableOrThrow(entity: string, tenantId: string) {
    const table = await this.findTable(entity, tenantId);
    if (!table)
      throw new NotFoundException(`Entity is not available: ${entity}`);
    return table;
  }

  /*
   * BUG-3494 / ADR-0016. This used to accept any active custom table, so a
   * draft module's records could be listed, created and edited through `/data`
   * before anyone published it — the sidebar would only ever have hidden it,
   * which is a read filter, not an access control. Runtime availability now
   * has one definition, shared with the metadata the screens are built from.
   */
  private findTable(entity: string, tenantId: string) {
    return this.runtimeService.resolvePublishedTable(tenantId, entity);
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
