import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomizationColumn,
  CustomizationFieldDataType,
  CustomizationForm,
  CustomizationFormType,
  CustomizationTable,
  CustomizationView,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateModuleViewDto } from '../views/dto/create-module-view.dto';
import { UpdateModuleViewDto } from '../views/dto/update-module-view.dto';
import {
  findSystemCustomizationTable,
  SYSTEM_CUSTOMIZATION_TABLES,
  SystemTableDefinition,
} from './customization.registry';
import {
  CreateCustomizationColumnDto,
  CreateCustomizationFormDto,
  CreateCustomizationViewDto,
  UpdateCustomizationColumnDto,
  UpdateCustomizationFormDto,
  UpdateCustomizationTableDto,
  UpdateCustomizationViewDto,
} from './dto/customization.dto';

@Injectable()
export class CustomizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(currentUser: AuthenticatedUser) {
    const [tables, tenantColumns, views, forms, snapshots] = await Promise.all([
      this.prisma.customizationTable.count({
        where: { tenantId: currentUser.tenantId },
      }),
      this.prisma.customizationColumn.count({
        where: { tenantId: currentUser.tenantId, isSystem: false },
      }),
      this.prisma.customizationView.count({
        where: { tenantId: currentUser.tenantId },
      }),
      this.prisma.customizationForm.count({
        where: { tenantId: currentUser.tenantId },
      }),
      this.prisma.customizationPublishSnapshot.count({
        where: { tenantId: currentUser.tenantId },
      }),
    ]);

    return {
      existingSystemTablesOnly: true,
      customTablesEnabled: false,
      systemTables: SYSTEM_CUSTOMIZATION_TABLES.length,
      tableOverrides: tables,
      configuredTables: tables,
      tenantColumns,
      views,
      tenantForms: forms,
      publishSnapshots: snapshots,
    };
  }

  async listTables(currentUser: AuthenticatedUser) {
    const tableRows = await this.prisma.customizationTable.findMany({
      where: { tenantId: currentUser.tenantId },
      orderBy: [{ tableKey: 'asc' }],
    });
    const rowByKey = new Map(tableRows.map((row) => [row.tableKey, row]));

    return SYSTEM_CUSTOMIZATION_TABLES.map((definition) => {
      const row = rowByKey.get(definition.tableKey);
      return {
        id: row?.id ?? null,
        tableKey: definition.tableKey,
        moduleKey: definition.moduleKey,
        systemName: row?.systemName ?? definition.systemName,
        displayName: row?.displayName ?? definition.displayName,
        pluralName: row?.pluralDisplayName ?? definition.pluralName,
        pluralDisplayName: row?.pluralDisplayName ?? definition.pluralName,
        description: row?.description ?? definition.description,
        icon: row?.icon ?? definition.icon ?? null,
        isCustomizable: row?.isCustomizable ?? true,
        isEnabled: row?.isActive ?? true,
        isActive: row?.isActive ?? true,
        isCustomTable: false,
        publishedAt: null,
        createdAt: row?.createdAt ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async getTable(currentUser: AuthenticatedUser, tableKey: string) {
    const [table] = await this.buildTableResponses(currentUser, [tableKey]);
    if (!table) {
      throw new NotFoundException(
        'Only existing system tables can be customized in this phase.',
      );
    }

    return table;
  }

  async getPublished(currentUser: AuthenticatedUser) {
    const snapshot = await this.prisma.customizationPublishSnapshot.findFirst({
      where: { tenantId: currentUser.tenantId, status: 'published' },
      orderBy: { version: 'desc' },
    });

    if (!snapshot) {
      return {
        published: false,
        version: null,
        publishedAt: null,
        snapshotJson: null,
      };
    }

    return {
      published: true,
      id: snapshot.id,
      version: snapshot.version,
      publishedAt: snapshot.publishedAt,
      publishedByUserId: snapshot.publishedByUserId,
      snapshotJson: snapshot.snapshotJson,
    };
  }

  async getPublishHistory(currentUser: AuthenticatedUser) {
    const snapshots = await this.prisma.customizationPublishSnapshot.findMany({
      where: { tenantId: currentUser.tenantId },
      orderBy: { version: 'desc' },
      take: 25,
      select: {
        id: true,
        version: true,
        status: true,
        publishedByUserId: true,
        publishedAt: true,
        createdAt: true,
      },
    });
    const userIds = [
      ...new Set(
        snapshots
          .map((snapshot) => snapshot.publishedByUserId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId: currentUser.tenantId, id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    return snapshots.map((snapshot) => {
      const user = snapshot.publishedByUserId
        ? userById.get(snapshot.publishedByUserId)
        : null;

      return {
        ...snapshot,
        publishedByName: user
          ? `${user.firstName} ${user.lastName}`.trim() || user.email
          : null,
        publishedByEmail: user?.email ?? null,
      };
    });
  }

  async updateTable(
    currentUser: AuthenticatedUser,
    tableKey: string,
    dto: UpdateCustomizationTableDto,
  ) {
    const definition = this.getSystemTableOrThrow(tableKey);

    return this.prisma.customizationTable.upsert({
      where: {
        tenantId_tableKey: {
          tenantId: currentUser.tenantId,
          tableKey,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        tableKey,
        systemName: definition.systemName,
        displayName: dto.displayName?.trim() ?? definition.displayName,
        pluralDisplayName:
          dto.pluralDisplayName?.trim() ?? definition.pluralName,
        description: dto.description?.trim() ?? definition.description,
        icon: dto.icon?.trim() ?? definition.icon,
        isCustomizable: dto.isCustomizable ?? true,
        isActive: dto.isActive ?? true,
      },
      update: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.pluralDisplayName !== undefined
          ? { pluralDisplayName: dto.pluralDisplayName.trim() }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon.trim() } : {}),
        ...(dto.isCustomizable !== undefined
          ? { isCustomizable: dto.isCustomizable }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async listColumns(currentUser: AuthenticatedUser, tableKey: string) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const definition = this.getSystemTableOrThrow(tableKey);
    const rows = await this.prisma.customizationColumn.findMany({
      where: { tenantId: currentUser.tenantId, tableId: table.id },
      orderBy: [{ sortOrder: 'asc' }, { columnKey: 'asc' }],
    });
    const rowByKey = new Map(rows.map((row) => [row.columnKey, row]));
    const systemColumns = definition.columns.map((column, index) => {
      const row = rowByKey.get(column.columnKey);
      return {
        id: row?.id ?? null,
        tableId: table.id,
        columnKey: column.columnKey,
        systemName: row?.systemName ?? column.columnKey,
        displayName: row?.displayName ?? column.displayName,
        dataType:
          row?.dataType ??
          (column.dataType as CustomizationFieldDataType),
        fieldType:
          row?.fieldType ??
          (column.dataType as CustomizationFieldDataType),
        isSystem: true,
        isRequired: row?.isRequired ?? column.isRequired ?? false,
        isSearchable: row?.isSearchable ?? column.isSearchable ?? false,
        isSortable: row?.isSortable ?? false,
        isVisible: row?.isVisible ?? true,
        isReadOnly: row?.isReadOnly ?? column.isReadOnly ?? true,
        maxLength: row?.maxLength ?? null,
        minValue: row?.minValue ?? null,
        maxValue: row?.maxValue ?? null,
        defaultValue: row?.defaultValue ?? null,
        lookupTargetTableKey: row?.lookupTargetTableKey ?? null,
        optionSetJson: row?.optionSetJson ?? null,
        validationJson: row?.validationJson ?? null,
        sortOrder: row?.sortOrder ?? index * 10,
      };
    });
    const tenantColumns = rows.filter(
      (row) =>
        !row.isSystem &&
        !definition.columns.some((column) => column.columnKey === row.columnKey),
    );

    return [...systemColumns, ...tenantColumns];
  }

  async createColumn(
    currentUser: AuthenticatedUser,
    tableKey: string,
    dto: CreateCustomizationColumnDto,
  ) {
    const definition = this.getSystemTableOrThrow(tableKey);
    if (definition.columns.some((column) => column.columnKey === dto.columnKey)) {
      throw new ConflictException('A system column already uses this key.');
    }
    this.validateLookupTarget(dto.lookupTargetTableKey);
    this.validateValueRules(dto);

    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );

    return this.prisma.customizationColumn.create({
      data: this.buildColumnData(currentUser.tenantId, table.id, dto, false),
    });
  }

  async updateColumn(
    currentUser: AuthenticatedUser,
    tableKey: string,
    columnKey: string,
    dto: UpdateCustomizationColumnDto,
  ) {
    const definition = this.getSystemTableOrThrow(tableKey);
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const systemColumn = definition.columns.find(
      (column) => column.columnKey === columnKey,
    );
    const existing = await this.prisma.customizationColumn.findUnique({
      where: {
        tenantId_tableId_columnKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          columnKey,
        },
      },
    });

    if (!systemColumn && !existing) {
      throw new NotFoundException('Customization column was not found.');
    }
    if (systemColumn?.isRequired && dto.isRequired === false) {
      throw new BadRequestException(
        'Required system columns cannot be made optional.',
      );
    }
    if (systemColumn && dto.fieldType && dto.fieldType !== systemColumn.dataType) {
      throw new BadRequestException(
        'System column field types cannot be changed.',
      );
    }
    if (!systemColumn && existing && dto.fieldType) {
      this.assertSafeFieldTypeChange(existing.fieldType, dto.fieldType);
    }
    this.validateLookupTarget(dto.lookupTargetTableKey);
    this.validateValueRules(dto);

    if (systemColumn && !existing) {
      return this.prisma.customizationColumn.create({
        data: this.buildColumnData(
          currentUser.tenantId,
          table.id,
          {
            columnKey,
            displayName: dto.displayName ?? systemColumn.displayName,
            dataType: systemColumn.dataType as CustomizationFieldDataType,
            fieldType: systemColumn.dataType as CustomizationFieldDataType,
            isRequired: dto.isRequired ?? systemColumn.isRequired ?? false,
            isVisible: dto.isVisible ?? true,
            isSearchable: dto.isSearchable ?? systemColumn.isSearchable ?? false,
            isReadOnly: dto.isReadOnly ?? systemColumn.isReadOnly ?? true,
            isSortable: dto.isSortable ?? false,
            maxLength: dto.maxLength,
            minValue: dto.minValue,
            maxValue: dto.maxValue,
            defaultValue: dto.defaultValue,
            lookupTargetTableKey: dto.lookupTargetTableKey,
            optionSetJson: dto.optionSetJson,
            validationJson: dto.validationJson,
            sortOrder: dto.sortOrder,
          },
          true,
          systemColumn.columnKey,
        ),
      });
    }

    return this.prisma.customizationColumn.update({
      where: {
        tenantId_tableId_columnKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          columnKey,
        },
      },
      data: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
        ...(dto.isVisible !== undefined ? { isVisible: dto.isVisible } : {}),
        ...(dto.isSearchable !== undefined
          ? { isSearchable: dto.isSearchable }
          : {}),
        ...(dto.isSortable !== undefined ? { isSortable: dto.isSortable } : {}),
        ...(dto.isReadOnly !== undefined ? { isReadOnly: dto.isReadOnly } : {}),
        ...(dto.fieldType !== undefined
          ? {
              fieldType: dto.fieldType,
              ...(existing?.isSystem ? {} : { dataType: dto.fieldType }),
            }
          : {}),
        ...(dto.maxLength !== undefined ? { maxLength: dto.maxLength } : {}),
        ...(dto.minValue !== undefined ? { minValue: dto.minValue } : {}),
        ...(dto.maxValue !== undefined ? { maxValue: dto.maxValue } : {}),
        ...(dto.defaultValue !== undefined
          ? { defaultValue: dto.defaultValue }
          : {}),
        ...(dto.lookupTargetTableKey !== undefined
          ? { lookupTargetTableKey: dto.lookupTargetTableKey }
          : {}),
        ...(dto.optionSetJson !== undefined
          ? { optionSetJson: dto.optionSetJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.validationJson !== undefined
          ? { validationJson: dto.validationJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deleteColumn(
    currentUser: AuthenticatedUser,
    tableKey: string,
    columnKey: string,
  ) {
    const definition = this.getSystemTableOrThrow(tableKey);
    if (definition.columns.some((column) => column.columnKey === columnKey)) {
      throw new BadRequestException('System columns cannot be deleted.');
    }

    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );

    await this.prisma.customizationColumn.delete({
      where: {
        tenantId_tableId_columnKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          columnKey,
        },
      },
    });

    return { deleted: true };
  }

  async listForms(currentUser: AuthenticatedUser, tableKey: string) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    return this.prisma.customizationForm.findMany({
      where: { tenantId: currentUser.tenantId, tableId: table.id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createForm(
    currentUser: AuthenticatedUser,
    tableKey: string,
    dto: CreateCustomizationFormDto,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    await this.validateFormLayout(currentUser, tableKey, dto.layoutJson);
    if ((dto.isDefault ?? false) && (dto.isActive ?? true)) {
      await this.assertDefaultFormContainsRequiredColumns(
        currentUser,
        tableKey,
        dto.layoutJson,
      );
    }

    if (dto.isDefault) {
      await this.prisma.customizationForm.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
    }

    return this.prisma.customizationForm.create({
      data: {
        tenantId: currentUser.tenantId,
        tableId: table.id,
        formKey: dto.formKey,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type ?? CustomizationFormType.main,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        layoutJson: dto.layoutJson as Prisma.InputJsonValue,
        createdByUserId: currentUser.userId,
      },
    });
  }

  async updateForm(
    currentUser: AuthenticatedUser,
    tableKey: string,
    formKey: string,
    dto: UpdateCustomizationFormDto,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const existing = await this.prisma.customizationForm.findUnique({
      where: {
        tenantId_tableId_formKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Customization form was not found.');
    }
    if (dto.layoutJson !== undefined) {
      await this.validateFormLayout(currentUser, tableKey, dto.layoutJson);
    }
    const nextLayout = dto.layoutJson ?? existing.layoutJson;
    const nextIsDefault = dto.isDefault ?? existing.isDefault;
    const nextIsActive = dto.isActive ?? existing.isActive;
    if (nextIsDefault && nextIsActive) {
      await this.assertDefaultFormContainsRequiredColumns(
        currentUser,
        tableKey,
        nextLayout,
      );
    }

    if (dto.isDefault) {
      await this.prisma.customizationForm.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
    }

    return this.prisma.customizationForm.update({
      where: {
        tenantId_tableId_formKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
        },
      },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.layoutJson !== undefined
          ? { layoutJson: dto.layoutJson as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async deleteForm(
    currentUser: AuthenticatedUser,
    tableKey: string,
    formKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    await this.prisma.customizationForm.delete({
      where: {
        tenantId_tableId_formKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
        },
      },
    });

    return { deleted: true };
  }

  async setDefaultForm(
    currentUser: AuthenticatedUser,
    tableKey: string,
    formKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const form = await this.prisma.customizationForm.findUnique({
      where: {
        tenantId_tableId_formKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
        },
      },
    });
    if (!form) {
      throw new NotFoundException('Customization form was not found.');
    }
    await this.assertDefaultFormContainsRequiredColumns(
      currentUser,
      tableKey,
      form.layoutJson,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.customizationForm.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
      return tx.customizationForm.update({
        where: {
          tenantId_tableId_formKey: {
            tenantId: currentUser.tenantId,
            tableId: table.id,
            formKey,
          },
        },
        data: { isDefault: true, isActive: true },
      });
    });
  }

  async listTableViews(currentUser: AuthenticatedUser, tableKey: string) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    return this.prisma.customizationView.findMany({
      where: { tenantId: currentUser.tenantId, tableId: table.id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createTableView(
    currentUser: AuthenticatedUser,
    tableKey: string,
    dto: CreateCustomizationViewDto,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    await this.validateViewMetadata(currentUser, tableKey, {
      columnsJson: dto.columnsJson,
      filtersJson: dto.filtersJson,
      sortingJson: dto.sortingJson,
    });
    if ((dto.isDefault ?? false) && (dto.isHidden ?? false)) {
      throw new BadRequestException('Default views cannot be hidden.');
    }

    if (dto.isDefault) {
      await this.prisma.customizationView.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
    }

    return this.prisma.customizationView.create({
      data: {
        tenantId: currentUser.tenantId,
        tableId: table.id,
        viewKey: dto.viewKey,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type ?? 'custom',
        isDefault: dto.isDefault ?? false,
        isHidden: dto.isHidden ?? false,
        columnsJson: dto.columnsJson as Prisma.InputJsonValue,
        filtersJson:
          dto.filtersJson !== undefined
            ? (dto.filtersJson as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        sortingJson:
          dto.sortingJson !== undefined
            ? (dto.sortingJson as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        visibilityScope: dto.visibilityScope ?? 'tenant',
        createdByUserId: currentUser.userId,
      },
    });
  }

  async updateTableView(
    currentUser: AuthenticatedUser,
    tableKey: string,
    viewKey: string,
    dto: UpdateCustomizationViewDto,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const existing = await this.prisma.customizationView.findUnique({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Customization view was not found.');
    }

    await this.validateViewMetadata(currentUser, tableKey, {
      columnsJson:
        dto.columnsJson ?? (existing.columnsJson as Record<string, unknown>),
      filtersJson:
        dto.filtersJson ??
        (existing.filtersJson as Record<string, unknown> | null) ??
        undefined,
      sortingJson:
        dto.sortingJson ??
        (existing.sortingJson as Record<string, unknown> | null) ??
        undefined,
    });
    const nextIsDefault = dto.isDefault ?? existing.isDefault;
    const nextIsHidden = dto.isHidden ?? existing.isHidden;
    if (nextIsDefault && nextIsHidden) {
      throw new BadRequestException('Default views cannot be hidden.');
    }

    if (dto.isDefault) {
      await this.prisma.customizationView.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
    }

    return this.prisma.customizationView.update({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.isHidden !== undefined ? { isHidden: dto.isHidden } : {}),
        ...(dto.columnsJson !== undefined
          ? { columnsJson: dto.columnsJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.filtersJson !== undefined
          ? { filtersJson: dto.filtersJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.sortingJson !== undefined
          ? { sortingJson: dto.sortingJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.visibilityScope !== undefined
          ? { visibilityScope: dto.visibilityScope }
          : {}),
      },
    });
  }

  async deleteTableView(
    currentUser: AuthenticatedUser,
    tableKey: string,
    viewKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const existing = await this.prisma.customizationView.findUnique({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Customization view was not found.');
    }
    if (existing.type === 'system') {
      throw new BadRequestException('System views cannot be deleted.');
    }

    await this.prisma.customizationView.delete({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });

    return { deleted: true };
  }

  async setTableViewHidden(
    currentUser: AuthenticatedUser,
    tableKey: string,
    viewKey: string,
    isHidden: boolean,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const view = await this.prisma.customizationView.findUnique({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });
    if (!view) {
      throw new NotFoundException('Customization view was not found.');
    }
    if (isHidden && view.isDefault) {
      throw new BadRequestException('Default views cannot be hidden.');
    }

    return this.prisma.customizationView.update({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
      data: { isHidden },
    });
  }

  async setDefaultTableView(
    currentUser: AuthenticatedUser,
    tableKey: string,
    viewKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const view = await this.prisma.customizationView.findUnique({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });
    if (!view) {
      throw new NotFoundException('Customization view was not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.customizationView.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
      return tx.customizationView.update({
        where: {
          tenantId_tableId_viewKey: {
            tenantId: currentUser.tenantId,
            tableId: table.id,
            viewKey,
          },
        },
        data: { isDefault: true, isHidden: false },
      });
    });
  }

  async listViews(currentUser: AuthenticatedUser, moduleKey?: string) {
    const tableKeys = moduleKey
      ? SYSTEM_CUSTOMIZATION_TABLES.filter((table) => table.moduleKey === moduleKey)
          .map((table) => table.tableKey)
      : SYSTEM_CUSTOMIZATION_TABLES.map((table) => table.tableKey);

    if (moduleKey && tableKeys.length === 0) {
      throw new BadRequestException(
        'Only existing system modules can be customized in this phase.',
      );
    }

    const tables = await this.prisma.customizationTable.findMany({
      where: { tenantId: currentUser.tenantId, tableKey: { in: tableKeys } },
      select: { id: true },
    });

    return this.prisma.customizationView.findMany({
      where: {
        tenantId: currentUser.tenantId,
        tableId: { in: tables.map((table) => table.id) },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createView(currentUser: AuthenticatedUser, dto: CreateModuleViewDto) {
    const definition = this.getFirstTableForModule(dto.moduleKey);
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      definition.tableKey,
    );
    const viewKey = slugKey(dto.slug ?? dto.name);
    const configJson = dto.configJson ?? {};
    const columnsJson =
      Array.isArray(configJson.columns) || typeof configJson.columns === 'object'
        ? configJson.columns
        : [];
    await this.validateViewMetadata(currentUser, definition.tableKey, {
      columnsJson,
      filtersJson: configJson.filters,
      sortingJson: configJson.sorting,
    });

    return this.prisma.customizationView.create({
      data: {
        tenantId: currentUser.tenantId,
        tableId: table.id,
        viewKey,
        name: dto.name.trim(),
        type: dto.type ?? 'custom',
        isDefault: dto.isDefault ?? false,
        isHidden: dto.isActive === false,
        columnsJson: columnsJson as Prisma.InputJsonValue,
        filtersJson:
          configJson.filters !== undefined
            ? (configJson.filters as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        sortingJson:
          configJson.sorting !== undefined
            ? (configJson.sorting as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        visibilityScope: dto.visibilityScope ?? 'tenant',
        createdByUserId: currentUser.userId,
      },
    });
  }

  async updateView(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateModuleViewDto,
  ) {
    const existing = await this.prisma.customizationView.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Customization view was not found.');
    }

    const configJson = dto.configJson ?? {};
    const table = await this.prisma.customizationTable.findFirst({
      where: { tenantId: currentUser.tenantId, id: existing.tableId },
    });
    if (!table) {
      throw new NotFoundException('Customization table was not found.');
    }
    if (dto.configJson !== undefined) {
      await this.validateViewMetadata(currentUser, table.tableKey, {
        columnsJson:
          configJson.columns !== undefined ? configJson.columns : existing.columnsJson,
        filtersJson:
          configJson.filters !== undefined
            ? configJson.filters
            : existing.filtersJson,
        sortingJson:
          configJson.sorting !== undefined
            ? configJson.sorting
            : existing.sortingJson,
      });
    }
    const viewUpdateData: Prisma.CustomizationViewUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.slug !== undefined ? { viewKey: slugKey(dto.slug) } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      ...(dto.isActive !== undefined ? { isHidden: !dto.isActive } : {}),
      ...(dto.configJson !== undefined
        ? {
            columnsJson:
              configJson.columns !== undefined
                ? (configJson.columns as Prisma.InputJsonValue)
                : (existing.columnsJson as Prisma.InputJsonValue),
            filtersJson:
              configJson.filters !== undefined
                ? (configJson.filters as Prisma.InputJsonValue)
                : existing.filtersJson === null
                  ? Prisma.JsonNull
                  : (existing.filtersJson as Prisma.InputJsonValue),
            sortingJson:
              configJson.sorting !== undefined
                ? (configJson.sorting as Prisma.InputJsonValue)
                : existing.sortingJson === null
                  ? Prisma.JsonNull
                  : (existing.sortingJson as Prisma.InputJsonValue),
          }
        : {}),
      ...(dto.visibilityScope !== undefined
        ? { visibilityScope: dto.visibilityScope }
        : {}),
    };

    return this.prisma.customizationView.update({
      where: { id },
      data: viewUpdateData,
    });
  }

  async deleteView(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.customizationView.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Customization view was not found.');
    }
    if (existing.type === 'system') {
      throw new BadRequestException('System views cannot be deleted.');
    }

    await this.prisma.customizationView.delete({ where: { id } });

    return { success: true };
  }

  async publish(currentUser: AuthenticatedUser) {
    const draft = await this.buildPublishDraft(currentUser.tenantId);
    const validationErrors = this.validatePublishDraft(draft);

    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: 'Customization publish validation failed.',
        errors: validationErrors,
      });
    }

    const latest = await this.prisma.customizationPublishSnapshot.findFirst({
      where: { tenantId: currentUser.tenantId },
      orderBy: { version: 'desc' },
    });
    const publishedAt = new Date();
    const snapshot = await this.prisma.customizationPublishSnapshot.create({
      data: {
        tenantId: currentUser.tenantId,
        version: (latest?.version ?? 0) + 1,
        status: 'published',
        publishedByUserId: currentUser.userId,
        publishedAt,
        snapshotJson: toJsonValue(draft),
      },
    });

    return {
      id: snapshot.id,
      version: snapshot.version,
      publishedAt,
      tables: draft.tables.length,
      columns: draft.columns.length,
      views: draft.views.length,
      forms: draft.forms.length,
    };
  }

  private async buildPublishDraft(tenantId: string) {
    await Promise.all(
      SYSTEM_CUSTOMIZATION_TABLES.map((definition) =>
        this.ensureCustomizationTable(tenantId, definition.tableKey),
      ),
    );

    const [tables, columns, views, forms] = await Promise.all([
      this.prisma.customizationTable.findMany({
        where: { tenantId },
        orderBy: { tableKey: 'asc' },
      }),
      this.prisma.customizationColumn.findMany({
        where: { tenantId },
        orderBy: [{ tableId: 'asc' }, { sortOrder: 'asc' }, { columnKey: 'asc' }],
      }),
      this.prisma.customizationView.findMany({
        where: { tenantId },
        orderBy: [{ tableId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.customizationForm.findMany({
        where: { tenantId },
        orderBy: [{ tableId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      }),
    ]);

    return { tables, columns, views, forms };
  }

  private validatePublishDraft(draft: PublishDraft) {
    const errors: PublishValidationError[] = [];
    const tableById = new Map(draft.tables.map((table) => [table.id, table]));
    const columnsByTableId = groupBy(draft.columns, (column) => column.tableId);
    const viewsByTableId = groupBy(draft.views, (view) => view.tableId);
    const formsByTableId = groupBy(draft.forms, (form) => form.tableId);

    for (const table of draft.tables) {
      const definition = findSystemCustomizationTable(table.tableKey);
      if (!definition) {
        errors.push({
          scope: 'table',
          tableKey: table.tableKey,
          entityKey: table.tableKey,
          message: 'Only existing system tables can be published.',
        });
        continue;
      }

      const effectiveColumns = buildEffectivePublishColumns(
        definition,
        columnsByTableId.get(table.id) ?? [],
      );
      const validColumnKeys = new Set(
        effectiveColumns.map((column) => column.columnKey),
      );
      const visibleColumnKeys = new Set(
        effectiveColumns
          .filter((column) => column.isVisible !== false)
          .map((column) => column.columnKey),
      );

      for (const column of effectiveColumns) {
        const isLookup =
          column.fieldType === 'lookup' || column.dataType === 'lookup';
        if (!isLookup) {
          continue;
        }
        if (!column.lookupTargetTableKey && !column.isSystem) {
          errors.push({
            scope: 'column',
            tableKey: table.tableKey,
            entityKey: column.columnKey,
            message: 'Custom lookup columns must have a lookup target table.',
          });
          continue;
        }
        if (
          column.lookupTargetTableKey &&
          !findSystemCustomizationTable(column.lookupTargetTableKey)
        ) {
          errors.push({
            scope: 'column',
            tableKey: table.tableKey,
            entityKey: column.columnKey,
            message: `Lookup target "${column.lookupTargetTableKey}" is not a customizable system table.`,
          });
        }
      }

      const tableViews = viewsByTableId.get(table.id) ?? [];
      if (
        tableViews.length > 0 &&
        !tableViews.some((view) => view.isDefault && !view.isHidden)
      ) {
        errors.push({
          scope: 'view',
          tableKey: table.tableKey,
          message: 'At least one visible default view is required before publishing.',
        });
      }

      for (const view of tableViews) {
        if (!tableById.has(view.tableId)) {
          errors.push({
            scope: 'view',
            tableKey: table.tableKey,
            entityKey: view.viewKey,
            message: 'View is linked to an unknown customization table.',
          });
          continue;
        }
        if (view.isDefault && view.isHidden) {
          errors.push({
            scope: 'view',
            tableKey: table.tableKey,
            entityKey: view.viewKey,
            message: 'Default views cannot be hidden.',
          });
        }
        pushInvalidColumnReferenceErrors(
          errors,
          'view',
          table.tableKey,
          view.viewKey,
          'View columns',
          extractColumnRefs(view.columnsJson, true),
          visibleColumnKeys,
        );
        pushInvalidColumnReferenceErrors(
          errors,
          'view',
          table.tableKey,
          view.viewKey,
          'View filters',
          extractColumnRefs(view.filtersJson),
          visibleColumnKeys,
        );
        pushInvalidColumnReferenceErrors(
          errors,
          'view',
          table.tableKey,
          view.viewKey,
          'View sorting',
          extractColumnRefs(view.sortingJson),
          visibleColumnKeys,
        );
      }

      const tableForms = formsByTableId.get(table.id) ?? [];
      if (
        tableForms.length > 0 &&
        !tableForms.some((form) => form.isDefault && form.isActive)
      ) {
        errors.push({
          scope: 'form',
          tableKey: table.tableKey,
          message: 'At least one active default form is required before publishing.',
        });
      }

      const requiredColumnKeys = effectiveColumns
        .filter((column) => column.isRequired)
        .map((column) => column.columnKey);
      for (const form of tableForms) {
        if (!tableById.has(form.tableId)) {
          errors.push({
            scope: 'form',
            tableKey: table.tableKey,
            entityKey: form.formKey,
            message: 'Form is linked to an unknown customization table.',
          });
          continue;
        }
        pushInvalidColumnReferenceErrors(
          errors,
          'form',
          table.tableKey,
          form.formKey,
          'Form layout',
          extractColumnRefs(form.layoutJson, true),
          validColumnKeys,
        );

        if (form.isDefault && form.isActive) {
          const visibleFormFields = extractVisibleFormFieldRefs(form.layoutJson);
          const missingRequired = requiredColumnKeys.filter(
            (columnKey) => !visibleFormFields.has(columnKey),
          );
          if (missingRequired.length > 0) {
            errors.push({
              scope: 'form',
              tableKey: table.tableKey,
              entityKey: form.formKey,
              message: `Default form is missing required fields: ${missingRequired.join(', ')}.`,
            });
          }
        }
      }
    }

    return errors;
  }

  private getSystemTableOrThrow(tableKey: string) {
    const table = findSystemCustomizationTable(tableKey);
    if (!table) {
      throw new NotFoundException(
        'Only existing system tables can be customized in this phase.',
      );
    }
    return table;
  }

  private async buildTableResponses(
    currentUser: AuthenticatedUser,
    tableKeys?: string[],
  ) {
    const definitions = tableKeys
      ? tableKeys.map((tableKey) => this.getSystemTableOrThrow(tableKey))
      : SYSTEM_CUSTOMIZATION_TABLES;
    const rows = await this.prisma.customizationTable.findMany({
      where: {
        tenantId: currentUser.tenantId,
        tableKey: { in: definitions.map((definition) => definition.tableKey) },
      },
    });
    const rowByKey = new Map(rows.map((row) => [row.tableKey, row]));

    return definitions.map((definition) => {
      const row = rowByKey.get(definition.tableKey);
      return {
        id: row?.id ?? null,
        tableKey: definition.tableKey,
        moduleKey: definition.moduleKey,
        systemName: row?.systemName ?? definition.systemName,
        displayName: row?.displayName ?? definition.displayName,
        pluralName: row?.pluralDisplayName ?? definition.pluralName,
        pluralDisplayName: row?.pluralDisplayName ?? definition.pluralName,
        description: row?.description ?? definition.description,
        icon: row?.icon ?? definition.icon ?? null,
        isCustomizable: row?.isCustomizable ?? true,
        isEnabled: row?.isActive ?? true,
        isActive: row?.isActive ?? true,
        isCustomTable: false,
        publishedAt: null,
        createdAt: row?.createdAt ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  private getFirstTableForModule(moduleKey: string) {
    const table = SYSTEM_CUSTOMIZATION_TABLES.find(
      (definition) =>
        definition.moduleKey === moduleKey || definition.tableKey === moduleKey,
    );
    if (!table) {
      throw new BadRequestException(
        'Only existing system modules can be customized in this phase.',
      );
    }
    return table;
  }

  private ensureCustomizationTable(tenantId: string, tableKey: string) {
    const definition = this.getSystemTableOrThrow(tableKey);
    return this.prisma.customizationTable.upsert({
      where: {
        tenantId_tableKey: { tenantId, tableKey },
      },
      create: this.buildTableCreateInput(tenantId, definition),
      update: {},
    });
  }

  private validateLookupTarget(lookupTargetTableKey?: string) {
    if (!lookupTargetTableKey) {
      return;
    }

    if (!findSystemCustomizationTable(lookupTargetTableKey)) {
      throw new BadRequestException(
        'Lookup target table must be an existing customizable system table.',
      );
    }
  }

  private validateValueRules(
    dto: Pick<
      CreateCustomizationColumnDto,
      'maxLength' | 'minValue' | 'maxValue' | 'optionSetJson'
    >,
  ) {
    if (
      dto.minValue !== undefined &&
      dto.maxValue !== undefined &&
      Number(dto.minValue) > Number(dto.maxValue)
    ) {
      throw new BadRequestException('Minimum value cannot exceed maximum value.');
    }

    if (dto.maxLength !== undefined && dto.maxLength < 1) {
      throw new BadRequestException('Maximum length must be at least 1.');
    }

    if (dto.optionSetJson !== undefined) {
      const values = Array.isArray(dto.optionSetJson)
        ? dto.optionSetJson
        : Array.isArray(dto.optionSetJson.options)
          ? dto.optionSetJson.options
          : null;
      if (!values) {
        throw new BadRequestException(
          'Option set JSON must include an options array.',
        );
      }
    }
  }

  private assertSafeFieldTypeChange(
    currentType: CustomizationFieldDataType,
    nextType: CustomizationFieldDataType,
  ) {
    if (currentType === nextType) {
      return;
    }

    const compatibleGroups: CustomizationFieldDataType[][] = [
      ['text', 'textarea', 'email', 'phone', 'url'],
      ['number', 'decimal', 'currency'],
      ['date', 'datetime'],
    ];
    const isCompatible = compatibleGroups.some(
      (group) => group.includes(currentType) && group.includes(nextType),
    );

    if (!isCompatible) {
      throw new BadRequestException(
        `Changing field type from ${currentType} to ${nextType} is not safe.`,
      );
    }
  }

  private async validateViewMetadata(
    currentUser: AuthenticatedUser,
    tableKey: string,
    metadata: {
      columnsJson?: unknown;
      filtersJson?: unknown;
      sortingJson?: unknown;
    },
  ) {
    const validColumnKeys = await this.getValidColumnKeySet(currentUser, tableKey);
    this.assertReferencedColumnsExist(
      'View columns',
      extractColumnRefs(metadata.columnsJson, true),
      validColumnKeys,
    );
    this.assertReferencedColumnsExist(
      'View filters',
      extractColumnRefs(metadata.filtersJson),
      validColumnKeys,
    );
    this.assertReferencedColumnsExist(
      'View sorting',
      extractColumnRefs(metadata.sortingJson),
      validColumnKeys,
    );
  }

  private async validateFormLayout(
    currentUser: AuthenticatedUser,
    tableKey: string,
    layoutJson: unknown,
  ) {
    const validColumnKeys = await this.getValidColumnKeySet(currentUser, tableKey);
    this.assertReferencedColumnsExist(
      'Form layout',
      extractColumnRefs(layoutJson, true),
      validColumnKeys,
    );
  }

  private async assertDefaultFormContainsRequiredColumns(
    currentUser: AuthenticatedUser,
    tableKey: string,
    layoutJson: unknown,
  ) {
    const columns = await this.listColumns(currentUser, tableKey);
    const requiredColumnKeys = columns
      .filter((column) => column.isRequired)
      .map((column) => column.columnKey);
    if (requiredColumnKeys.length === 0) {
      return;
    }

    const visibleFormFields = extractVisibleFormFieldRefs(layoutJson);
    const missingRequired = requiredColumnKeys.filter(
      (columnKey) => !visibleFormFields.has(columnKey),
    );
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Default forms must include required fields: ${missingRequired.join(', ')}.`,
      );
    }
  }

  private async getValidColumnKeySet(
    currentUser: AuthenticatedUser,
    tableKey: string,
  ) {
    const columns = await this.listColumns(currentUser, tableKey);
    return new Set(columns.map((column) => column.columnKey));
  }

  private assertReferencedColumnsExist(
    label: string,
    references: Set<string>,
    validColumnKeys: Set<string>,
  ) {
    const invalid = [...references].filter(
      (columnKey) => !validColumnKeys.has(columnKey),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `${label} reference unknown columns: ${invalid.join(', ')}.`,
      );
    }
  }

  private buildTableCreateInput(
    tenantId: string,
    definition: SystemTableDefinition,
  ): Prisma.CustomizationTableUncheckedCreateInput {
    return {
      tenantId,
      tableKey: definition.tableKey,
      systemName: definition.systemName,
      displayName: definition.displayName,
      pluralDisplayName: definition.pluralName,
      description: definition.description,
      icon: definition.icon,
      isCustomizable: true,
      isActive: true,
    };
  }

  private buildColumnData(
    tenantId: string,
    tableId: string,
    dto: CreateCustomizationColumnDto,
    isSystem: boolean,
    systemName = dto.columnKey,
  ): Prisma.CustomizationColumnUncheckedCreateInput {
    return {
      tenantId,
      tableId,
      columnKey: dto.columnKey,
      systemName,
      displayName: dto.displayName.trim(),
      dataType: dto.dataType,
      fieldType: dto.fieldType ?? dto.dataType,
      isSystem,
      isRequired: dto.isRequired ?? false,
      isSearchable: dto.isSearchable ?? false,
      isSortable: dto.isSortable ?? false,
      isVisible: dto.isVisible ?? true,
      isReadOnly: dto.isReadOnly ?? false,
      maxLength: dto.maxLength,
      minValue: dto.minValue,
      maxValue: dto.maxValue,
      defaultValue: dto.defaultValue,
      lookupTargetTableKey: dto.lookupTargetTableKey,
      optionSetJson: dto.optionSetJson as Prisma.InputJsonValue | undefined,
      validationJson: dto.validationJson as Prisma.InputJsonValue | undefined,
      sortOrder: dto.sortOrder ?? 0,
    };
  }
}

type PublishDraft = {
  tables: CustomizationTable[];
  columns: CustomizationColumn[];
  views: CustomizationView[];
  forms: CustomizationForm[];
};

type PublishValidationError = {
  scope: 'table' | 'column' | 'view' | 'form';
  tableKey?: string;
  entityKey?: string;
  message: string;
};

type EffectivePublishColumn = {
  columnKey: string;
  dataType: string;
  fieldType: string;
  isSystem: boolean;
  isRequired: boolean;
  isVisible: boolean;
  lookupTargetTableKey?: string | null;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function slugKey(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function buildEffectivePublishColumns(
  definition: SystemTableDefinition,
  rows: CustomizationColumn[],
): EffectivePublishColumn[] {
  const rowByKey = new Map(rows.map((row) => [row.columnKey, row]));
  const systemColumns = definition.columns.map((column) => {
    const row = rowByKey.get(column.columnKey);

    return {
      columnKey: column.columnKey,
      dataType: row?.dataType ?? column.dataType,
      fieldType: row?.fieldType ?? row?.dataType ?? column.dataType,
      isSystem: true,
      isRequired: row?.isRequired ?? column.isRequired ?? false,
      isVisible: row?.isVisible ?? true,
      lookupTargetTableKey: row?.lookupTargetTableKey ?? null,
    };
  });
  const tenantColumns = rows
    .filter(
      (row) =>
        !row.isSystem &&
        !definition.columns.some(
          (column) => column.columnKey === row.columnKey,
        ),
    )
    .map((row) => ({
      columnKey: row.columnKey,
      dataType: row.dataType,
      fieldType: row.fieldType,
      isSystem: false,
      isRequired: row.isRequired,
      isVisible: row.isVisible,
      lookupTargetTableKey: row.lookupTargetTableKey,
    }));

  return [...systemColumns, ...tenantColumns];
}

function groupBy<T>(
  values: T[],
  getKey: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

function pushInvalidColumnReferenceErrors(
  errors: PublishValidationError[],
  scope: 'view' | 'form',
  tableKey: string,
  entityKey: string,
  label: string,
  references: Set<string>,
  validColumnKeys: Set<string>,
) {
  const invalid = [...references].filter(
    (columnKey) => !validColumnKeys.has(columnKey),
  );
  if (invalid.length === 0) {
    return;
  }

  errors.push({
    scope,
    tableKey,
    entityKey,
    message: `${label} reference unavailable columns: ${invalid.join(', ')}.`,
  });
}

function extractVisibleFormFieldRefs(value: unknown, refs = new Set<string>()) {
  if (!value) {
    return refs;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractVisibleFormFieldRefs(item, refs);
    }
    return refs;
  }

  if (typeof value !== 'object') {
    return refs;
  }

  const record = value as Record<string, unknown>;
  const columnKey =
    typeof record.columnKey === 'string'
      ? record.columnKey
      : typeof record.fieldKey === 'string'
        ? record.fieldKey
        : typeof record.field === 'string'
          ? record.field
          : null;
  if (columnKey && record.isVisible !== false) {
    refs.add(columnKey);
  }

  for (const item of Object.values(record)) {
    if (typeof item === 'object' && item !== null) {
      extractVisibleFormFieldRefs(item, refs);
    }
  }

  return refs;
}

function extractColumnRefs(
  value: unknown,
  includeBareStrings = false,
  refs = new Set<string>(),
) {
  if (!value) {
    return refs;
  }

  if (typeof value === 'string') {
    if (!includeBareStrings) {
      return refs;
    }
    refs.add(value);
    return refs;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractColumnRefs(item, includeBareStrings, refs);
    }
    return refs;
  }

  if (typeof value !== 'object') {
    return refs;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['columnKey', 'fieldKey', 'field', 'accessorKey']) {
    const candidate = record[key];
    if (typeof candidate === 'string') {
      refs.add(candidate);
    }
  }

  for (const item of Object.values(record)) {
    if (typeof item === 'object' && item !== null) {
      extractColumnRefs(item, false, refs);
    } else if (Array.isArray(item)) {
      extractColumnRefs(item, false, refs);
    }
  }

  return refs;
}
