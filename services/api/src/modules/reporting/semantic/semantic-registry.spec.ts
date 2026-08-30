import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import * as PrismaClientModule from '@prisma/client';
import {
  ENTITY_KEYS,
  MISC_PERMISSION_KEYS,
} from '../../../common/constants/rbac-matrix';
import { PERMISSION_KEYS } from '../../../common/constants/permissions';
import { TENANT_FEATURE_KEY_LIST } from '../../../common/constants/tenant-features';
import {
  REPORT_DATA_SOURCES,
  getDataSource,
  getField,
  listDataSources,
} from './data-sources';
import type {
  ReportDataSource,
  ReportFieldDefinition,
  ReportFieldType,
} from './semantic.types';

/**
 * The registry is a set of STRING paths into Prisma.
 *
 * Nothing about `path: 'employmentTypeRef.name'` is checked by the compiler.
 * A typo there — or a column renamed in a migration six months from now — is a
 * runtime failure on whichever screen reaches it first, and it fails as a 500
 * rather than as a missing column, because the engine builds the `select` from
 * these strings. So this suite does not assert that the registry has the right
 * shape; it resolves every model, every relation hop, every scalar and every
 * enum member against `Prisma.dmmf`, which is generated from the same schema
 * the database was migrated from.
 *
 * That is the difference between a test that passes because the objects look
 * plausible and a test that fails the moment the schema and the catalog
 * disagree.
 */

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
type DmmfField = DmmfModel['fields'][number];

const MODELS_BY_NAME = new Map<string, DmmfModel>(
  Prisma.dmmf.datamodel.models.map((model) => [model.name, model]),
);

/** Prisma delegate name (`attendanceDay`) -> model (`AttendanceDay`). */
const MODELS_BY_DELEGATE = new Map<string, DmmfModel>(
  Prisma.dmmf.datamodel.models.map((model) => [
    `${model.name.charAt(0).toLowerCase()}${model.name.slice(1)}`,
    model,
  ]),
);

/**
 * Enum members at runtime.
 *
 * `Prisma.dmmf.datamodel.enums` is empty on the installed client, so the
 * generated `$Enums` object is the only runtime source of enum members. Reading
 * it through an explicit cast rather than a named import keeps this working
 * whichever way the generator chooses to export it.
 */
const ENUM_RUNTIME = (
  PrismaClientModule as unknown as {
    $Enums: Record<string, Record<string, string>>;
  }
).$Enums;

const PERMISSION_VALUES = new Set<string>([
  ...Object.values(PERMISSION_KEYS),
  ...Object.values(MISC_PERMISSION_KEYS),
]);

const ENTITY_KEY_VALUES = new Set<string>(Object.values(ENTITY_KEYS));
const FEATURE_KEY_VALUES = new Set<string>(TENANT_FEATURE_KEY_LIST);

/** Report field type -> the Prisma scalar types it may legitimately sit on. */
const TYPE_COMPATIBILITY: Record<ReportFieldType, readonly string[]> = {
  string: ['String'],
  number: ['Int', 'Float', 'Decimal', 'BigInt'],
  integer: ['Int', 'BigInt'],
  boolean: ['Boolean'],
  date: ['DateTime'],
  datetime: ['DateTime'],
  enum: [],
  duration_minutes: ['Int', 'Float', 'Decimal', 'BigInt'],
  percent: ['Int', 'Float', 'Decimal'],
  money: ['Decimal', 'Float', 'Int'],
};

const NUMERIC_TYPES: ReadonlySet<ReportFieldType> = new Set<ReportFieldType>([
  'number',
  'integer',
  'duration_minutes',
  'percent',
  'money',
]);

/** Aggregations that only make sense on a number. */
const NUMERIC_ONLY_AGGREGATIONS = ['sum', 'avg'] as const;

const findField = (model: DmmfModel, name: string): DmmfField | undefined =>
  model.fields.find((field) => field.name === name);

/**
 * `Model.field` for every list-typed field, read from `schema.prisma`.
 *
 * The runtime DMMF on this client is minimal — each field carries only `name`,
 * `kind`, `type` and `relationName`, with no `isList` and no
 * `relationFromFields` — so a to-many relation and a to-one relation are
 * indistinguishable through it. That matters: `relationPath: ['attendanceDays']`
 * would resolve perfectly against the DMMF and produce an array where the
 * engine expects a scalar. The schema file is the only place that distinction
 * survives, so it is read here rather than assumed away.
 */
const LIST_FIELDS: ReadonlySet<string> = (() => {
  const schema = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );
  const lists = new Set<string>();
  let currentModel: string | null = null;

  for (const rawLine of schema.split(/\r?\n/)) {
    const line = rawLine.trim();
    const modelStart = /^model\s+(\w+)\s*\{/.exec(line);
    if (modelStart) {
      currentModel = modelStart[1];
      continue;
    }
    if (currentModel && line === '}') {
      currentModel = null;
      continue;
    }
    if (!currentModel) continue;

    const field = /^(\w+)\s+(\w+)\[\]/.exec(line);
    if (field) lists.add(`${currentModel}.${field[1]}`);
  }

  return lists;
})();

const isListField = (model: DmmfModel, name: string): boolean =>
  LIST_FIELDS.has(`${model.name}.${name}`);

const SOURCES = listDataSources();
const ALL_FIELDS: Array<{ source: ReportDataSource; field: ReportFieldDefinition }> =
  SOURCES.flatMap((source) =>
    source.fields.map((field) => ({ source, field })),
  );

/**
 * Walks `relationPath` from the source's root model and returns the model the
 * leaf scalar must live on. Throws with a precise message rather than returning
 * undefined, because an unresolvable hop is exactly what this suite is for.
 */
function resolveLeafModel(
  source: ReportDataSource,
  relationPath: readonly string[],
): DmmfModel {
  let model = MODELS_BY_DELEGATE.get(source.prismaModel);
  if (!model) {
    throw new Error(
      `source "${source.key}" names Prisma model "${source.prismaModel}", which does not exist`,
    );
  }

  for (const [index, segment] of relationPath.entries()) {
    const relation = findField(model, segment);
    if (!relation) {
      throw new Error(
        `source "${source.key}": relation segment "${segment}" (hop ${index + 1} of ${relationPath.join('.')}) does not exist on model ${model.name}`,
      );
    }
    if (relation.kind !== 'object') {
      throw new Error(
        `source "${source.key}": "${segment}" on model ${model.name} is a ${relation.kind}, not a relation`,
      );
    }
    if (isListField(model, segment)) {
      throw new Error(
        `source "${source.key}": relation "${segment}" on ${model.name} is a to-many relation; a report field cannot be reached through one`,
      );
    }
    const next = MODELS_BY_NAME.get(relation.type);
    if (!next) {
      throw new Error(
        `source "${source.key}": relation "${segment}" points at unknown model ${relation.type}`,
      );
    }
    model = next;
  }

  return model;
}

describe('report data source registry', () => {
  it('exposes every source through the registry, the getter and the list', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    expect(REPORT_DATA_SOURCES.size).toBe(SOURCES.length);
    for (const source of SOURCES) {
      expect(getDataSource(source.key)).toBe(source);
    }
    expect(getDataSource('not-a-source')).toBeUndefined();
  });

  it('has a unique key per source', () => {
    const keys = SOURCES.map((source) => source.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(SOURCES.map((source) => [source.key, source] as const))(
    '%s: names a Prisma model that exists',
    (_key, source) => {
      const model = MODELS_BY_DELEGATE.get(source.prismaModel);
      expect(model).toBeDefined();
    },
  );

  it.each(SOURCES.map((source) => [source.key, source] as const))(
    '%s: scopes rows by a real RBAC entity and, when gated, a real feature key',
    (_key, source) => {
      expect(ENTITY_KEY_VALUES.has(source.rbacEntityKey)).toBe(true);
      if (source.requiredFeatureKey !== undefined) {
        expect(FEATURE_KEY_VALUES.has(source.requiredFeatureKey)).toBe(true);
      }
    },
  );

  it.each(SOURCES.map((source) => [source.key, source] as const))(
    '%s: every scope column exists on the root model',
    (_key, source) => {
      const model = resolveLeafModel(source, []);
      const declared: Array<[string, string | null | undefined]> = [
        ['tenantIdField', source.scope.tenantIdField ?? 'tenantId'],
        ['businessUnitIdField', source.scope.businessUnitIdField],
        // `null` is a deliberate "this model is not scoped by organization",
        // which is a different statement from leaving it undefined.
        ['organizationIdField', source.scope.organizationIdField],
        ['ownerUserIdField', source.scope.ownerUserIdField],
        ['ownerTeamIdField', source.scope.ownerTeamIdField],
        ['userIdField', source.scope.userIdField],
        ['createdByIdField', source.scope.createdByIdField],
      ];

      for (const [option, column] of declared) {
        if (typeof column !== 'string') continue;
        const resolved = findField(model, column);
        expect(
          resolved && resolved.kind === 'scalar' ? column : `${option}=${column} MISSING on ${model.name}`,
        ).toBe(column);
      }
    },
  );

  it.each(SOURCES.map((source) => [source.key, source] as const))(
    '%s: the default date field is a DateTime column on the root model',
    (_key, source) => {
      const model = resolveLeafModel(source, []);
      const field = findField(model, source.defaultDateField);
      expect(field?.type).toBe('DateTime');
    },
  );

  it.each(SOURCES.map((source) => [source.key, source] as const))(
    '%s: the record id field and every baseWhere key exist on the root model',
    (_key, source) => {
      const model = resolveLeafModel(source, []);
      if (source.recordIdField !== undefined) {
        expect(findField(model, source.recordIdField)).toBeDefined();
      }
      for (const column of Object.keys(source.baseWhere ?? {})) {
        expect(findField(model, column)).toBeDefined();
      }
    },
  );

  it.each(SOURCES.map((source) => [source.key, source] as const))(
    '%s: carries at least one caveat, and none of them are empty',
    (_key, source) => {
      expect(source.caveats?.length ?? 0).toBeGreaterThan(0);
      for (const caveat of source.caveats ?? []) {
        expect(caveat.trim().length).toBeGreaterThan(20);
      }
    },
  );
});

describe('report field keys', () => {
  it('is globally unique and prefixed with its own source key', () => {
    const seen = new Map<string, string>();
    for (const { source, field } of ALL_FIELDS) {
      const owner = seen.get(field.key);
      expect(owner ? `${field.key} also declared by ${owner}` : field.key).toBe(
        field.key,
      );
      seen.set(field.key, source.key);

      expect(field.key.startsWith(`${source.key}.`)).toBe(true);
      const suffix = field.key.slice(source.key.length + 1);
      expect(suffix.length).toBeGreaterThan(0);
      expect(suffix).not.toContain('.');
    }
  });

  it('resolves through getField()', () => {
    for (const { field } of ALL_FIELDS) {
      expect(getField(field.key)).toBe(field);
    }
    expect(getField('workforce.not_a_field')).toBeUndefined();
    expect(getField('no-dot')).toBeUndefined();
  });
});

describe('report field paths resolve against the Prisma schema', () => {
  it.each(
    ALL_FIELDS.map(
      ({ source, field }) => [field.key, source, field] as const,
    ),
  )('%s: relationPath and path agree', (_key, source, field) => {
    const relationPath = field.relationPath ?? [];
    if (relationPath.length === 0) {
      expect(field.path).not.toContain('.');
      return;
    }
    const prefix = `${relationPath.join('.')}.`;
    expect(
      field.path.startsWith(prefix)
        ? field.path
        : `path "${field.path}" does not start with relationPath "${prefix}" (source ${source.key})`,
    ).toBe(field.path);
    const leaf = field.path.slice(prefix.length);
    expect(leaf.length).toBeGreaterThan(0);
    expect(leaf).not.toContain('.');
  });

  it.each(
    ALL_FIELDS.map(
      ({ source, field }) => [field.key, source, field] as const,
    ),
  )('%s: the model, every relation hop and the column exist', (
    _key,
    source,
    field,
  ) => {
    const relationPath = field.relationPath ?? [];
    const model = resolveLeafModel(source, relationPath);
    const leafName =
      relationPath.length === 0
        ? field.path
        : field.path.slice(`${relationPath.join('.')}.`.length);

    const resolved = findField(model, leafName);
    expect(
      resolved
        ? leafName
        : `column "${leafName}" does not exist on model ${model.name} (field ${field.key})`,
    ).toBe(leafName);
    expect(resolved?.kind).not.toBe('object');
    expect(isListField(model, leafName)).toBe(false);
  });

  it.each(
    ALL_FIELDS.map(
      ({ source, field }) => [field.key, source, field] as const,
    ),
  )('%s: the declared type matches the column type', (_key, source, field) => {
    const relationPath = field.relationPath ?? [];
    const model = resolveLeafModel(source, relationPath);
    const leafName =
      relationPath.length === 0
        ? field.path
        : field.path.slice(`${relationPath.join('.')}.`.length);
    const resolved = findField(model, leafName);
    if (!resolved) throw new Error(`unresolved field ${field.key}`);

    if (field.type === 'enum') {
      expect(
        resolved.kind === 'enum'
          ? 'enum'
          : `${field.key} is declared enum but ${model.name}.${leafName} is a ${resolved.kind} (${resolved.type})`,
      ).toBe('enum');
      return;
    }

    const allowed = TYPE_COMPATIBILITY[field.type];
    expect(
      allowed.includes(resolved.type)
        ? resolved.type
        : `${field.key} is declared ${field.type} but ${model.name}.${leafName} is ${resolved.type}`,
    ).toBe(resolved.type);
  });

  it.each(
    ALL_FIELDS.map(
      ({ source, field }) => [field.key, source, field] as const,
    ),
  )('%s: enumValues match the Prisma enum exactly', (_key, source, field) => {
    const relationPath = field.relationPath ?? [];
    const model = resolveLeafModel(source, relationPath);
    const leafName =
      relationPath.length === 0
        ? field.path
        : field.path.slice(`${relationPath.join('.')}.`.length);
    const resolved = findField(model, leafName);
    if (!resolved) throw new Error(`unresolved field ${field.key}`);

    if (resolved.kind !== 'enum') {
      // A non-enum column must not publish a vocabulary; a filter would be
      // validated against values the database never constrains.
      expect(field.enumValues).toBeUndefined();
      return;
    }

    // `EmployeeDevice.cameraPermission` and friends are free strings with a
    // default of "UNKNOWN" and no enum behind them, which is why the registry
    // publishes no vocabulary for them. Any column that IS an enum must publish
    // the real one.
    const members = ENUM_RUNTIME[resolved.type];
    expect(
      members
        ? resolved.type
        : `${field.key} resolves to enum ${resolved.type}, which the client does not export`,
    ).toBe(resolved.type);

    expect(field.enumValues).toBeDefined();
    expect([...(field.enumValues ?? [])].sort()).toEqual(
      Object.values(members).sort(),
    );
  });
});

describe('report field capability declarations', () => {
  it.each(ALL_FIELDS.map(({ field }) => [field.key, field] as const))(
    '%s: aggregatable and supportedAggregations agree, and numeric aggregations sit on numbers',
    (_key, field) => {
      const aggregations = field.supportedAggregations ?? [];

      if (field.aggregatable === true) {
        expect(aggregations.length).toBeGreaterThan(0);
      }
      if (aggregations.length > 0) {
        expect(field.aggregatable).toBe(true);
      }

      for (const aggregation of NUMERIC_ONLY_AGGREGATIONS) {
        if (!aggregations.includes(aggregation)) continue;
        expect(
          NUMERIC_TYPES.has(field.type)
            ? field.type
            : `${field.key} declares "${aggregation}" on a ${field.type} field`,
        ).toBe(field.type);
      }
    },
  );

  it.each(ALL_FIELDS.map(({ field }) => [field.key, field] as const))(
    '%s: a RESTRICTED field declares a permission that exists',
    (_key, field) => {
      if (field.sensitivity !== 'RESTRICTED') return;
      expect(field.permission).toBeDefined();
      expect(PERMISSION_VALUES.has(field.permission ?? '')).toBe(true);
    },
  );

  it.each(ALL_FIELDS.map(({ field }) => [field.key, field] as const))(
    '%s: any declared permission is a real permission key',
    (_key, field) => {
      if (field.permission === undefined) return;
      expect(PERMISSION_VALUES.has(field.permission)).toBe(true);
    },
  );

  it.each(ALL_FIELDS.map(({ field }) => [field.key, field] as const))(
    '%s: a groupable field is not hidden',
    (_key, field) => {
      if (field.groupable !== true) return;
      expect(field.hidden).not.toBe(true);
    },
  );
});

describe('grouping declarations', () => {
  it.each(
    ALL_FIELDS.map(
      ({ source, field }) => [field.key, source, field] as const,
    ),
  )(
    '%s: a groupable relation field declares a groupByField on the root model',
    (_key, source, field) => {
      if (field.groupable !== true) return;
      if ((field.relationPath ?? []).length === 0) return;

      // Prisma groupBy takes scalar columns of the model being grouped. A
      // groupable field reached through a relation is only groupable because a
      // root-model scalar stands in for it.
      expect(
        field.groupByField !== undefined
          ? field.key
          : `${field.key} is groupable through relation ${(field.relationPath ?? []).join('.')} but declares no groupByField`,
      ).toBe(field.key);

      const model = resolveLeafModel(source, []);
      const column = findField(model, field.groupByField ?? '');
      expect(
        column && column.kind !== 'object'
          ? field.groupByField
          : `groupByField "${field.groupByField}" is not a scalar column on ${model.name} (field ${field.key})`,
      ).toBe(field.groupByField);
    },
  );

  it.each(
    ALL_FIELDS.map(
      ({ source, field }) => [field.key, source, field] as const,
    ),
  )('%s: any declared groupByField resolves on the root model', (
    _key,
    source,
    field,
  ) => {
    if (field.groupByField === undefined) return;
    const model = resolveLeafModel(source, []);
    const column = findField(model, field.groupByField);
    expect(
      column && column.kind !== 'object'
        ? field.groupByField
        : `groupByField "${field.groupByField}" is not a scalar column on ${model.name} (field ${field.key})`,
    ).toBe(field.groupByField);
    expect(isListField(model, field.groupByField)).toBe(false);
  });

  it.each(ALL_FIELDS.map(({ field }) => [field.key, field] as const))(
    '%s: any labelLookup names a real model with both columns',
    (_key, field) => {
      const lookup = field.labelLookup;
      if (!lookup) return;

      const model = MODELS_BY_DELEGATE.get(lookup.model);
      expect(
        model
          ? lookup.model
          : `labelLookup.model "${lookup.model}" is not a Prisma model (field ${field.key})`,
      ).toBe(lookup.model);
      if (!model) return;

      for (const column of [lookup.valueField, lookup.labelField]) {
        const resolved = findField(model, column);
        expect(
          resolved && resolved.kind !== 'object'
            ? column
            : `labelLookup column "${column}" does not exist on ${model.name} (field ${field.key})`,
        ).toBe(column);
      }
    },
  );

  it.each(ALL_FIELDS.map(({ field }) => [field.key, field] as const))(
    '%s: a labelLookup only appears where something needs labelling',
    (_key, field) => {
      if (!field.labelLookup) return;
      // An enum is its own label. A lookup on one would resolve members against
      // a table that does not hold them.
      expect(field.type).not.toBe('enum');
    },
  );
});

describe('employee dimensions', () => {
  /** The dimension set every employee-bearing source must offer. */
  const REQUIRED_DIMENSIONS = [
    'organization',
    'business_unit',
    'department',
    'team',
    'location',
    'designation',
    'employee_level',
    'employment_type',
    'employment_status',
    'work_mode',
    'gender',
    'manager',
  ];

  const EMPLOYEE_BEARING_SOURCES = [
    'workforce',
    'workforce_history',
    'attendance',
    'leave_requests',
    'leave_consumption',
    'leave_balances',
    'desktop_activity',
    'desktop_devices',
  ];

  it.each(EMPLOYEE_BEARING_SOURCES)(
    '%s: offers every organisational dimension',
    (sourceKey) => {
      const source = getDataSource(sourceKey);
      expect(source).toBeDefined();
      const names = new Set(
        (source?.fields ?? []).map((field) =>
          field.key.slice(sourceKey.length + 1),
        ),
      );
      for (const dimension of REQUIRED_DIMENSIONS) {
        expect(
          names.has(dimension) ? dimension : `${sourceKey} is missing ${dimension}`,
        ).toBe(dimension);
      }
    },
  );

  it('records exactly which sources cannot express sub-tenant row scope', () => {
    // `buildScopedAccessWhere` narrows below TENANT level using ownership
    // columns on the model itself. A source carrying none of them, and no
    // business unit column either, cannot narrow at all: ReportScopeResolver
    // drops the predicates it cannot resolve, and a dropped predicate inside a
    // sole `OR` leaves the tenant predicate standing alone.
    //
    // This list is asserted rather than described so a NEW source cannot join
    // it quietly. Adding one here is a decision; arriving here by accident is
    // the bug. Fixing it needs relation-aware scoping in the engine, which is
    // recorded as a cross-stream finding and is not this registry's to make.
    const unscopable = SOURCES.filter((source) => {
      const scope = source.scope;
      return (
        scope.ownerUserIdField === undefined &&
        scope.userIdField === undefined &&
        scope.createdByIdField === undefined &&
        scope.businessUnitIdField === undefined
      );
    }).map((source) => source.key);

    expect(unscopable.sort()).toEqual([
      'attendance',
      'leave_balances',
      'leave_consumption',
    ]);
  });
});
