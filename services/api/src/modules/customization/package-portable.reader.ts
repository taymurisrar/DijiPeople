/*
 * Reads a workspace's customization metadata into the portable shape an
 * artifact carries — and, for an import, describes what the target already
 * has under each portable key.
 *
 * TASK-0033 / EXECPLAN-0052. One reader for both directions on purpose: a
 * component's checksum in the source and in the target are only comparable if
 * the same code produced both. Everything is batched per model (a package of a
 * thousand components costs a handful of queries, not a thousand), and every
 * query carries the caller's tenantId.
 *
 * What never leaves: database ids, user ids, timestamps, tenant ids. Identity
 * is the logical key; relations are expressed as keys too.
 */
import { Injectable } from '@nestjs/common';
import {
  CustomizationColumn,
  CustomizationEnvironmentVariable,
  CustomizationForm,
  CustomizationSolutionComponent,
  CustomizationTable,
  CustomizationView,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PORTABLE_COMPONENT_TYPES,
  PORTABLE_LAYER_ACTIONS,
  componentChecksum,
  type PortableComponentInput,
  type PortableComponentType,
  type PortableLayerAction,
} from './package-artifact';
import { readMetadataDependencies } from './dependency-validation';
import type { TargetEntry } from './package-comparison';

type Db = PrismaService | Prisma.TransactionClient;

export type PortableRead = {
  components: PortableComponentInput[];
  /* key -> the row it came from, for callers that must write back. */
  rowByKey: Map<string, CustomizationSolutionComponent>;
  displayNames: Map<string, string>;
};

/* Metadata keys that hold a field reference, and those that hold a module. */
const COLUMN_REFERENCE_KEYS = new Set([
  'columnKey',
  'fieldKey',
  'field',
  'fieldLogicalName',
  'referenceField',
  'referenceFieldKey',
  'sourceField',
  'targetField',
  'dependsOnFieldId',
  'fieldId',
]);
const TABLE_REFERENCE_KEYS = new Set([
  'lookupTargetTableKey',
  'targetTableKey',
  'targetModule',
  'targetModuleKey',
  'relatedTableKey',
  'relatedModule',
]);

/*
 * Bookkeeping the existing layer code writes into metadataJson that is either
 * a database id or meaningless outside this workspace.
 */
const VOLATILE_LAYER_KEYS = new Set([
  'id',
  'objectId',
  'tableId',
  'sourceObjectId',
  'baseComponentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'createdByUserId',
  'updatedByUserId',
  'publishedByUserId',
  'tenantId',
]);

@Injectable()
export class PackagePortableReader {
  constructor(private readonly prisma: PrismaService) {}

  /** Every component of one package, in portable form. */
  async readPackage(
    tenantId: string,
    packageId: string,
    db: Db = this.prisma,
  ): Promise<PortableRead> {
    const rows = await db.customizationSolutionComponent.findMany({
      where: {
        tenantId,
        solutionId: packageId,
        lifecycleState: { not: 'retired' },
      },
      orderBy: [{ componentType: 'asc' }, { objectKey: 'asc' }],
    });
    return this.toPortable(tenantId, rows, db);
  }

  async toPortable(
    tenantId: string,
    rows: readonly CustomizationSolutionComponent[],
    db: Db = this.prisma,
  ): Promise<PortableRead> {
    const objectIds = [...new Set(rows.map((row) => row.objectId))];
    const tableIds = [
      ...new Set(
        rows
          .map((row) => row.tableId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const [tables, columns, forms, views, variables, allTableKeys] =
      await Promise.all([
        db.customizationTable.findMany({
          where: {
            tenantId,
            id: { in: [...new Set([...objectIds, ...tableIds])] },
          },
        }),
        db.customizationColumn.findMany({
          where: {
            tenantId,
            OR: [{ id: { in: objectIds } }, { tableId: { in: tableIds } }],
          },
        }),
        db.customizationForm.findMany({
          where: { tenantId, id: { in: objectIds } },
        }),
        db.customizationView.findMany({
          where: { tenantId, id: { in: objectIds } },
        }),
        db.customizationEnvironmentVariable.findMany({
          where: { tenantId, id: { in: objectIds } },
        }),
        /* All module keys, so a relationship to a module outside the package is still seen. */
        db.customizationTable.findMany({
          where: { tenantId },
          select: { tableKey: true },
        }),
      ]);

    const tableById = new Map(tables.map((row) => [row.id, row]));
    const columnById = new Map(columns.map((row) => [row.id, row]));
    const formById = new Map(forms.map((row) => [row.id, row]));
    const viewById = new Map(views.map((row) => [row.id, row]));
    const variableById = new Map(variables.map((row) => [row.id, row]));
    const tableKeyById = new Map(tables.map((row) => [row.id, row.tableKey]));
    const columnKeysByTable = new Map<string, Set<string>>();
    for (const column of columns) {
      const tableKey = tableKeyById.get(column.tableId);
      if (!tableKey) continue;
      const set = columnKeysByTable.get(tableKey) ?? new Set<string>();
      set.add(column.columnKey);
      columnKeysByTable.set(tableKey, set);
    }
    const knownTableKeys = new Set(allTableKeys.map((row) => row.tableKey));

    const components: PortableComponentInput[] = [];
    const rowByKey = new Map<string, CustomizationSolutionComponent>();
    const displayNames = new Map<string, string>();

    for (const row of rows) {
      if (
        !(PORTABLE_COMPONENT_TYPES as readonly string[]).includes(
          row.componentType,
        )
      ) {
        continue;
      }
      const type = row.componentType as PortableComponentType;
      const base =
        type === 'table'
          ? tableById.get(row.objectId)
          : type === 'column'
            ? columnById.get(row.objectId)
            : type === 'form'
              ? formById.get(row.objectId)
              : type === 'view'
                ? viewById.get(row.objectId)
                : type === 'environmentVariable'
                  ? variableById.get(row.objectId)
                  : undefined;
      const objectKey = logicalObjectKey(type, row, base, tableKeyById);
      const parentKey =
        type === 'table' || type === 'environmentVariable'
          ? null
          : objectKey.split('.')[0];
      const layerAction = toLayerAction(row.layerAction, row.isSystem);
      const baseIsSystem = Boolean(
        base && 'isSystem' in base ? base.isSystem : row.isSystem,
      );
      const owned = layerAction === 'create' && !baseIsSystem;
      const definition = owned && base ? definitionOf(type, base) : null;
      const layer =
        layerAction === 'reference' ? null : normalizeLayer(row.metadataJson);

      const key = `${type}:${objectKey}`;
      const dependsOn = new Set<string>();
      if (parentKey) dependsOn.add(`table:${parentKey}`);
      if (
        type === 'column' &&
        base &&
        'lookupTargetTableKey' in base &&
        base.lookupTargetTableKey
      ) {
        dependsOn.add(`table:${base.lookupTargetTableKey}`);
      }
      const scanned = [definition, layer];
      for (const value of scanned) {
        collectReferences(
          value,
          parentKey,
          columnKeysByTable,
          knownTableKeys,
          dependsOn,
        );
      }
      dependsOn.delete(key);

      components.push({
        key,
        type,
        objectKey,
        parentKey,
        layerAction,
        baseIsSystem,
        definition,
        layer,
        dependsOn: [...dependsOn].sort(),
      });
      rowByKey.set(key, row);
      displayNames.set(key, displayNameOf(type, base, row));
    }

    return { components, rowByKey, displayNames };
  }

  /**
   * What the target workspace has under each key, for the comparison engine.
   * Batched: one query per model regardless of how many keys are asked about.
   */
  async readTargetIndex(input: {
    tenantId: string;
    importingPackageKey: string;
    keys: readonly string[];
    db?: Db;
  }): Promise<{
    target: Map<string, TargetEntry>;
    ownedByPackageInTarget: string[];
    importingPackageId: string | null;
  }> {
    const db = input.db ?? this.prisma;
    const { tenantId } = input;
    const parsed = input.keys.map(parseKey).filter((entry) => entry !== null);

    const tableKeys = new Set<string>();
    for (const entry of parsed) {
      if (entry.type === 'table') tableKeys.add(entry.objectKey);
      else if (entry.type !== 'environmentVariable')
        tableKeys.add(entry.objectKey.split('.')[0]);
    }
    const variableKeys = parsed
      .filter((entry) => entry.type === 'environmentVariable')
      .map((entry) => entry.objectKey);

    const [tables, variables, importingPackage] = await Promise.all([
      db.customizationTable.findMany({
        where: { tenantId, tableKey: { in: [...tableKeys] } },
      }),
      db.customizationEnvironmentVariable.findMany({
        where: { tenantId, variableKey: { in: variableKeys } },
      }),
      db.customizationSolution.findFirst({
        where: { tenantId, solutionKey: input.importingPackageKey },
      }),
    ]);
    const tableIds = tables.map((row) => row.id);
    const [columns, forms, views] = await Promise.all([
      db.customizationColumn.findMany({
        where: { tenantId, tableId: { in: tableIds } },
      }),
      db.customizationForm.findMany({
        where: { tenantId, tableId: { in: tableIds } },
      }),
      db.customizationView.findMany({
        where: { tenantId, tableId: { in: tableIds } },
      }),
    ]);
    const tableKeyById = new Map(tables.map((row) => [row.id, row.tableKey]));

    /* key -> base row, for the four row-backed types plus variables. */
    const baseByKey = new Map<
      string,
      { id: string; isSystem: boolean; definition: Record<string, unknown> }
    >();
    for (const row of tables) {
      baseByKey.set(`table:${row.tableKey}`, {
        id: row.id,
        isSystem: row.isSystem,
        definition: definitionOf('table', row),
      });
    }
    for (const row of columns) {
      const tableKey = tableKeyById.get(row.tableId);
      if (tableKey)
        baseByKey.set(`column:${tableKey}.${row.columnKey}`, {
          id: row.id,
          isSystem: row.isSystem,
          definition: definitionOf('column', row),
        });
    }
    for (const row of forms) {
      const tableKey = tableKeyById.get(row.tableId);
      if (tableKey)
        baseByKey.set(`form:${tableKey}.${row.formKey}`, {
          id: row.id,
          isSystem: row.isSystem,
          definition: definitionOf('form', row),
        });
    }
    for (const row of views) {
      const tableKey = tableKeyById.get(row.tableId);
      if (tableKey)
        baseByKey.set(`view:${tableKey}.${row.viewKey}`, {
          id: row.id,
          isSystem: row.isSystem,
          definition: definitionOf('view', row),
        });
    }
    for (const row of variables) {
      baseByKey.set(`environmentVariable:${row.variableKey}`, {
        id: row.id,
        isSystem: false,
        definition: definitionOf('environmentVariable', row),
      });
    }

    /*
     * Every component row that could own or layer one of these keys. JSON-only
     * types (choice lists, relationships, action bars, widgets) exist only as
     * component rows, so they are found by objectKey.
     */
    const jsonOnlyKeys = parsed.filter((entry) =>
      ['optionSet', 'lookup', 'actionBar', 'widget'].includes(entry.type),
    );
    const rowBackedIds = [...baseByKey.values()].map((entry) => entry.id);
    const componentRows = await db.customizationSolutionComponent.findMany({
      where: {
        tenantId,
        lifecycleState: { not: 'retired' },
        OR: [
          { objectId: { in: rowBackedIds } },
          ...(jsonOnlyKeys.length
            ? [
                {
                  OR: jsonOnlyKeys.map((entry) => ({
                    componentType: entry.type,
                    objectKey: entry.objectKey,
                  })),
                },
              ]
            : []),
        ],
      },
      include: { solution: true },
    });

    const keyByBaseId = new Map<string, string>();
    for (const [key, entry] of baseByKey) {
      keyByBaseId.set(`${key.split(':')[0]}|${entry.id}`, key);
    }
    const componentsByKey = new Map<string, typeof componentRows>();
    for (const row of componentRows) {
      const key =
        keyByBaseId.get(`${row.componentType}|${row.objectId}`) ??
        `${row.componentType}:${row.objectKey}`;
      componentsByKey.set(key, [...(componentsByKey.get(key) ?? []), row]);
    }

    /* The importing package's own current layers, in the same portable form. */
    const importingRows = importingPackage
      ? await db.customizationSolutionComponent.findMany({
          where: {
            tenantId,
            solutionId: importingPackage.id,
            lifecycleState: { not: 'retired' },
          },
        })
      : [];
    const importingPortable = importingRows.length
      ? await this.toPortable(tenantId, importingRows, db)
      : { components: [] as PortableComponentInput[] };
    const currentByKey = new Map(
      importingPortable.components.map((component) => [
        component.key,
        component,
      ]),
    );

    const installedChecksums = new Map<string, string>();
    if (importingPackage?.installedVersion) {
      const installed = await db.customizationPackageVersion.findFirst({
        where: {
          tenantId,
          packageId: importingPackage.id,
          version: importingPackage.installedVersion,
        },
        select: { artifactJson: true },
      });
      const artifact = installed?.artifactJson as
        | { components?: { key?: unknown; checksum?: unknown }[] }
        | null
        | undefined;
      for (const component of artifact?.components ?? []) {
        if (
          typeof component.key === 'string' &&
          typeof component.checksum === 'string'
        ) {
          installedChecksums.set(component.key, component.checksum);
        }
      }
    }

    const target = new Map<string, TargetEntry>();
    const allKeys = new Set([...input.keys, ...currentByKey.keys()]);
    for (const key of allKeys) {
      const base = baseByKey.get(key);
      const rowsForKey = componentsByKey.get(key) ?? [];
      const current = currentByKey.get(key) ?? null;
      if (!base && !rowsForKey.length && !current) continue;

      const creator = rowsForKey.find((row) => row.layerAction === 'create');
      const coreRow = rowsForKey.find(
        (row) => row.solution.isDefault && row.solution.isSystem,
      );
      const ownerKind: TargetEntry['ownerKind'] =
        base?.isSystem || (!creator && coreRow)
          ? 'core'
          : creator
            ? 'package'
            : 'unowned';
      target.set(key, {
        ownerKind,
        ownerPackageKey:
          ownerKind === 'package'
            ? (creator?.solution.solutionKey ?? null)
            : null,
        ownerPackageName:
          ownerKind === 'package'
            ? (creator?.solution.displayName ?? null)
            : ownerKind === 'core'
              ? 'DijiPeople Core'
              : null,
        ownedByImportingPackage:
          ownerKind === 'package' &&
          creator?.solution.solutionKey === input.importingPackageKey,
        current: current ? { ...current } : null,
        installedChecksum: installedChecksums.get(key) ?? null,
        definition: base?.definition ?? null,
      });
    }

    return {
      target,
      ownedByPackageInTarget: [...currentByKey.keys()],
      importingPackageId: importingPackage?.id ?? null,
    };
  }
}

/* ------------------------------------------------------------------ helpers */

export function parseKey(key: string) {
  const index = key.indexOf(':');
  if (index <= 0) return null;
  const type = key.slice(0, index);
  const objectKey = key.slice(index + 1);
  if (
    !(PORTABLE_COMPONENT_TYPES as readonly string[]).includes(type) ||
    !objectKey
  ) {
    return null;
  }
  return { type: type as PortableComponentType, objectKey };
}

function toLayerAction(value: string, isSystem: boolean): PortableLayerAction {
  return (PORTABLE_LAYER_ACTIONS as readonly string[]).includes(value)
    ? (value as PortableLayerAction)
    : isSystem
      ? 'reference'
      : 'create';
}

/*
 * The objectKey is recomputed from the base row where one exists: some older
 * component rows stored `<tableId>.<key>` when the table lookup missed, and a
 * database id must never become a portable identity.
 */
function logicalObjectKey(
  type: PortableComponentType,
  row: CustomizationSolutionComponent,
  base: unknown,
  tableKeyById: Map<string, string>,
) {
  if (!base) return row.objectKey;
  if (type === 'table') return (base as CustomizationTable).tableKey;
  if (type === 'environmentVariable')
    return (base as CustomizationEnvironmentVariable).variableKey;
  const tableId = (base as { tableId: string }).tableId;
  const tableKey = tableKeyById.get(tableId) ?? row.objectKey.split('.')[0];
  if (type === 'column')
    return `${tableKey}.${(base as CustomizationColumn).columnKey}`;
  if (type === 'form')
    return `${tableKey}.${(base as CustomizationForm).formKey}`;
  if (type === 'view')
    return `${tableKey}.${(base as CustomizationView).viewKey}`;
  return row.objectKey;
}

export function definitionOf(
  type: string,
  row: unknown,
): Record<string, unknown> {
  if (type === 'table') {
    const table = row as CustomizationTable;
    return {
      tableKey: table.tableKey,
      systemName: table.systemName,
      displayName: table.displayName,
      pluralDisplayName: table.pluralDisplayName,
      description: table.description ?? null,
      icon: table.icon ?? null,
      ownershipType: table.ownershipType ?? null,
      moduleKey: table.moduleKey ?? null,
      displayOrder: table.displayOrder,
      isCustomizable: table.isCustomizable,
      isVisibleInCustomization: table.isVisibleInCustomization,
      isValidForAdvancedFind: table.isValidForAdvancedFind,
      isValidForFormDesigner: table.isValidForFormDesigner,
      isValidForViewDesigner: table.isValidForViewDesigner,
      isActive: table.isActive,
    };
  }
  if (type === 'column') {
    const column = row as CustomizationColumn;
    return {
      columnKey: column.columnKey,
      systemName: column.systemName,
      displayName: column.displayName,
      description: column.description ?? null,
      dataType: column.dataType,
      fieldType: column.fieldType,
      isRequired: column.isRequired,
      isSearchable: column.isSearchable,
      isFilterable: column.isFilterable,
      isSortable: column.isSortable,
      isVisible: column.isVisible,
      isVisibleInCustomization: column.isVisibleInCustomization,
      isValidForFormDesigner: column.isValidForFormDesigner,
      isValidForViewDesigner: column.isValidForViewDesigner,
      isReadOnly: column.isReadOnly,
      isPrimaryName: column.isPrimaryName,
      isActive: column.isActive,
      maxLength: column.maxLength ?? null,
      minValue: column.minValue === null ? null : column.minValue.toString(),
      maxValue: column.maxValue === null ? null : column.maxValue.toString(),
      defaultValue: column.defaultValue ?? null,
      lookupTargetTableKey: column.lookupTargetTableKey ?? null,
      optionSetJson: column.optionSetJson ?? null,
      validationJson: column.validationJson ?? null,
      sortOrder: column.sortOrder,
    };
  }
  if (type === 'form') {
    const form = row as CustomizationForm;
    return {
      formKey: form.formKey,
      name: form.name,
      description: form.description ?? null,
      type: form.type,
      isDefault: form.isDefault,
      isActive: form.isActive,
      layoutJson: form.layoutJson,
    };
  }
  if (type === 'view') {
    const view = row as CustomizationView;
    return {
      viewKey: view.viewKey,
      name: view.name,
      description: view.description ?? null,
      type: view.type,
      isDefault: view.isDefault,
      isHidden: view.isHidden,
      columnsJson: view.columnsJson,
      filtersJson: view.filtersJson ?? null,
      sortingJson: view.sortingJson ?? null,
      visibilityScope: view.visibilityScope,
    };
  }
  if (type === 'environmentVariable') {
    const variable = row as CustomizationEnvironmentVariable;
    return {
      variableKey: variable.variableKey,
      displayName: variable.displayName,
      description: variable.description ?? null,
      type: variable.type,
      isRequired: variable.isRequired,
      /* A secret's default would be exported in clear text: never carried. */
      defaultValue:
        variable.type === 'secret' ? null : (variable.defaultValue ?? null),
    };
  }
  return {};
}

export function normalizeLayer(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cleaned = stripVolatile(value) as Record<string, unknown>;
  return Object.keys(cleaned).length ? cleaned : null;
}

function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (VOLATILE_LAYER_KEYS.has(key)) continue;
    result[key] = stripVolatile(child);
  }
  return result;
}

function collectReferences(
  value: unknown,
  parentKey: string | null,
  columnKeysByTable: Map<string, Set<string>>,
  knownTableKeys: Set<string>,
  into: Set<string>,
) {
  const parentColumns = parentKey
    ? columnKeysByTable.get(parentKey)
    : undefined;
  const addColumnRef = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (text.includes('.')) {
      const [tableKey, columnKey] = text.split('.');
      if (columnKeysByTable.get(tableKey)?.has(columnKey)) {
        into.add(`column:${tableKey}.${columnKey}`);
      }
      return;
    }
    if (parentKey && parentColumns?.has(text))
      into.add(`column:${parentKey}.${text}`);
  };

  const visit = (node: unknown, key: string) => {
    if (typeof node === 'string') {
      if (COLUMN_REFERENCE_KEYS.has(key)) addColumnRef(node);
      if (TABLE_REFERENCE_KEYS.has(key) && knownTableKeys.has(node.trim())) {
        into.add(`table:${node.trim()}`);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [childKey, child] of Object.entries(node))
      visit(child, childKey);
  };
  visit(value, '');

  /* The existing scanner's reference keys, resolved against real fields. */
  for (const reference of readMetadataDependencies(value))
    addColumnRef(reference);
}

function displayNameOf(
  type: string,
  base: unknown,
  row: CustomizationSolutionComponent,
) {
  if (base && typeof base === 'object') {
    const record = base as Record<string, unknown>;
    const name = record.displayName ?? record.name;
    if (typeof name === 'string' && name.trim()) return name;
  }
  const metadata = row.metadataJson as Record<string, unknown> | null;
  if (metadata && typeof metadata.displayName === 'string')
    return metadata.displayName;
  return row.objectKey;
}

export function checksumOf(component: PortableComponentInput) {
  return componentChecksum(component);
}
