/*
 * Values of tenant-defined custom fields on SYSTEM modules' records —
 * TASK-0034 / BUG-3697.
 *
 * This service stores and validates values; it never decides who may touch a
 * record. The owning module (EmployeesService for `employees`) resolves the
 * record and the caller's access to it FIRST, then calls in here with the
 * record id. That is why `recordId` is trusted here and why nothing here is
 * exposed through a controller of its own.
 *
 * Only PUBLISHED fields count: a field added in draft is neither shown nor
 * accepted until Publish, the rule custom modules already follow.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { readPublishedCustomizationIndex } from '../data/published-custom-modules';
import {
  customFieldDefinitions,
  readRecord,
  secureCustomFieldValues,
  validateCustomFieldInput,
  withoutUnchangedValues,
  type CustomFieldColumn,
} from './custom-field-values';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CustomFieldValuesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The published, active custom fields of a system module. */
  async publishedColumns(
    tenantId: string,
    tableKey: string,
    db: Db = this.prisma,
  ): Promise<CustomFieldColumn[]> {
    const [snapshot, table] = await Promise.all([
      db.customizationPublishSnapshot.findFirst({
        where: { tenantId, status: 'published' },
        orderBy: { version: 'desc' },
        select: { snapshotJson: true },
      }),
      db.customizationTable.findFirst({
        where: { tenantId, tableKey, isSystem: true },
        include: {
          columns: {
            where: { isActive: true, isCustom: true, isSystem: false },
            orderBy: [{ sortOrder: 'asc' }, { columnKey: 'asc' }],
          },
        },
      }),
    ]);
    if (!snapshot || !table) return [];
    const index = readPublishedCustomizationIndex(snapshot.snapshotJson);
    if (!index) return [];
    return table.columns.filter((column) => index.columnIds.has(column.id));
  }

  /** Field definitions for a form, filtered by the user's read permission. */
  async definitions(user: AuthenticatedUser, tableKey: string) {
    const columns = await this.publishedColumns(user.tenantId, tableKey);
    const targets = [
      ...new Set(
        columns
          .map((column) => column.lookupTargetTableKey)
          .filter((key): key is string => Boolean(key)),
      ),
    ];
    /*
     * BUG-3787 — a lookup can only label its options by the target's name. For
     * a custom module that is its primary-name column; one query for all
     * lookup targets. System targets carry no such column and are resolved
     * by the client's own map.
     */
    const nameColumns = targets.length
      ? await this.prisma.customizationColumn.findMany({
          where: {
            tenantId: user.tenantId,
            isPrimaryName: true,
            isActive: true,
            table: { tableKey: { in: targets }, isSystem: false },
          },
          select: { columnKey: true, table: { select: { tableKey: true } } },
        })
      : [];
    return customFieldDefinitions({
      columns,
      permissionKeys: user.permissionKeys,
      lookupNameFields: new Map(
        nameColumns.map((column) => [column.table.tableKey, column.columnKey]),
      ),
    });
  }

  /**
   * Whether the tenant has any active custom field on this system table, in
   * one indexed query. Every decorated route asks this first, so the common
   * case — no custom fields at all — never loads the published snapshot.
   */
  async hasCustomColumns(tenantId: string, tableKey: string) {
    const column = await this.prisma.customizationColumn.findFirst({
      where: {
        tenantId,
        isActive: true,
        isCustom: true,
        isSystem: false,
        table: { tableKey, isSystem: true },
      },
      select: { id: true },
    });
    return column !== null;
  }

  /** `read` for a page of records: one extension query, not one per row. */
  async readMany(
    user: AuthenticatedUser,
    tableKey: string,
    recordIds: readonly string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const ids = [...new Set(recordIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const [columns, rows] = await Promise.all([
      this.publishedColumns(user.tenantId, tableKey),
      this.prisma.customRecordExtension.findMany({
        where: { tenantId: user.tenantId, tableKey, recordId: { in: ids } },
        select: { recordId: true, values: true },
      }),
    ]);
    const stored = new Map(rows.map((row) => [row.recordId, row.values]));
    return new Map(
      ids.map((id) => [
        id,
        secureCustomFieldValues({
          columns,
          values: stored.get(id) ?? {},
          permissionKeys: user.permissionKeys,
        }),
      ]),
    );
  }

  /** The values a user may see on one record (every field present, null if unset). */
  async read(user: AuthenticatedUser, tableKey: string, recordId: string) {
    const [columns, row] = await Promise.all([
      this.publishedColumns(user.tenantId, tableKey),
      this.prisma.customRecordExtension.findUnique({
        where: {
          tenantId_tableKey_recordId: {
            tenantId: user.tenantId,
            tableKey,
            recordId,
          },
        },
        select: { values: true },
      }),
    ]);
    return secureCustomFieldValues({
      columns,
      values: row?.values ?? {},
      permissionKeys: user.permissionKeys,
    });
  }

  /**
   * Validates submitted values without writing them, so the owning module can
   * refuse a bad value BEFORE it writes its own record. Throws the standard
   * field-error shape, keyed `customFields.<field>`.
   */
  async validate(
    user: AuthenticatedUser,
    tableKey: string,
    submitted: unknown,
    mode: 'create' | 'update',
    /* On update: values equal to what the user reads today are not writes. */
    recordId?: string,
  ) {
    const columns = await this.publishedColumns(user.tenantId, tableKey);
    if (
      submitted !== undefined &&
      submitted !== null &&
      (typeof submitted !== 'object' || Array.isArray(submitted))
    ) {
      throw new BadRequestException({
        message: 'Validation failed.',
        errors: { customFields: ['Must be an object of field values.'] },
      });
    }
    const current =
      mode === 'update' && recordId
        ? await this.read(user, tableKey, recordId)
        : {};
    const { values, errors } = validateCustomFieldInput({
      columns,
      values: withoutUnchangedValues(readRecord(submitted), current),
      permissionKeys: user.permissionKeys,
      mode,
    });
    if (Object.keys(errors).length) {
      throw new BadRequestException({
        message: 'Validation failed.',
        errors: Object.fromEntries(
          Object.entries(errors).map(([key, messages]) => [
            `customFields.${key}`,
            messages,
          ]),
        ),
      });
    }
    return values;
  }

  /**
   * Merges already-validated values into the record's stored set. A key
   * submitted as null clears that field; keys not submitted are kept.
   */
  async write(
    user: AuthenticatedUser,
    tableKey: string,
    recordId: string,
    values: Record<string, unknown>,
    db: Db = this.prisma,
  ) {
    if (!Object.keys(values).length) return;
    const tenantId = user.tenantId;
    const existing = await db.customRecordExtension.findUnique({
      where: { tenantId_tableKey_recordId: { tenantId, tableKey, recordId } },
      select: { values: true },
    });
    const merged: Record<string, unknown> = { ...readRecord(existing?.values) };
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === '') delete merged[key];
      else merged[key] = value;
    }
    await db.customRecordExtension.upsert({
      where: { tenantId_tableKey_recordId: { tenantId, tableKey, recordId } },
      create: {
        tenantId,
        tableKey,
        recordId,
        values: merged as Prisma.InputJsonValue,
        updatedByUserId: user.userId,
      },
      update: {
        values: merged as Prisma.InputJsonValue,
        updatedByUserId: user.userId,
      },
    });
  }
}
