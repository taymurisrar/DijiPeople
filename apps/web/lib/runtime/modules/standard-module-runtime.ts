import type { CommandDefinition } from "../command-runtime.types";
import type {
  EntityMetadata,
  FieldDataType,
  FieldMetadata,
  FormMetadata,
  FormSectionMetadata,
  OptionSetValueMetadata,
  ViewMetadata,
} from "../metadata-runtime.types";
import type {
  ModuleConfig,
  ModuleMetadataBundle,
  ModuleRuntimeCapability,
  ModuleRuntimeContext,
  ModuleRuntimePageKind,
} from "../module-runtime.types";
import type { RuntimePrincipal } from "../security-runtime.types";
import { resolveTenantRuntimeConfig } from "../tenant-runtime.resolver";
import type { TenantRuntimeConfig } from "../tenant-runtime.types";
import { stableRuntimeMetadataId } from "../metadata-id";

export type StandardModuleFieldSpec = {
  readonly logicalName: string;
  readonly displayName: string;
  readonly dataType?: FieldDataType;
  readonly lookupTargetEntityLogicalName?: string;
  readonly options?: readonly OptionSetValueMetadata[];
  readonly isPrimaryName?: boolean;
  readonly isOwner?: boolean;
  readonly isStatus?: boolean;
  readonly isSubStatus?: boolean;
  readonly isSearchable?: boolean;
  readonly isSortable?: boolean;
  readonly isReadOnly?: boolean;
};

export type StandardModuleWidgetSpec = {
  readonly id: string;
  readonly widgetType: string;
  readonly label: string;
  readonly columnSpan?: 1 | 2 | 3 | 4;
  readonly dataSource?: {
    readonly apiPath: string;
    readonly query?: Readonly<Record<string, string>>;
    readonly recordIdQueryKey?: string;
    readonly responseAdapter?: "approval-record";
  };
};

export type StandardModuleViewSpec = {
  readonly logicalName: string;
  readonly viewId: string;
  readonly displayName: string;
  readonly columns: readonly string[];
  readonly isDefault?: boolean;
  readonly filters?: ViewMetadata["filters"];
  readonly defaultSort?: ViewMetadata["defaultSort"];
};

export type StandardModuleRuntimeSpec = {
  readonly moduleKey: string;
  readonly metadataTableKey?: string;
  readonly apiPath?: string;
  readonly createApiPath?: string;
  readonly updateApiPath?: string;
  readonly entityLogicalName: string;
  readonly collectionName: string;
  readonly label: string;
  readonly singularLabel?: string;
  readonly routeBase: string;
  readonly recordNavigation?: boolean;
  readonly primaryIdField?: string;
  readonly primaryNameField: string;
  readonly ownerField?: string;
  readonly statusField?: string;
  readonly subStatusField?: string;
  readonly fields: readonly StandardModuleFieldSpec[];
  readonly views: readonly StandardModuleViewSpec[];
  readonly formFields?: readonly string[];
  readonly formSections?: readonly FormSectionMetadata[];
  readonly minimalFormFields?: readonly string[];
  readonly quickCreateFormFields?: readonly string[];
  readonly commands?: readonly CommandDefinition[];
  readonly widgets?: readonly StandardModuleWidgetSpec[];
  readonly widgetTabLabel?: string;
  readonly capabilities?: readonly ModuleRuntimeCapability[];
  readonly timelineApiPath?: string;
  readonly lookupApiPaths?: Readonly<Record<string, string>>;
  readonly adapterCapabilities?: {
    readonly softDelete?: boolean;
    readonly assignOwner?: boolean;
    readonly disableCreate?: boolean;
    readonly disableEdit?: boolean;
    readonly import?: boolean;
    readonly export?: boolean;
    readonly exportTemplate?: boolean;
  };
  readonly permissions?: {
    readonly read?: string;
    readonly create?: string;
    readonly update?: string;
    readonly delete?: string;
    readonly assign?: string;
    readonly import?: string;
    readonly export?: string;
    readonly share?: string;
  };
};

export function buildStandardModuleRuntimeContext({
  pageKind,
  principal,
  recordId,
  spec,
  tenant,
}: {
  readonly pageKind?: ModuleRuntimePageKind;
  readonly principal: RuntimePrincipal;
  readonly recordId?: string;
  readonly spec: StandardModuleRuntimeSpec;
  readonly tenant?: TenantRuntimeConfig;
}): ModuleRuntimeContext {
  const resolvedTenant =
    tenant ??
    resolveTenantRuntimeConfig({
      tenantId: principal.tenantId || "current",
      tenantSlug: "current",
      displayName: "Current Tenant",
    });

  return {
    tenant: resolvedTenant,
    security: {
      principal,
      fieldSecurityRules: [],
      dataAccessRules: [],
    },
    module: buildStandardModuleConfig(spec),
    metadata: buildStandardModuleMetadataBundle(spec),
    pageKind,
    recordId,
    cacheKeys: [
      resolvedTenant.cachePartitionKey,
      `module:${spec.moduleKey}`,
      `entity:${spec.entityLogicalName}`,
    ],
  };
}

export function buildStandardRuntimePrincipal(input?: {
  readonly userId?: string;
  readonly tenantId?: string;
  readonly displayName?: string | null;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly roleKeys?: readonly string[];
  readonly roles?: RuntimePrincipal["roles"];
  readonly permissionKeys?: readonly string[];
}): RuntimePrincipal {
  return {
    userId: input?.userId ?? "",
    tenantId: input?.tenantId ?? "current",
    displayName: input?.displayName,
    name: input?.name,
    email: input?.email,
    roleKeys: input?.roleKeys ?? [],
    roles: input?.roles ?? [],
    permissionKeys: input?.permissionKeys ?? [],
  };
}

export function buildStandardModuleMetadataBundle(
  spec: StandardModuleRuntimeSpec,
): ModuleMetadataBundle {
  return {
    entity: buildStandardEntity(spec),
    forms: [
      buildStandardForm(spec, "main", "Main Form", spec.formFields),
      buildStandardForm(
        spec,
        "minimal",
        "Minimal Form",
        spec.minimalFormFields ?? spec.formFields?.slice(0, 6),
      ),
      buildStandardForm(
        spec,
        "quickCreate",
        "Quick Create",
        spec.quickCreateFormFields ??
          spec.minimalFormFields ??
          spec.formFields?.slice(0, 5),
      ),
    ],
    views: spec.views.map((view, index) =>
      buildStandardView(spec, view, index),
    ),
    commands: [...buildStandardCommands(spec), ...(spec.commands ?? [])],
  };
}

function buildStandardModuleConfig(
  spec: StandardModuleRuntimeSpec,
): ModuleConfig {
  return {
    key: spec.moduleKey,
    label: spec.label,
    description: `${spec.label} generic module runtime.`,
    entityLogicalName: spec.entityLogicalName,
    routeBase: spec.routeBase,
    recordNavigation: spec.recordNavigation,
    defaultFormLogicalName: `${spec.moduleKey}.main`,
    defaultViewLogicalName:
      spec.views.find((view) => view.isDefault)?.logicalName ??
      spec.views[0]?.logicalName,
    capabilities: spec.capabilities,
  };
}

function buildStandardEntity(spec: StandardModuleRuntimeSpec): EntityMetadata {
  return {
    id: spec.entityLogicalName,
    logicalName: spec.entityLogicalName,
    displayName: spec.singularLabel ?? spec.label,
    description: `${spec.label} generic module metadata.`,
    version: "0.1.0",
    lifecycleState: "published",
    layer: "system",
    collectionName: spec.collectionName,
    primaryIdField: spec.primaryIdField ?? "id",
    primaryNameField: spec.primaryNameField,
    ownerField: spec.ownerField,
    statusField: spec.statusField,
    subStatusField: spec.subStatusField,
    routeBase: spec.routeBase,
    defaultFormLogicalName: `${spec.moduleKey}.main`,
    defaultViewLogicalName:
      spec.views.find((view) => view.isDefault)?.logicalName ??
      spec.views[0]?.logicalName,
    permissions: {
      read: permission(spec.permissions?.read, "read"),
      create: permission(spec.permissions?.create, "create"),
      update: permission(spec.permissions?.update, "update"),
      delete: permission(spec.permissions?.delete, "delete"),
    },
    fields: buildStandardFields(spec),
  };
}

function buildStandardFields(
  spec: StandardModuleRuntimeSpec,
): readonly FieldMetadata[] {
  const idField = spec.primaryIdField ?? "id";
  const fields = ensureRequiredFields(spec.fields, {
    idField,
    primaryNameField: spec.primaryNameField,
    statusField: spec.statusField,
  });

  return fields.map((field) => ({
    id: `${spec.entityLogicalName}.${field.logicalName}`,
    logicalName: field.logicalName,
    displayName: field.displayName,
    version: "0.1.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: spec.entityLogicalName,
    dataType: field.dataType ?? "string",
    requirementLevel:
      field.logicalName === spec.primaryNameField ? "required" : "none",
    behavior:
      field.logicalName === idField || field.isReadOnly ? "readonly" : "normal",
    isPrimaryName:
      field.isPrimaryName ?? field.logicalName === spec.primaryNameField,
    isOwner: field.isOwner ?? field.logicalName === spec.ownerField,
    isStatus: field.isStatus ?? field.logicalName === spec.statusField,
    isSubStatus: field.isSubStatus ?? field.logicalName === spec.subStatusField,
    isSearchable: field.isSearchable ?? true,
    isSortable: field.isSortable ?? true,
    lookupTargets: lookupTargetsForField(spec, field),
    options: field.options,
  }));
}

function lookupTargetsForField(
  spec: StandardModuleRuntimeSpec,
  field: StandardModuleFieldSpec,
) {
  if (field.dataType !== "lookup") {
    return undefined;
  }

  const explicitTarget = field.lookupTargetEntityLogicalName;
  if (explicitTarget) {
    return [{ entityLogicalName: explicitTarget }];
  }

  const lookupPath = spec.lookupApiPaths?.[field.logicalName];
  const inferredTarget = lookupPath
    ? inferEntityLogicalNameFromLookupPath(lookupPath)
    : "";

  return inferredTarget ? [{ entityLogicalName: inferredTarget }] : undefined;
}

function inferEntityLogicalNameFromLookupPath(path: string) {
  const pathname = path.split("?")[0]?.replace(/^\/api\//, "") ?? "";
  const segments = pathname.split("/").filter(Boolean);
  const key = segments.at(-1);
  if (!key) return "";

  if (segments[0] === "lookups" || segments[0] === "configuration") {
    return `settings_${key.replaceAll("-", "_")}`;
  }

  return `settings_${key.replaceAll("-", "_")}`;
}

function buildStandardForm(
  spec: StandardModuleRuntimeSpec,
  formType: NonNullable<FormMetadata["formType"]>,
  displayName: string,
  configuredFields?: readonly string[],
): FormMetadata {
  const fieldNames = configuredFields?.length
    ? configuredFields
    : spec.fields.map((field) => field.logicalName);
  const logicalName = `${spec.moduleKey}.${formType}`;
  const supportsTimeline = spec.capabilities?.includes("timeline") ?? false;
  const configuredSections =
    formType === "main" || formType === "quickCreate"
      ? spec.formSections
      : undefined;
  const columns = configuredSections?.length ? 2 : 3;
  const sectionIds = configuredSections?.length
    ? configuredSections.map((section) => section.id)
    : [`${logicalName}.summary`];

  return {
    id: stableRuntimeMetadataId(`form:${logicalName}`),
    logicalName,
    displayName,
    description: `${spec.label} ${displayName}.`,
    version: "0.1.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: spec.entityLogicalName,
    mode: "read",
    formType,
    columns,
    tabs: [
      {
        id: `${logicalName}.general`,
        tabKey: "general",
        label: "General",
        order: 10,
        type: "fields",
        sectionIds,
      },
      ...(supportsTimeline
        ? [
            {
              id: `${logicalName}.timeline`,
              tabKey: "timeline",
              label: "Timeline",
              order: 20,
              type: "fields" as const,
              sectionIds: [`${logicalName}.timeline.section`],
            },
          ]
        : []),
      ...(formType === "main" && spec.widgets?.length
        ? [
            {
              id: `${logicalName}.widgets`,
              tabKey: "widgets",
              label: spec.widgetTabLabel ?? "Widgets",
              order: 30,
              type: "fields" as const,
              sectionIds: [`${logicalName}.widgets.section`],
            },
          ]
        : []),
    ],
    sections: [
      ...(configuredSections?.length
        ? configuredSections
        : [
            {
              id: `${logicalName}.summary`,
              tabKey: "general",
              label: "Summary",
              order: 10,
              layout: "single-column" as const,
              columns: 1 as const,
              fields: fieldNames.map((fieldLogicalName, index) => ({
                fieldLogicalName,
                order: (index + 1) * 10,
              })),
            },
          ]),
      ...(formType === "main" && spec.widgets?.length
        ? [
            {
              id: `${logicalName}.widgets.section`,
              tabKey: "widgets",
              label: spec.widgetTabLabel ?? "Widgets",
              order: 30,
              layout: "three-column" as const,
              columns: 3 as const,
              fields: [],
              components: spec.widgets.map((widget, index) => ({
                id: widget.id,
                type: "widget" as const,
                widgetId: widget.id,
                widgetType: widget.widgetType,
                order: (index + 1) * 10,
                label: widget.label,
                columnSpan: widget.columnSpan ?? 3,
                lifecycleState: "published" as const,
              })),
            },
          ]
        : []),
      ...(supportsTimeline
        ? [
            {
              id: `${logicalName}.timeline.section`,
              tabKey: "timeline",
              label: "Timeline",
              order: 20,
              layout: "single-column" as const,
              columns: 1 as const,
              fields: [],
              components: [
                {
                  id: `${logicalName}.timeline.component`,
                  type: "widget" as const,
                  widgetId: "system.timeline",
                  widgetType: "timeline",
                  order: 10,
                  label: "Timeline",
                  columnSpan: 1 as const,
                  lifecycleState: "published" as const,
                },
              ],
            },
          ]
        : []),
    ],
  };
}

function buildStandardView(
  spec: StandardModuleRuntimeSpec,
  view: StandardModuleViewSpec,
  index: number,
): ViewMetadata {
  return {
    id: view.viewId,
    logicalName: view.logicalName,
    viewId: view.viewId,
    displayName: view.displayName,
    description: `${view.displayName} view.`,
    version: "0.1.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: spec.entityLogicalName,
    type: "main",
    columns: view.columns.map((fieldLogicalName, columnIndex) => ({
      fieldLogicalName,
      order: (columnIndex + 1) * 10,
      isSortable: true,
    })),
    defaultSort: view.defaultSort,
    filters: view.filters,
    pageSize: 20,
    isDefault: view.isDefault ?? index === 0,
    isSystem: true,
    isPublished: true,
    visibilityScope: "tenant",
  };
}

function buildStandardCommands(
  spec: StandardModuleRuntimeSpec,
): readonly CommandDefinition[] {
  const hasActiveField = spec.fields.some(
    (field) => field.logicalName === "isActive",
  );

  return [
    command("system.back", "Back", "detail-command-bar", 10),
    command("system.new", "New", "list-command-bar", 20, {
      permission: permission(spec.permissions?.create, "create"),
      isDisabled:
        spec.recordNavigation === false ||
        spec.adapterCapabilities?.disableCreate === true,
      disabledReason:
        spec.recordNavigation === false ||
        spec.adapterCapabilities?.disableCreate
          ? "Create is not available for this module."
          : undefined,
    }),
    command("system.edit", "Edit", "detail-command-bar", 30, {
      permission: permission(spec.permissions?.update, "update"),
      isDisabled:
        spec.recordNavigation === false ||
        spec.adapterCapabilities?.disableEdit === true,
      disabledReason:
        spec.recordNavigation === false || spec.adapterCapabilities?.disableEdit
          ? "Edit is not available for this module."
          : undefined,
    }),
    command("system.refresh", "Refresh", "list-command-bar", 40),
    ...(spec.adapterCapabilities?.export === false
      ? []
      : [
          command("system.export", "Export", "list-command-bar", 45, {
            groupKey: "data-transfer",
            groupLabel: "Data Transfer",
            permission: permission(spec.permissions?.export, "export"),
          }),
        ]),
    ...(spec.adapterCapabilities?.import === false
      ? []
      : [
          command("system.import", "Import", "list-command-bar", 46, {
            groupKey: "data-transfer",
            groupLabel: "Data Transfer",
            permission: permission(spec.permissions?.import, "import"),
            isDisabled: true,
            disabledReason:
              "Generic import is not configured for this module yet.",
          }),
        ]),
    ...(spec.adapterCapabilities?.exportTemplate === false
      ? []
      : [
          command(
            "system.exportTemplate",
            "Export Template",
            "list-command-bar",
            47,
            {
              groupKey: "data-transfer",
              groupLabel: "Data Transfer",
              permission: permission(spec.permissions?.export, "export"),
            },
          ),
        ]),
    command("system.save", "Save", "detail-command-bar", 50, {
      permission: permission(spec.permissions?.update, "update"),
      isDisabled: spec.recordNavigation === false,
      disabledReason:
        spec.recordNavigation === false
          ? "This setting is read-only."
          : undefined,
    }),
    command("system.saveAndClose", "Save & Close", "detail-command-bar", 60, {
      permission: permission(spec.permissions?.update, "update"),
      isDisabled: spec.recordNavigation === false,
      disabledReason:
        spec.recordNavigation === false
          ? "This setting is read-only."
          : undefined,
    }),
    command("system.delete", "Delete", "detail-command-bar", 90, {
      isDestructive: true,
      requiresConfirmation: true,
      permission: permission(spec.permissions?.delete, "delete"),
      confirmation: {
        title: "Delete this record?",
        description:
          "This will remove the record from active use. Data may be retained according to module policy.",
        confirmLabel: "Delete",
        destructive: true,
      },
      isDisabled: !spec.adapterCapabilities?.softDelete,
      disabledReason: spec.adapterCapabilities?.softDelete
        ? undefined
        : "Delete is not configured for this module.",
    }),
    command("selection.delete", "Delete", "bulk-menu", 91, {
      isDestructive: true,
      requiresConfirmation: true,
      permission: permission(spec.permissions?.delete, "delete"),
      visibilityRules: [{ operator: "record-selected" }],
      confirmation: {
        title: "Delete selected records?",
        description:
          "This will remove {selectedCount} selected records from active use. Data may be retained according to module policy.",
        confirmLabel: "Delete",
        destructive: true,
      },
      isDisabled: !spec.adapterCapabilities?.softDelete,
      disabledReason: spec.adapterCapabilities?.softDelete
        ? undefined
        : "Delete is not configured for this module.",
    }),
    command("selection.assignOwner", "Assign", "bulk-menu", 92, {
      permission: permission(spec.permissions?.assign, "assign"),
      visibilityRules: [{ operator: "record-selected" }],
      isDisabled: !spec.adapterCapabilities?.assignOwner,
      disabledReason: spec.adapterCapabilities?.assignOwner
        ? undefined
        : "Owner assignment is not configured for this module adapter yet.",
    }),
    ...(hasActiveField
      ? [
          command("record.activate", "Activate", "detail-command-bar", 93, {
            permission: permission(spec.permissions?.update, "update"),
          }),
          command("record.deactivate", "Deactivate", "detail-command-bar", 94, {
            permission: permission(spec.permissions?.update, "update"),
          }),
          command("selection.activate", "Activate", "bulk-menu", 95, {
            permission: permission(spec.permissions?.update, "update"),
            visibilityRules: [{ operator: "record-selected" }],
          }),
          command("selection.deactivate", "Deactivate", "bulk-menu", 96, {
            permission: permission(spec.permissions?.update, "update"),
            visibilityRules: [{ operator: "record-selected" }],
          }),
        ]
      : []),
    command("record.assignOwner", "Assign", "detail-command-bar", 100, {
      permission: permission(spec.permissions?.assign, "assign"),
      isDisabled: !spec.adapterCapabilities?.assignOwner,
      disabledReason: spec.adapterCapabilities?.assignOwner
        ? undefined
        : "Owner assignment is not configured for this module adapter yet.",
    }),
    command("record.share", "Share", "detail-command-bar", 130, {
      permission: permission(spec.permissions?.share, "execute"),
    }),
    command("record.export", "Export", "detail-command-bar", 140, {
      permission: permission(spec.permissions?.export, "export"),
    }),
  ];
}

function command(
  key: string,
  label: string,
  placement: CommandDefinition["placement"],
  order: number,
  overrides: Partial<CommandDefinition> = {},
): CommandDefinition {
  return {
    key,
    label,
    scope: key.startsWith("selection.")
      ? "selection"
      : key.startsWith("record.")
        ? "record"
        : "system",
    placement,
    executionMode:
      key === "system.back" || key === "system.new" || key === "system.edit"
        ? "navigation"
        : "client",
    handlerKey: key,
    order,
    ...overrides,
  };
}

function permission(
  permissionKey: string | undefined,
  operation: NonNullable<CommandDefinition["permission"]>["operation"],
) {
  return permissionKey
    ? { permissionKey, operation, scope: "tenant" as const }
    : undefined;
}

function ensureRequiredFields(
  fields: readonly StandardModuleFieldSpec[],
  input: {
    readonly idField: string;
    readonly primaryNameField: string;
    readonly statusField?: string;
  },
) {
  const existing = new Map(fields.map((field) => [field.logicalName, field]));
  const required: StandardModuleFieldSpec[] = [];

  if (!existing.has(input.idField)) {
    required.push({
      logicalName: input.idField,
      displayName: "Record ID",
      dataType: "string",
    });
  }

  if (!existing.has(input.primaryNameField)) {
    required.push({
      logicalName: input.primaryNameField,
      displayName: "Name",
      dataType: "string",
      isPrimaryName: true,
    });
  }

  if (input.statusField && !existing.has(input.statusField)) {
    required.push({
      logicalName: input.statusField,
      displayName: "Status",
      dataType: "optionset",
      isStatus: true,
    });
  }

  return [...required, ...fields];
}
