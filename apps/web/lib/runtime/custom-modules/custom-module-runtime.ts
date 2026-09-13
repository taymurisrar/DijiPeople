import type { SessionUser } from "@/lib/auth";
import type {
  RuntimeCustomizationForm,
  RuntimeFormLayout,
} from "@/lib/customization-forms";
import type {
  FieldDataType,
  FormMetadata,
  ViewFilterMetadata,
  ViewSortMetadata,
} from "../metadata-runtime.types";
import type { ModuleRuntimeContext } from "../module-runtime.types";
import {
  buildStandardRouteRuntime,
  mapPublishedForm,
} from "../modules/standard-module-route-helpers";
import type {
  StandardModuleFieldSpec,
  StandardModuleRuntimeSpec,
  StandardModuleViewSpec,
} from "../modules/standard-module-runtime";
import { customModuleHref } from "./custom-module-navigation";

/*
 * Turns a published custom module definition (`GET /metadata/custom-modules/:key`)
 * into the same `StandardModuleRuntimeSpec` system modules declare by hand, so
 * its screens are the standard runtime list and record pages and its writes go
 * through the standard data adapter to `/api/data/<key>`.
 *
 * ADR-0016 Agent Rules: nothing here names a module. Every value comes from the
 * definition, which the API builds from the published snapshot only — drafts
 * never arrive, so this file cannot render one.
 */

export type CustomModuleFieldDefinition = {
  readonly logicalName: string;
  readonly displayName: string;
  readonly dataType: string;
  readonly required?: boolean;
  readonly readOnly?: boolean;
  readonly isPrimaryName?: boolean;
  readonly maxLength?: number | null;
  readonly lookupTargetTableKey?: string | null;
  readonly options?: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
};

export type CustomModuleFormDefinition = {
  readonly id: string;
  readonly formKey: string;
  readonly name: string;
  readonly type: string;
  readonly isDefault?: boolean;
  readonly layoutJson?: unknown;
};

export type CustomModuleViewDefinition = {
  readonly id: string;
  readonly viewKey: string;
  readonly name: string;
  readonly isDefault?: boolean;
  readonly columnsJson?: unknown;
  readonly filtersJson?: unknown;
  readonly sortingJson?: unknown;
};

export type CustomModuleDefinition = {
  readonly moduleKey: string;
  readonly displayName: string;
  readonly pluralDisplayName?: string | null;
  readonly primaryNameField: string;
  readonly fields: readonly CustomModuleFieldDefinition[];
  readonly forms: readonly CustomModuleFormDefinition[];
  readonly views: readonly CustomModuleViewDefinition[];
  readonly capabilities: {
    readonly read?: boolean;
    readonly create?: boolean;
    readonly update?: boolean;
    readonly delete?: boolean;
  };
};

/* Derived keys the API enforces on `/data` (see custom-records.metadata.ts). */
const CUSTOM_RECORD_PERMISSIONS = {
  read: "custom-records.read",
  create: "custom-records.create",
  update: "custom-records.write",
  delete: "custom-records.delete",
} as const;

/* Record timestamps the API returns on every custom record. */
const SYSTEM_FIELDS: readonly StandardModuleFieldSpec[] = [
  {
    logicalName: "createdAt",
    displayName: "Created On",
    dataType: "datetime",
    isReadOnly: true,
  },
  {
    logicalName: "updatedAt",
    displayName: "Modified On",
    dataType: "datetime",
    isReadOnly: true,
  },
];

const FALLBACK_VIEW_COLUMN_COUNT = 8;

const FIELD_TYPE_MAP: Readonly<Record<string, FieldDataType>> = {
  text: "string",
  textarea: "multiline-string",
  number: "number",
  decimal: "decimal",
  currency: "currency",
  date: "date",
  datetime: "datetime",
  boolean: "boolean",
  select: "optionset",
  multiselect: "multi-optionset",
  lookup: "lookup",
  email: "email",
  phone: "phone",
  url: "url",
};

export function mapCustomFieldDataType(dataType: string): FieldDataType {
  return FIELD_TYPE_MAP[dataType] ?? "string";
}

export function buildCustomModuleRuntimeSpec(
  definition: CustomModuleDefinition,
): StandardModuleRuntimeSpec {
  const routeBase = customModuleHref(definition.moduleKey);
  const fields = buildFieldSpecs(definition);
  const pluralLabel =
    definition.pluralDisplayName?.trim() || definition.displayName;

  return {
    /*
     * `moduleKey` mirrors `routeBase` without its leading slash because the
     * command runtime expands "/{moduleKey}/new" (command-execution.service.ts)
     * and must land on the same URL as `${routeBase}/new` (apps/web/AGENTS.md).
     */
    moduleKey: routeBase.slice(1),
    metadataTableKey: definition.moduleKey,
    apiPath: `/api/data/${encodeURIComponent(definition.moduleKey)}`,
    entityLogicalName: definition.moduleKey,
    collectionName: definition.moduleKey,
    label: pluralLabel,
    singularLabel: definition.displayName,
    routeBase,
    recordNavigation: true,
    primaryIdField: "id",
    primaryNameField: definition.primaryNameField || "id",
    fields,
    views: buildCustomModuleViews(definition),
    formFields: definition.fields.map((field) => field.logicalName),
    adapterCapabilities: {
      softDelete: true,
      assignOwner: false,
      disableCreate: definition.capabilities.create !== true,
      disableEdit: definition.capabilities.update !== true,
      disableDelete: definition.capabilities.delete !== true,
      import: false,
      export: false,
      exportTemplate: false,
    },
    permissions: CUSTOM_RECORD_PERMISSIONS,
  };
}

export function buildCustomModuleViews(
  definition: CustomModuleDefinition,
): StandardModuleViewSpec[] {
  const fieldNames = [
    ...definition.fields.map((field) => field.logicalName),
    ...SYSTEM_FIELDS.map((field) => field.logicalName),
  ];
  const known = new Set(fieldNames);
  const fallbackColumns = definition.fields
    .map((field) => field.logicalName)
    .slice(0, FALLBACK_VIEW_COLUMN_COUNT);

  const views: StandardModuleViewSpec[] = definition.views.map((view) => {
    const columns = readColumnKeys(view.columnsJson).filter((key) =>
      known.has(key),
    );
    const filters = readFilters(view.filtersJson, known);
    const defaultSort = readSort(view.sortingJson, known);
    return {
      logicalName: view.viewKey,
      viewId: view.id,
      displayName: view.name,
      isDefault: view.isDefault === true,
      columns: columns.length > 0 ? columns : fallbackColumns,
      ...(filters.length > 0 ? { filters } : {}),
      ...(defaultSort.length > 0 ? { defaultSort } : {}),
    };
  });

  if (views.length === 0) {
    /*
     * A module published without a view still needs a list. One view of its
     * first fields, named after the module — no invented copy.
     */
    return [
      {
        logicalName: "all",
        viewId: `${definition.moduleKey}:all`,
        displayName:
          definition.pluralDisplayName?.trim() || definition.displayName,
        isDefault: true,
        columns: fallbackColumns,
      },
    ];
  }

  if (!views.some((view) => view.isDefault)) {
    views[0] = { ...views[0], isDefault: true };
  }

  return views;
}

/**
 * The module's published forms as FormMetadata, through the same mapping
 * system modules use. Card and lookup forms are not record forms and are
 * skipped; field placements naming a column the definition does not carry (a
 * draft column, or one the user may not read) are dropped rather than rendered
 * as an empty control.
 */
export function buildCustomModuleForms(
  definition: CustomModuleDefinition,
): FormMetadata[] {
  const known = new Set(definition.fields.map((field) => field.logicalName));

  return definition.forms.flatMap((form) => {
    const type = recordFormType(form.type);
    const layout = readLayout(form.layoutJson);
    if (!type || !layout) return [];

    const runtimeForm: RuntimeCustomizationForm = {
      id: form.id,
      tableKey: definition.moduleKey,
      formKey: form.formKey,
      name: form.name,
      type,
      isDefault: form.isDefault === true,
      isActive: true,
      layoutJson: layout,
    };
    const mapped = mapPublishedForm(runtimeForm, definition.moduleKey);
    const sections = mapped.sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) =>
          known.has(field.fieldLogicalName),
        ),
      }))
      .filter((section) => section.fields.length > 0);

    /*
     * A form with nothing left to render is not a usable form. Creating a
     * table saves its main form before any column exists (`fields: []`), and
     * columns added afterwards are not placed on it, so a module built in the
     * documented order — table, fields, publish — published a form that drew
     * a blank create screen with a Save button. Skipping it lets the runtime
     * keep the generated form of the published fields instead.
     */
    return sections.length > 0 ? [{ ...mapped, sections }] : [];
  });
}

/**
 * The runtime context a custom-module route renders with. Published forms
 * replace the spec's generated ones when there are any; a module published
 * without a usable form keeps the generated form of its published fields so
 * create and edit still work.
 */
export function buildCustomModuleRuntime({
  definition,
  pageKind,
  recordId,
  sessionUser,
}: {
  readonly definition: CustomModuleDefinition;
  readonly pageKind: "list" | "detail" | "create" | "edit";
  readonly recordId?: string;
  readonly sessionUser: SessionUser | null;
}): { spec: StandardModuleRuntimeSpec; runtime: ModuleRuntimeContext } {
  const spec = buildCustomModuleRuntimeSpec(definition);
  const runtime = buildStandardRouteRuntime({
    pageKind,
    recordId,
    sessionUser,
    spec,
  });
  const publishedForms = buildCustomModuleForms(definition);

  return {
    spec,
    runtime:
      publishedForms.length > 0
        ? {
            ...runtime,
            metadata: { ...runtime.metadata, forms: publishedForms },
          }
        : runtime,
  };
}

export function resolveCustomModuleRecordTitle(
  definition: CustomModuleDefinition,
  record: Readonly<Record<string, unknown>>,
) {
  const value = record[definition.primaryNameField];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : definition.displayName;
}

function buildFieldSpecs(
  definition: CustomModuleDefinition,
): StandardModuleFieldSpec[] {
  const own = definition.fields.map(
    (field): StandardModuleFieldSpec => ({
      logicalName: field.logicalName,
      displayName: field.displayName,
      dataType: mapCustomFieldDataType(field.dataType),
      isReadOnly: field.readOnly === true,
      isPrimaryName: field.logicalName === definition.primaryNameField,
      requirementLevel: field.required ? "required" : "none",
      ...(field.options?.length
        ? {
            options: field.options.map((option, index) => ({
              value: option.value,
              label: option.label,
              order: (index + 1) * 10,
            })),
          }
        : {}),
      ...(field.dataType === "lookup" && field.lookupTargetTableKey
        ? { lookupTargetEntityLogicalName: field.lookupTargetTableKey }
        : {}),
    }),
  );
  const ownNames = new Set(own.map((field) => field.logicalName));

  return [
    ...own,
    ...SYSTEM_FIELDS.filter((field) => !ownNames.has(field.logicalName)),
  ];
}

function recordFormType(type: string): RuntimeCustomizationForm["type"] | null {
  if (type === "main" || type === "minimal") return "main";
  if (type === "quick" || type === "create" || type === "edit") return type;
  return null;
}

function readLayout(value: unknown): RuntimeFormLayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const tabs = (value as { tabs?: unknown }).tabs;
  if (!Array.isArray(tabs) || tabs.length === 0) return null;
  const sane = tabs.every(
    (tab) =>
      tab &&
      typeof tab === "object" &&
      Array.isArray((tab as { sections?: unknown }).sections) &&
      (tab as { sections: unknown[] }).sections.every(
        (section) =>
          section &&
          typeof section === "object" &&
          Array.isArray((section as { fields?: unknown }).fields),
      ),
  );
  return sane ? (value as RuntimeFormLayout) : null;
}

/* Views store columns as strings, `{ columnKey }` objects, or `{ columns: [...] }`. */
function readColumnKeys(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? (value as { columns?: unknown }).columns
      : null;
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    const key = fieldKeyOf(entry);
    return key ? [key] : [];
  });
}

function readFilters(
  value: unknown,
  known: ReadonlySet<string>,
): ViewFilterMetadata[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const fieldLogicalName = fieldKeyOf(entry);
    if (!fieldLogicalName || !known.has(fieldLogicalName)) return [];
    const record = entry as Record<string, unknown>;
    const operator = normalizeOperator(record.operator ?? record.op);
    if (!operator) return [];
    return [{ fieldLogicalName, operator, value: record.value }];
  });
}

function readSort(
  value: unknown,
  known: ReadonlySet<string>,
): ViewSortMetadata[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const fieldLogicalName = fieldKeyOf(entry);
    if (!fieldLogicalName || !known.has(fieldLogicalName)) return [];
    const direction =
      String((entry as Record<string, unknown>).direction).toLowerCase() ===
      "asc"
        ? "asc"
        : "desc";
    return [{ fieldLogicalName, direction }];
  });
}

function fieldKeyOf(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const record = entry as Record<string, unknown>;
  for (const key of ["columnKey", "fieldLogicalName", "field"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeOperator(value: unknown): string {
  if (typeof value !== "string") return "";
  const operator = value.trim();
  if (operator === "equals" || operator === "eq") return "eq";
  if (operator === "notEquals" || operator === "ne" || operator === "neq") {
    return "neq";
  }
  return operator;
}
