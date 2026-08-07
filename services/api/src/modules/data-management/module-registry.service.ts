import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DataModuleDescriptor,
  ImportFieldDescriptor,
  ImportFieldType,
  LookupMatchKey,
} from './module-adapter.types';

type GeneratedField = {
  key: string;
  label?: string;
  type?: string;
  relationModel?: string | null;
  required?: boolean;
  nullable?: boolean;
  list?: boolean;
  enumValues?: string[];
  readable?: boolean;
  creatable?: boolean;
  editable?: boolean;
  exportable?: boolean;
  systemManaged?: boolean;
  sensitive?: boolean;
};

type GeneratedModel = { fields: Record<string, GeneratedField> };

type GeneratedSchema = { models: Record<string, GeneratedModel> };

/**
 * The generated schema is several megabytes, so it is required lazily and
 * cached rather than imported statically. That keeps it out of the compiled
 * bundle and off the startup path for requests that never touch imports.
 */
let cachedSchema: GeneratedSchema | null = null;

const SCHEMA_MODULE_ID = '@repo/config/platform-runtime-schema.generated.json';

function loadRuntimeSchema(): GeneratedSchema {
  if (!cachedSchema) {
    /*
     * Deliberate lazy load. A static import would bundle multi-megabyte JSON
     * and pay the cost on every boot, including requests that never touch
     * data management.
     */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedSchema = require(SCHEMA_MODULE_ID) as GeneratedSchema;
  }

  return cachedSchema;
}

/**
 * Fields that must never be settable from an uploaded file, regardless of what
 * the schema says is creatable. Tenant and ownership fields would break tenant
 * isolation; audit fields would let a file rewrite history; credential and
 * security fields would be privilege escalation.
 */
const PROTECTED_FIELD_KEYS = new Set([
  'id',
  'tenantId',
  'tenant',
  'createdAt',
  'updatedAt',
  'createdById',
  'updatedById',
  'createdBy',
  'updatedBy',
  'deletedAt',
  'deletedById',
  'isDeleted',
  'passwordHash',
  'password',
  'ownerUserId',
  'ownerUser',
  'userId',
  'user',
]);

/** Suffixes that indicate a relation object rather than a writable scalar. */
const RELATION_OBJECT_SUFFIXES = ['Lookup'];

const MODULE_DEFINITIONS: Array<{
  moduleKey: string;
  label: string;
  modelName: string;
  matchingKeys: readonly string[];
  supportsImport: boolean;
  supportsExport: boolean;
}> = [
  {
    moduleKey: 'employees',
    label: 'Employees',
    modelName: 'Employee',
    matchingKeys: ['id', 'employeeCode', 'email'],
    supportsImport: true,
    supportsExport: true,
  },
  {
    moduleKey: 'leaves',
    label: 'Leave Requests',
    modelName: 'LeaveRequest',
    matchingKeys: ['id'],
    supportsImport: false,
    supportsExport: true,
  },
  {
    moduleKey: 'attendance',
    label: 'Attendance',
    modelName: 'AttendanceEntry',
    matchingKeys: ['id'],
    supportsImport: true,
    supportsExport: true,
  },
];

@Injectable()
export class DataModuleRegistryService {
  private readonly logger = new Logger(DataModuleRegistryService.name);
  private readonly cache = new Map<string, DataModuleDescriptor>();

  listModules(): DataModuleDescriptor[] {
    return MODULE_DEFINITIONS.map((definition) =>
      this.getModule(definition.moduleKey),
    );
  }

  getModule(moduleKey: string): DataModuleDescriptor {
    const cached = this.cache.get(moduleKey);
    if (cached) return cached;

    const definition = MODULE_DEFINITIONS.find(
      (item) => item.moduleKey === moduleKey,
    );

    if (!definition) {
      throw new NotFoundException(
        `Data management is not configured for module "${moduleKey}".`,
      );
    }

    const models = loadRuntimeSchema().models;
    const model = models[definition.modelName];

    if (!model) {
      throw new NotFoundException(
        `Runtime schema has no model named "${definition.modelName}".`,
      );
    }

    const importFields: ImportFieldDescriptor[] = [];
    const excludedFields: Array<{ key: string; reason: string }> = [];

    const fieldKeys = new Set(Object.keys(model.fields));

    // The schema puts relationModel on the relation object, but only the
    // foreign-key scalar is writable. Carry the target model across so the
    // importable column keeps its lookup behaviour instead of degrading to an
    // opaque string.
    const lookupModelByScalar = new Map<string, string>();
    for (const [key, field] of Object.entries(model.fields)) {
      if (!field.relationModel) continue;

      const scalarKey = this.foreignKeyFor(key, field.relationModel, fieldKeys);
      if (scalarKey) {
        lookupModelByScalar.set(scalarKey, field.relationModel);
      }
    }

    for (const [key, field] of Object.entries(model.fields)) {
      const exclusion = this.exclusionReason(key, field, fieldKeys);

      if (exclusion) {
        excludedFields.push({ key, reason: exclusion });
        continue;
      }

      importFields.push(
        this.toDescriptor(key, field, lookupModelByScalar.get(key)),
      );
    }

    const descriptor: DataModuleDescriptor = {
      moduleKey: definition.moduleKey,
      label: definition.label,
      modelName: definition.modelName,
      importFields: importFields.sort((a, b) =>
        a.required === b.required
          ? a.label.localeCompare(b.label)
          : Number(b.required) - Number(a.required),
      ),
      excludedFields,
      matchingKeys: definition.matchingKeys,
      supportsImport: definition.supportsImport,
      supportsExport: definition.supportsExport,
    };

    this.cache.set(moduleKey, descriptor);
    this.logger.log(
      `Resolved ${descriptor.importFields.length} importable field(s) for ${moduleKey}`,
    );

    return descriptor;
  }

  private exclusionReason(
    key: string,
    field: GeneratedField,
    fieldKeys: ReadonlySet<string>,
  ): string | null {
    // A relation appears twice in the schema: as the object (`department`) and
    // as the writable foreign key (`departmentId`). Only the scalar can be set,
    // so the object form is dropped to avoid two template columns competing for
    // the same relationship.
    if (field.relationModel) {
      const scalarKey = this.foreignKeyFor(key, field.relationModel, fieldKeys);
      if (scalarKey) {
        return `Relation object. Use the "${scalarKey}" column instead.`;
      }
    }

    if (PROTECTED_FIELD_KEYS.has(key)) {
      return 'Protected system field. Set by the platform and never accepted from a file.';
    }

    if (field.systemManaged) {
      return 'System managed. Calculated or maintained by the platform.';
    }

    if (field.sensitive) {
      return 'Sensitive field. Excluded from bulk import.';
    }

    if (field.list) {
      return 'Collection field. Import related records through their own module.';
    }

    if (
      field.relationModel &&
      RELATION_OBJECT_SUFFIXES.some((suffix) => key.endsWith(suffix))
    ) {
      return 'Relation object. Use the matching identifier column instead.';
    }

    if (field.creatable === false && field.editable === false) {
      return 'Read only. Cannot be created or updated through the application.';
    }

    return null;
  }

  private toDescriptor(
    key: string,
    field: GeneratedField,
    inheritedLookupModel?: string,
  ): ImportFieldDescriptor {
    const lookupModel = field.relationModel ?? inheritedLookupModel ?? null;
    const type = this.resolveType(field, lookupModel);
    const required = Boolean(field.required) && field.nullable === false;

    return {
      key,
      label: field.label?.trim() || key,
      type,
      required,
      readOnly: field.creatable === false && field.editable === false,
      ...(field.enumValues?.length
        ? { allowedValues: [...field.enumValues] }
        : {}),
      ...(lookupModel
        ? {
            lookupModel,
            lookupMatchKeys: this.matchKeysFor(lookupModel),
          }
        : {}),
      expectedFormat: this.expectedFormat(type, field),
      exampleValue: this.exampleValue(key, type, field),
      validationNotes: this.validationNotes(type, field),
      aliases: this.aliasesFor(key, field.label),
    };
  }

  /**
   * Finds the writable foreign-key scalar for a relation.
   *
   * Prisma does not always name it `<relation>Id`: employee references use
   * `<relation>EmployeeId`, so several conventions are tried and only an
   * existing field is returned.
   */
  private foreignKeyFor(
    relationKey: string,
    relationModel: string,
    fieldKeys: ReadonlySet<string>,
  ): string | null {
    const candidates = [`${relationKey}Id`];

    if (relationModel === 'Employee') {
      candidates.push(`${relationKey}EmployeeId`);
    }

    return candidates.find((candidate) => fieldKeys.has(candidate)) ?? null;
  }

  private resolveType(
    field: GeneratedField,
    lookupModel?: string | null,
  ): ImportFieldType {
    if (field.enumValues?.length) return 'enum';
    if (lookupModel) return 'lookup';

    switch ((field.type ?? '').toLowerCase()) {
      case 'int':
      case 'float':
      case 'decimal':
      case 'bigint':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'datetime':
        return 'dateTime';
      case 'date':
        return 'date';
      case 'json':
        return 'json';
      default:
        return 'string';
    }
  }

  /**
   * Lookup columns accept a business identifier rather than a raw UUID, since
   * source systems rarely export platform ids. Order is most specific first so
   * an unambiguous match is attempted before falling back to name.
   */
  private matchKeysFor(relationModel: string): readonly LookupMatchKey[] {
    switch (relationModel) {
      case 'Employee':
        return ['id', 'employeeNumber', 'email', 'name'];
      case 'User':
        return ['id', 'email'];
      default:
        return ['id', 'code', 'name'];
    }
  }

  private expectedFormat(
    type: ImportFieldType,
    field: GeneratedField,
  ): string | undefined {
    switch (type) {
      case 'date':
        return 'YYYY-MM-DD';
      case 'dateTime':
        return 'YYYY-MM-DD HH:mm (tenant timezone)';
      case 'boolean':
        return 'TRUE or FALSE (yes/no and 1/0 are also accepted)';
      case 'enum':
        return `One of: ${(field.enumValues ?? []).join(', ')}`;
      case 'lookup':
        return `Existing ${field.relationModel} identified by id, code, or name`;
      case 'number':
        return 'Numeric value without thousands separators';
      default:
        return undefined;
    }
  }

  private exampleValue(
    key: string,
    type: ImportFieldType,
    field: GeneratedField,
  ): string | undefined {
    if (type === 'enum') return field.enumValues?.[0];
    if (type === 'date') return '2026-03-02';
    if (type === 'dateTime') return '2026-03-02 09:00';
    if (type === 'boolean') return 'TRUE';
    if (type === 'number') return '0';
    if (/email/i.test(key)) return 'person@example.com';
    if (/phone/i.test(key)) return '+92 300 1234567';
    return undefined;
  }

  private validationNotes(
    type: ImportFieldType,
    field: GeneratedField,
  ): string | undefined {
    if (type === 'lookup') {
      return 'An ambiguous or unknown value is reported as an error rather than matched or created.';
    }
    if (type === 'enum') {
      return 'Values outside the allowed list are rejected.';
    }
    if (field.required && field.nullable === false) {
      return 'Required. A blank value fails validation.';
    }
    return undefined;
  }

  /** Header spellings accepted when mapping columns automatically. */
  private aliasesFor(key: string, label?: string): readonly string[] {
    const aliases = new Set<string>();

    aliases.add(key);
    aliases.add(normalizeHeader(key));

    if (label) {
      aliases.add(label);
      aliases.add(normalizeHeader(label));
    }

    // Foreign keys are commonly exported without the Id suffix.
    if (key.endsWith('Id')) {
      const base = key.slice(0, -2);
      aliases.add(base);
      aliases.add(normalizeHeader(base));
    }

    return [...aliases].filter(Boolean);
  }
}

/** Lower-cased, punctuation-free form used to compare header spellings. */
export function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
