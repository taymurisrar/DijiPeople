import { stableRuntimeMetadataId } from "@/lib/runtime/metadata-id";
import { singularize } from "@/lib/text/inflection";
import type { FormSectionMetadata } from "@/lib/runtime/metadata-runtime.types";
import type {
  StandardModuleFieldSpec,
  StandardModuleRuntimeSpec,
} from "@/lib/runtime/modules/standard-module-runtime";
import {
  attendanceSettingsSections,
  documentSettingsSections,
  employeeSettingsSections,
  notificationSettingsSections,
  payrollSettingsSections,
  passwordLoginSettingsSections,
  recruitmentSettingsSections,
  systemSettingsSections,
  timesheetSettingsSections,
} from "./settings-page-config";
import { organizationSettingsSections } from "./organization-settings-config";
import {
  WORK_SITE_SECTION_IDS,
  WORK_SITE_TAB_KEYS,
} from "./work-site-form-sections";

export type SettingsAdapterMode =
  | "crud"
  | "read-only"
  | "record"
  | "specialized";

type RuntimeSettingsSection = {
  readonly title: string;
  readonly tabKey?: string;
  readonly fields: readonly {
    readonly category: string;
    readonly key: string;
    readonly label: string;
    readonly type: string;
    readonly options?: readonly {
      readonly label: string;
      readonly value: string;
    }[];
    readonly disabled?: boolean;
    readonly lookupKey?: string;
  }[];
};

export type SettingsRuntimeAdapter = {
  key: string;
  mode: SettingsAdapterMode;
  spec: StandardModuleRuntimeSpec;
  serverApiPath: string;
  collectionKey?: string;
  /*
   * BUG-2043 - the settings list may only ask the API for one page when the API
   * accepts `page`/`pageSize` and answers with a total. The global
   * ValidationPipe runs with `forbidNonWhitelisted`, so sending those
   * parameters to an endpoint whose query DTO does not declare them is a 400,
   * not a harmless extra. The flag is therefore opt-in per adapter and must
   * only be set once the backing endpoint has been read.
   */
  supportsServerPagination?: boolean;
  initialValues: Readonly<Record<string, unknown>>;
  lookupSources: Readonly<Record<string, string>>;
  choiceLists: readonly string[];
  validationMapping: Readonly<Record<string, string>>;
  displayFormatters: Readonly<
    Record<string, "date" | "datetime" | "money" | "boolean">
  >;
  transfer: { import: boolean; export: boolean; exportTemplate: boolean };
  routes: { list: boolean; detail: boolean; create: boolean; edit: boolean };
  timeline: boolean;
  softDelete: boolean;
  blocker?: string;
  recordCategory?: string;
  settingFieldCategories?: Readonly<Record<string, string>>;
  specializedHref?: string;
};

const statusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "EXPIRED", label: "Expired" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

const activeStatusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

const choices = (...values: string[]) =>
  values.map((value) => ({
    value,
    label: value
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }));

const structureSubStatusOptions = choices(
  "OPERATIONAL",
  "UNDER_SETUP",
  "PENDING_ACTIVATION",
  "DEACTIVATED",
  "ARCHIVED",
  "MERGED",
  "CLOSED",
);

const currencyStatusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

const currencyStatusSubStatusOptions = [
  { value: "AVAILABLE", label: "Available", parentValue: "ACTIVE" },
  { value: "DEFAULT", label: "Default", parentValue: "ACTIVE" },
  { value: "UNDER_REVIEW", label: "Under Review", parentValue: "ACTIVE" },
  { value: "DEPRECATED", label: "Deprecated", parentValue: "INACTIVE" },
  { value: "REPLACED", label: "Replaced", parentValue: "INACTIVE" },
  { value: "ARCHIVED", label: "Archived", parentValue: "INACTIVE" },
] as const;

const organizationTypeOptions = choices(
  "OPERATING",
  "LEGAL_ENTITY",
  "BRANCH",
  "SUBSIDIARY",
  "REGION",
);

function field(
  logicalName: string,
  displayName: string,
  dataType: StandardModuleFieldSpec["dataType"] = "string",
  extra: Partial<StandardModuleFieldSpec> = {},
): StandardModuleFieldSpec {
  return { logicalName, displayName, dataType, ...extra };
}

function postingDimensionFields(): StandardModuleFieldSpec[] {
  const sourceOptions = choices(
    "FIXED_VALUE",
    "EMPLOYEE",
    "EMPLOYEE_DEPARTMENT",
    "EMPLOYEE_BUSINESS_UNIT",
    "EMPLOYEE_COST_CENTER",
    "EMPLOYEE_PROJECT",
    "PAYROLL_RUN",
    "PAY_COMPONENT",
    "COMPENSATION_ASSIGNMENT",
  );
  return [
    field(
      "debitBusinessUnitSource",
      "Debit Business Unit Source",
      "optionset",
      { options: sourceOptions },
    ),
    field(
      "creditBusinessUnitSource",
      "Credit Business Unit Source",
      "optionset",
      { options: sourceOptions },
    ),
    field("debitDepartmentSource", "Debit Department Source", "optionset", {
      options: sourceOptions,
    }),
    field("creditDepartmentSource", "Credit Department Source", "optionset", {
      options: sourceOptions,
    }),
    field("debitCostCenterSource", "Debit Cost Center Source", "optionset", {
      options: sourceOptions,
    }),
    field("creditCostCenterSource", "Credit Cost Center Source", "optionset", {
      options: sourceOptions,
    }),
    field("debitProjectSource", "Debit Project Source", "optionset", {
      options: sourceOptions,
    }),
    field("creditProjectSource", "Credit Project Source", "optionset", {
      options: sourceOptions,
    }),
    field("debitEmployeeSource", "Debit Employee Source", "optionset", {
      options: sourceOptions,
    }),
    field("creditEmployeeSource", "Credit Employee Source", "optionset", {
      options: sourceOptions,
    }),
  ];
}

function formSection(input: {
  id: string;
  label: string;
  order: number;
  tabKey?: string;
  column?: 1 | 2;
  columnSpan?: 1 | 2;
  columns?: 1 | 2 | 3 | 4;
  fields: readonly (
    | string
    | {
        readonly key: string;
        readonly label?: string;
        readonly required?: boolean;
        readonly readonly?: boolean;
        readonly columnSpan?: 1 | 2 | 3 | 4;
      }
  )[];
}): FormSectionMetadata {
  return {
    id: input.id,
    tabKey: input.tabKey ?? "general",
    label: input.label,
    order: input.order,
    layout: formSectionLayout(input.columns ?? 1),
    columns: input.columns ?? 1,
    column: input.column,
    columnSpan: input.columnSpan,
    fields: input.fields.map((item, index) => {
      const key = typeof item === "string" ? item : item.key;
      return {
        fieldLogicalName: key,
        label: typeof item === "string" ? undefined : item.label,
        columnSpan: typeof item === "string" ? undefined : item.columnSpan,
        order: (index + 1) * 10,
        isReadonly: typeof item === "string" ? undefined : item.readonly,
        requirementLevel:
          typeof item !== "string" && item.required ? "required" : undefined,
      };
    }),
  };
}

function formSectionLayout(
  columns: 1 | 2 | 3 | 4,
): FormSectionMetadata["layout"] {
  if (columns === 1) return "single-column";
  if (columns === 3) return "three-column";
  if (columns === 4) return "four-column";
  return "two-column";
}

/**
 * The Work Site form, grouped the way a work site is actually set up.
 *
 * Sections marked "purpose-built" carry no fields: their bodies are supplied by
 * WorkSiteRecordPage, because a map, an inheritance switch and a readiness panel
 * cannot be expressed as a grid of metadata fields. They still live in the form
 * metadata so tab order, visibility and the record's single save flow stay the
 * runtime's job rather than a parallel implementation.
 */
function workSiteFormSections(): readonly FormSectionMetadata[] {
  const purposeBuilt = (
    id: string,
    label: string,
    tabKey: string,
    order: number,
    tabLabel?: string,
  ): FormSectionMetadata => ({
    id,
    tabKey,
    label,
    tabLabel,
    order,
    layout: "single-column",
    columns: 1,
    // Every Work Site section is full width: the form is a sequence of
    // decisions, and a map or a policy switch beside a half-width field column
    // reads as two unrelated forms.
    columnSpan: 2,
    fields: [],
  });

  return [
    /*
     * The operational summary lives INSIDE the Summary tab, not above the tabs.
     * Pinning it above meant every tab carried a block the Summary tab then
     * repeated in full — the same facts twice on one screen.
     */
    purposeBuilt(
      WORK_SITE_SECTION_IDS.overview,
      "Summary",
      WORK_SITE_TAB_KEYS.general,
      10,
    ),
    formSection({
      id: WORK_SITE_SECTION_IDS.general,
      label: "General Information",
      order: 20,
      tabKey: WORK_SITE_TAB_KEYS.general,
      columns: 2,
      columnSpan: 2,
      fields: [
        { key: "name", required: true },
        "code",
        "description",
        "isActive",
      ],
    }),
    formSection({
      id: WORK_SITE_SECTION_IDS.address,
      label: "Location & Geofence",
      order: 30,
      tabKey: WORK_SITE_TAB_KEYS.location,
      columns: 2,
      columnSpan: 2,
      fields: [
        "addressLine1",
        "addressLine2",
        { key: "city", required: true },
        { key: "state", required: true },
        { key: "country", required: true },
        "zipCode",
        "timezone",
      ],
    }),
    purposeBuilt(
      WORK_SITE_SECTION_IDS.geofence,
      "Map, pin and geofence radius",
      WORK_SITE_TAB_KEYS.location,
      40,
    ),
    purposeBuilt(
      WORK_SITE_SECTION_IDS.accuracy,
      "Location Accuracy Requirement",
      WORK_SITE_TAB_KEYS.location,
      50,
    ),
    purposeBuilt(
      WORK_SITE_SECTION_IDS.testLocation,
      "Test this location",
      WORK_SITE_TAB_KEYS.location,
      60,
    ),
    purposeBuilt(
      WORK_SITE_SECTION_IDS.attendancePolicy,
      "Attendance Policy",
      WORK_SITE_TAB_KEYS.attendance,
      70,
    ),
    purposeBuilt(
      WORK_SITE_SECTION_IDS.related,
      "Related Records",
      WORK_SITE_TAB_KEYS.related,
      80,
    ),
    /*
     * "More" groups the two sections an administrator visits rarely. Its own
     * label is carried by `tabLabel` so the first section can keep the heading
     * that describes it rather than the group.
     */
    purposeBuilt(
      WORK_SITE_SECTION_IDS.effectivePeriod,
      "Configuration Effective Period",
      WORK_SITE_TAB_KEYS.more,
      90,
      "More",
    ),
    purposeBuilt(
      WORK_SITE_SECTION_IDS.advanced,
      "Advanced",
      WORK_SITE_TAB_KEYS.more,
      100,
    ),
  ];
}

function adapter(input: {
  key: string;
  label: string;
  singular?: string;
  serverApiPath: string;
  clientApiPath?: string;
  routeBase?: string;
  primaryName?: string;
  primaryId?: string;
  ownerField?: string;
  statusField?: string;
  subStatusField?: string;
  fields: readonly StandardModuleFieldSpec[];
  formFields?: readonly string[];
  formSections?: readonly FormSectionMetadata[];
  columns?: readonly string[];
  lookupSources?: Readonly<Record<string, string>>;
  widgets?: StandardModuleRuntimeSpec["widgets"];
  widgetTabLabel?: string;
  relatedTabs?: StandardModuleRuntimeSpec["relatedTabs"];
  permissions?: StandardModuleRuntimeSpec["permissions"];
  initialValues?: Readonly<Record<string, unknown>>;
  collectionKey?: string;
  supportsServerPagination?: boolean;
  mode?: SettingsAdapterMode;
  softDelete?: boolean;
  timelineApiPath?: string;
  formatters?: SettingsRuntimeAdapter["displayFormatters"];
  transfer?: Partial<SettingsRuntimeAdapter["transfer"]>;
  createCommandLabel?: string;
  blocker?: string;
  recordCategory?: string;
  settingFieldCategories?: Readonly<Record<string, string>>;
  specializedHref?: string;
}): SettingsRuntimeAdapter {
  const routeBase = input.routeBase ?? `/settings-runtime/${input.key}`;
  const mode = input.mode ?? "crud";
  const lookupSources = input.lookupSources ?? {};
  const hasActiveField = input.fields.some(
    (field) => field.logicalName === "isActive",
  );
  const softDelete = input.softDelete ?? (mode === "crud" && hasActiveField);
  const transfer = {
    import: input.transfer?.import ?? false,
    export: input.transfer?.export ?? false,
    exportTemplate: input.transfer?.exportTemplate ?? false,
  };
  const permissions =
    input.permissions ??
    (mode === "read-only" || mode === "specialized"
      ? { read: "settings.read" }
      : {
          read: "settings.read",
          create: mode === "crud" ? "settings.update" : undefined,
          update: "settings.update",
          delete: softDelete ? "settings.update" : undefined,
        });
  const resolvedPermissions = {
    ...permissions,
    delete: permissions.delete ?? (softDelete ? permissions.update : undefined),
  };
  const spec: StandardModuleRuntimeSpec = {
    moduleKey: `settings-${input.key}`,
    apiPath: input.clientApiPath ?? `/api${input.serverApiPath}`,
    entityLogicalName: `settings_${input.key.replaceAll("-", "_")}`,
    collectionName: input.key,
    label: input.label,
    /*
     * BUG-1964 — this was `input.label.replace(/s$/, "")`, which turned
     * "Leave Policies" into "Leave Policie" and put that on a record header in
     * capitals and on a "New Leave Policie" action, on the tenant used for
     * demonstrations. A declared `singular` still wins; `singularize` covers
     * the labels that never declared one, and leaves a word it does not
     * recognise alone rather than guessing at it.
     */
    singularLabel: input.singular ?? singularize(input.label),
    createCommandLabel: input.createCommandLabel,
    routeBase,
    recordNavigation: mode !== "specialized",
    primaryIdField: input.primaryId,
    primaryNameField: input.primaryName ?? "name",
    ownerField:
      input.ownerField ??
      input.fields.find((fieldSpec) => fieldSpec.isOwner)?.logicalName,
    statusField: input.statusField,
    subStatusField: input.subStatusField,
    fields: input.fields,
    formFields: input.formFields,
    formSections: input.formSections,
    lookupApiPaths: lookupSources,
    widgets: input.widgets,
    widgetTabLabel: input.widgetTabLabel,
    relatedTabs: input.relatedTabs,
    capabilities: input.timelineApiPath ? ["timeline"] : undefined,
    timelineApiPath: input.timelineApiPath,
    permissions: resolvedPermissions,
    adapterCapabilities: {
      softDelete,
      disableCreate: mode === "record" || mode === "read-only",
      disableEdit: mode === "read-only",
      import: transfer.import,
      export: transfer.export,
      exportTemplate: transfer.exportTemplate,
    },
    views: [
      {
        logicalName: `settings.${input.key}.all`,
        viewId: stableRuntimeMetadataId(`settings-view:${input.key}:all`),
        displayName: `All ${input.label}`,
        columns:
          input.columns ??
          input.fields.slice(0, 6).map((item) => item.logicalName),
        isDefault: true,
      },
    ],
  };
  return {
    key: input.key,
    mode,
    spec,
    serverApiPath: input.serverApiPath,
    collectionKey: input.collectionKey,
    supportsServerPagination: input.supportsServerPagination ?? false,
    initialValues: input.initialValues ?? {},
    lookupSources,
    choiceLists: input.fields
      .filter((item) => item.dataType === "optionset")
      .map((item) => item.logicalName),
    validationMapping: Object.fromEntries(
      input.fields.map((item) => [item.logicalName, item.logicalName]),
    ),
    displayFormatters: input.formatters ?? {},
    transfer,
    routes: {
      list: mode === "crud" || mode === "read-only",
      detail: mode === "crud" || mode === "record" || mode === "read-only",
      create: mode === "crud" && Boolean(permissions.create),
      edit:
        (mode === "crud" || mode === "record") && Boolean(permissions.update),
    },
    timeline: Boolean(input.timelineApiPath),
    softDelete,
    blocker: input.blocker,
    recordCategory: input.recordCategory,
    settingFieldCategories: input.settingFieldCategories,
    specializedHref: input.specializedHref,
  };
}

function recordAdapter(
  key: string,
  label: string,
  recordCategory: string,
  sections: readonly RuntimeSettingsSection[],
): SettingsRuntimeAdapter {
  const settingFieldCategories = Object.fromEntries(
    sections.flatMap((section) =>
      section.fields.map((item) => [item.key, item.category] as const),
    ),
  );
  const fields = sections.flatMap((section) =>
    section.fields.map((item) =>
      field(item.key, item.label, settingsFieldType(item.type), {
        options: item.options,
        isReadOnly: item.disabled,
        isPrimaryName:
          item.key === "companyDisplayName" || item.key === "brandName",
      }),
    ),
  );
  const primaryName =
    fields.find((item) => item.isPrimaryName)?.logicalName ??
    fields[0]?.logicalName ??
    "name";
  const lookupSources = Object.fromEntries(
    sections.flatMap((section) =>
      section.fields.flatMap((item) => {
        if (!item.lookupKey) return [];
        const path = tenantLookupPaths[item.lookupKey];
        return path ? ([[item.key, path]] as const) : [];
      }),
    ),
  );
  const formSections = sections.map((section, sectionIndex) => ({
    id: `settings-${key}-${slugify(section.title)}`,
    tabKey: section.tabKey ?? "general",
    label: section.title,
    order: (sectionIndex + 1) * 10,
    layout: "single-column" as const,
    columns: 1 as const,
    column: ((sectionIndex % 2) + 1) as 1 | 2,
    fields: section.fields.map((item, fieldIndex) => ({
      fieldLogicalName: item.key,
      label: item.label,
      order: (fieldIndex + 1) * 10,
    })),
  })) satisfies readonly FormSectionMetadata[];
  return adapter({
    key,
    label,
    serverApiPath: "/tenant-settings",
    clientApiPath: "/api/tenant-settings",
    primaryId: "settingsCategory",
    primaryName,
    fields,
    formFields: fields.map((item) => item.logicalName),
    formSections,
    lookupSources,
    columns: fields.slice(0, 6).map((item) => item.logicalName),
    permissions: { read: "settings.read", update: "settings.update" },
    mode: "record",
    recordCategory,
    settingFieldCategories,
  });
}

const tenantLookupPaths: Readonly<Record<string, string>> = {
  assignmentRules: "/api/settings-runtime/assignment-rules",
  candidateSources: "/api/settings-runtime/candidate-sources",
  countries: "/api/lookups/countries",
  currencies: "/api/configuration/currencies",
  documentChecklists: "/api/settings-runtime/document-checklists",
  documentTemplates: "/api/settings-runtime/document-templates",
  emailTemplates: "/api/notifications/email-templates",
  employmentTypes: "/api/employment-types",
  interviewPanelRules: "/api/settings-runtime/interview-panel-rules",
  numberGenerationRules: "/api/settings-runtime/number-generation-rules",
  onboardingChecklistTemplates: "/api/onboarding/templates",
  onboardingPlans: "/api/settings-runtime/onboarding-plans",
  recruitmentPipelines: "/api/recruitment/pipelines",
  timesheetPolicies: "/api/timesheet-policies?enabled=true",
  retentionPolicies: "/api/settings-runtime/retention-policies",
  timezones: "/api/configuration/timezones",
  dashboardViews: "/api/lookups/dashboard-views",
};

function genericConfigurationAdapter(
  key: string,
  label: string,
): SettingsRuntimeAdapter {
  return adapter({
    key,
    label,
    serverApiPath: `/settings-runtime/${key}`,
    clientApiPath: `/api/settings-runtime/${key}`,
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("configuration", "Configuration", "json"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("isActive", "Active", "boolean", { isStatus: true }),
    ],
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: { name: "", code: "", configuration: {}, isActive: true },
    softDelete: true,
    formatters: {
      effectiveFrom: "date",
      effectiveTo: "date",
      isActive: "boolean",
    },
  });
}

function salaryPackageRulesAdapter(): SettingsRuntimeAdapter {
  return adapter({
    key: "salary-package-rules",
    label: "Compensation Packages",
    singular: "Compensation Package",
    serverApiPath: "/salary-package-rules",
    clientApiPath: "/api/salary-package-rules",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code", "string"),
      field("description", "Description", "multiline-string"),
      field("currencyCode", "Currency", "lookup", {
        lookupTargetEntityLogicalName: "settings_currencies",
      }),
      field("organizationId", "Organization", "lookup", {
        lookupTargetEntityLogicalName: "settings_organizations",
      }),
      field("legalEntityId", "Legal Entity", "lookup"),
      field("businessUnitId", "Business Unit", "lookup", {
        lookupTargetEntityLogicalName: "settings_business_units",
        dependsOnFieldId: "organizationId",
        dependencyFilterKey: "organizationId",
        resetOnParentChange: true,
      }),
      field("departmentId", "Department", "lookup", {
        lookupTargetEntityLogicalName: "settings_departments",
        dependsOnFieldId: "businessUnitId",
        dependencyFilterKey: "businessUnitId",
        resetOnParentChange: true,
      }),
      field("employeeLevelId", "Employee Level", "lookup", {
        lookupTargetEntityLogicalName: "settings_employee_levels",
      }),
      field("employmentTypeId", "Employment Type", "lookup", {
        lookupTargetEntityLogicalName: "settings_employment_types",
      }),
      field("payComponentId", "Pay Component", "lookup"),
      field("percentageBaseComponentId", "Percentage Base Component", "lookup"),
      field("payFrequency", "Pay Frequency", "optionset", {
        options: choices(
          "WEEKLY",
          "BI_WEEKLY",
          "SEMI_MONTHLY",
          "MONTHLY",
          "QUARTERLY",
          "ANNUAL",
        ),
      }),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("priority", "Priority", "number"),
      field("isDefault", "Default Package", "boolean"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("ownerUserId", "Owner", "lookup", { isOwner: true }),
      field("autoAssign", "Auto Assign", "boolean"),
      field("allowEmployeeOverride", "Allow Employee Override", "boolean"),
      field(
        "overrideRequiresApproval",
        "Override Requires Approval",
        "boolean",
      ),
      field("eligibilityRules", "Eligibility Rule Builder", "json"),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("version", "Version", "number", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
      field("isActive", "Active", "boolean"),
    ],
    formSections: [
      formSection({
        id: "salary-package-rule-summary",
        label: "Summary",
        tabKey: "summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          "description",
          { key: "currencyCode", required: true },
          "organizationId",
          "legalEntityId",
          { key: "payFrequency", required: true },
          "effectiveFrom",
          "effectiveTo",
          "priority",
          "isDefault",
          { key: "status", required: true },
          { key: "ownerUserId", required: true },
          "autoAssign",
          "allowEmployeeOverride",
          "overrideRequiresApproval",
        ],
      }),
      formSection({
        id: "salary-package-rule-eligibility",
        label: "Eligibility",
        tabKey: "eligibility",
        order: 20,
        columns: 2,
        fields: [
          "organizationId",
          "businessUnitId",
          "departmentId",
          "employeeLevelId",
          "employmentTypeId",
          { key: "eligibilityRules", columnSpan: 2 },
        ],
      }),
      formSection({
        id: "salary-package-rule-usage",
        label: "Usage",
        tabKey: "usage",
        order: 50,
        columns: 2,
        fields: [
          { key: "isDefault", readonly: true },
          { key: "status", readonly: true },
        ],
      }),
      formSection({
        id: "salary-package-rule-version",
        label: "Version History",
        tabKey: "version-history",
        order: 60,
        columns: 3,
        fields: [
          { key: "version", readonly: true },
          { key: "createdAt", readonly: true },
          { key: "updatedAt", readonly: true },
        ],
      }),
      formSection({
        id: "salary-package-rule-audit",
        label: "Audit",
        tabKey: "audit",
        order: 70,
        columns: 3,
        fields: [
          { key: "ownerUserId", readonly: true },
          { key: "createdById", readonly: true },
          { key: "updatedById", readonly: true },
          { key: "createdAt", readonly: true },
          { key: "updatedAt", readonly: true },
        ],
      }),
    ],
    relatedTabs: [
      {
        tabKey: "components",
        label: "Components",
        order: 20,
        relationshipName: "salary_package_rule_components",
        relatedEntityLogicalName: "salaryPackageRuleComponent",
        targetFieldLogicalName: "salaryPackageRuleId",
        columns: [
          "payComponentName",
          "category",
          "calculationMethod",
          "fixedAmount",
          "percentage",
          "percentageBaseComponentName",
          "formulaExpression",
          "minimumAmount",
          "maximumAmount",
          "isRequired",
          "isEmployeeEditable",
          "effectiveFrom",
          "effectiveTo",
          "displayOrder",
          "status",
        ],
        columnLabels: {
          payComponentName: "Pay Component",
          category: "Category",
          calculationMethod: "Calculation Method",
          fixedAmount: "Fixed Amount",
          percentage: "Percentage",
          percentageBaseComponentName: "Base Component",
          formulaExpression: "Formula",
          minimumAmount: "Minimum",
          maximumAmount: "Maximum",
          isRequired: "Required",
          isEmployeeEditable: "Employee Editable",
          effectiveFrom: "Effective From",
          effectiveTo: "Effective To",
          displayOrder: "Display Order",
          status: "Status",
        },
        listPath: "/api/salary-package-rules/{parentId}/components",
        createPath: "/api/salary-package-rules/{parentId}/components",
        updatePath:
          "/api/salary-package-rules/{parentId}/components/{recordId}",
        deletePath:
          "/api/salary-package-rules/{parentId}/components/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "payComponentId",
            label: "Pay Component",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "calculationMethod",
            label: "Calculation Method",
            dataType: "optionset",
            required: true,
            options: choices("FIXED", "PERCENTAGE", "FORMULA"),
          },
          {
            fieldLogicalName: "fixedAmount",
            label: "Amount",
            dataType: "currency",
          },
          {
            fieldLogicalName: "percentage",
            label: "Percentage",
            dataType: "decimal",
          },
          {
            fieldLogicalName: "percentageBaseComponentId",
            label: "Base Component",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "formulaExpression",
            label: "Formula",
            dataType: "string",
          },
          {
            fieldLogicalName: "minimumAmount",
            label: "Minimum",
            dataType: "currency",
          },
          {
            fieldLogicalName: "maximumAmount",
            label: "Maximum",
            dataType: "currency",
          },
          {
            fieldLogicalName: "isRequired",
            label: "Mandatory",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "isEmployeeEditable",
            label: "Override Allowed",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "effectiveFrom",
            label: "Effective From",
            dataType: "date",
          },
          {
            fieldLogicalName: "effectiveTo",
            label: "Effective To",
            dataType: "date",
          },
          {
            fieldLogicalName: "displayOrder",
            label: "Sequence",
            dataType: "number",
          },
          {
            fieldLogicalName: "status",
            label: "Status",
            dataType: "optionset",
            options: statusOptions,
          },
        ],
        permissions: {
          create: "settings.update",
          update: "settings.update",
          delete: "settings.update",
        },
      },
      {
        tabKey: "assignments",
        label: "Assignments",
        order: 30,
        relationshipName: "salary_package_rule_assignments",
        relatedEntityLogicalName: "employeeCompensationHistory",
        targetFieldLogicalName: "salaryPackageRuleId",
        columns: [
          "employeeName",
          "currencyCode",
          "effectiveFrom",
          "status",
          "grossAmount",
          "updatedAt",
        ],
        columnLabels: {
          employeeName: "Employee",
          currencyCode: "Currency",
          effectiveFrom: "Effective From",
          status: "Status",
          grossAmount: "Gross Amount",
          updatedAt: "Modified On",
        },
        listPath: "/api/salary-package-rules/{parentId}/assignments",
      },
    ],
    columns: [
      "name",
      "code",
      "currencyCode",
      "description",
      "effectiveFrom",
      "effectiveTo",
      "priority",
      "isDefault",
      "status",
      "isActive",
    ],
    lookupSources: {
      currencyCode: "/api/configuration/currencies",
      organizationId: "/api/organizations?isActive=true",
      legalEntityId:
        "/api/organizations?isActive=true&organizationType=LEGAL_ENTITY",
      businessUnitId: "/api/business-units?isActive=true",
      departmentId: "/api/departments?isActive=true",
      employeeLevelId: "/api/employee-levels?isActive=true",
      employmentTypeId: "/api/employment-types?isActive=true",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
      payComponentId: "/api/pay-components?isActive=true",
      percentageBaseComponentId: "/api/pay-components?isActive=true",
    },
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: {
      name: "",
      code: "",
      currencyCode: "",
      payFrequency: "MONTHLY",
      priority: 0,
      isDefault: false,
      status: "ACTIVE",
      autoAssign: false,
      allowEmployeeOverride: false,
      overrideRequiresApproval: true,
      isActive: true,
    },
    softDelete: true,
    formatters: {
      effectiveFrom: "date",
      effectiveTo: "date",
      isActive: "boolean",
    },
  });
}

function settingsFieldType(type: string): StandardModuleFieldSpec["dataType"] {
  if (type === "date") return "date";
  if (type === "time") return "time";
  if (type === "textarea") return "multiline-string";
  if (type === "checkbox") return "boolean";
  if (type === "number") return "number";
  if (type === "lookup") return "lookup";
  if (type === "select" || type === "multiselect")
    return type === "select" ? "optionset" : "multi-optionset";
  if (type === "email" || type === "phone" || type === "url") return type;
  return "string";
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

const namedCatalogFields = [
  field("name", "Name", "string", { isPrimaryName: true }),
  field("code", "Code"),
  field("description", "Description", "multiline-string"),
  field("isActive", "Active", "boolean", { isStatus: true }),
] as const;

const weekdayOptions = choices(
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
);

const workWeekModelOptions = choices(
  "FIVE_DAY",
  "SIX_DAY",
  "SEVEN_DAY",
  "FLEXIBLE",
  "ROTATING",
);

const adapters: readonly SettingsRuntimeAdapter[] = [
  adapter({
    key: "field-security",
    label: "Field Security",
    singular: "Field Security Policy",
    serverApiPath: "/field-security-policies",
    clientApiPath: "/api/field-security-policies",
    routeBase: "/settings/security-access/security-governance/field-security",
    primaryId: "id",
    primaryName: "name",
    fields: [
      field("name", "Policy Name", "string", { isPrimaryName: true }),
      field("description", "Description", "multiline-string"),
      field("moduleKey", "Module", "string", { isReadOnly: true }),
      field("entityKey", "Protected Module", "lookup"),
      field("tableKey", "Table", "string", { isReadOnly: true }),
      field("fieldCount", "Field Count", "number", { isReadOnly: true }),
      field("appliesToRoles", "Applies To Roles", "number", {
        isReadOnly: true,
      }),
      field("appliesToAccessTeams", "Applies To Access Teams", "number", {
        isReadOnly: true,
      }),
      field("defaultBehavior", "Default Behavior", "optionset", {
        options: [
          { value: "ALLOW", label: "Allow" },
          { value: "HIDE", label: "Hide" },
          { value: "MASK", label: "Mask" },
          { value: "READ_ONLY", label: "Read Only" },
        ],
      }),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("fieldKey", "Field", "lookup", {
        dependsOnFieldId: "entityKey",
        dependencyFilterKey: "tableKey",
        resetOnParentChange: true,
      }),
      field("fieldLabel", "Field Display Name", "string", {
        isReadOnly: true,
      }),
      field("visibility", "Visibility", "optionset", {
        options: [
          { value: "VISIBLE", label: "Visible" },
          { value: "HIDDEN", label: "Hidden" },
          { value: "MASKED", label: "Masked" },
        ],
      }),
      field("accessMode", "Access Mode", "optionset", {
        options: [
          { value: "READ_ONLY", label: "Read Only" },
          { value: "EDITABLE", label: "Editable" },
        ],
      }),
      field("maskingPattern", "Masking Pattern", "optionset", {
        options: [
          { value: "FULL", label: "Full" },
          { value: "PARTIAL", label: "Partial" },
          { value: "LAST_4", label: "Last 4" },
          { value: "CUSTOM", label: "Custom" },
        ],
      }),
      field("customMask", "Custom Mask", "string"),
      field("roleId", "Role", "lookup"),
      field("roleName", "Role Name", "string", { isReadOnly: true }),
      field("roleDescription", "Role Description", "multiline-string", {
        isReadOnly: true,
      }),
      field("roleType", "Role Type", "string", { isReadOnly: true }),
      field("accessLevel", "Access Level", "string", { isReadOnly: true }),
      field("teamId", "Access Team", "lookup"),
      field("accessTeamName", "Access Team", "string", { isReadOnly: true }),
      field("membersCount", "Members Count", "number", { isReadOnly: true }),
      field("assignedOn", "Assigned On", "datetime", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "field-security-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", label: "Policy Name", required: true },
          "description",
          { key: "entityKey", label: "Protected Module", required: true },
          "defaultBehavior",
        ],
      }),
    ],
    columns: [
      "name",
      "moduleKey",
      "entityKey",
      "fieldCount",
      "appliesToRoles",
      "appliesToAccessTeams",
      "isActive",
      "updatedAt",
    ],
    lookupSources: {
      entityKey: "/api/field-security-policies/lookups/tables",
      fieldKey: "/api/field-security-policies/lookups/fields",
      roleId: "/api/roles",
      teamId: "/api/teams?teamType=ACCESS",
    },
    permissions: {
      read: "field-security.read",
      create: "field-security.manage",
      update: "field-security.manage",
      delete: "field-security.manage",
    },
    initialValues: {
      name: "",
      moduleKey: "",
      entityKey: "",
      defaultBehavior: "ALLOW",
      isActive: true,
    },
    transfer: { import: true, export: true, exportTemplate: true },
    relatedTabs: [
      {
        tabKey: "secured-fields",
        label: "Secured Fields",
        order: 20,
        relationshipName: "field_security_rules",
        relatedEntityLogicalName: "field_security_rules",
        targetFieldLogicalName: "policyId",
        columns: [
          "fieldLabel",
          "visibility",
          "accessMode",
          "maskingPattern",
          "customMask",
        ],
        listPath: "/api/field-security-policies/{parentId}/rules",
        createPath: "/api/field-security-policies/{parentId}/rules",
        updatePath: "/api/field-security-policies/{parentId}/rules/{recordId}",
        deletePath: "/api/field-security-policies/{parentId}/rules/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "fieldKey",
            label: "Field",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "visibility",
            label: "Visibility",
            dataType: "optionset",
          },
          {
            fieldLogicalName: "accessMode",
            label: "Access Mode",
            dataType: "optionset",
          },
          {
            fieldLogicalName: "maskingPattern",
            label: "Masking Pattern",
            dataType: "optionset",
          },
        ],
        permissions: {
          create: "field-security.manage",
          update: "field-security.manage",
          delete: "field-security.manage",
        },
      },
      {
        tabKey: "roles",
        label: "Roles",
        order: 30,
        relationshipName: "field_security_roles",
        relatedEntityLogicalName: "field_security_roles",
        targetFieldLogicalName: "policyId",
        columns: [
          "roleName",
          "roleDescription",
          "roleType",
          "accessLevel",
          "assignedOn",
        ],
        listPath: "/api/field-security-policies/{parentId}/roles",
        createPath: "/api/field-security-policies/{parentId}/roles",
        deletePath: "/api/field-security-policies/{parentId}/roles/{recordId}",
        assignment: {
          lookupFieldLogicalName: "roleId",
          optionsPath: "/api/roles",
          title: "Assign Roles",
          optionLabelField: "name",
          optionDescriptionField: "description",
          optionMetaFields: ["roleType", "accessLevel"],
          assignedValueField: "roleId",
        },
        permissions: {
          create: "field-security.manage",
          delete: "field-security.manage",
        },
      },
      {
        tabKey: "access-teams",
        label: "Access Teams",
        order: 40,
        relationshipName: "field_security_access_teams",
        relatedEntityLogicalName: "field_security_access_teams",
        targetFieldLogicalName: "policyId",
        columns: [
          "accessTeamName",
          "description",
          "membersCount",
          "assignedOn",
        ],
        listPath: "/api/field-security-policies/{parentId}/access-teams",
        createPath: "/api/field-security-policies/{parentId}/access-teams",
        deletePath:
          "/api/field-security-policies/{parentId}/access-teams/{recordId}",
        assignment: {
          lookupFieldLogicalName: "teamId",
          optionsPath: "/api/teams?teamType=ACCESS",
          title: "Assign Access Teams",
          optionLabelField: "accessTeamName",
          optionDescriptionField: "description",
          optionMetaFields: ["teamType", "membersCount", "rolesCount"],
          assignedValueField: "teamId",
        },
        permissions: {
          create: "field-security.manage",
          delete: "field-security.manage",
        },
      },
    ],
  }),
  recordAdapter(
    "password-login-policies",
    "Password & Login Policies",
    "security",
    passwordLoginSettingsSections,
  ),
  salaryPackageRulesAdapter(),
  genericConfigurationAdapter("delegation-rules", "Delegation Rules"),
  genericConfigurationAdapter("escalation-rules", "Escalation Rules"),
  genericConfigurationAdapter("retention-rules", "Retention Rules"),
  genericConfigurationAdapter(
    "document-templates",
    "Payroll Document Templates",
  ),
  recordAdapter(
    "tenant",
    "Tenant Profile",
    "organization",
    organizationSettingsSections,
  ),
  adapter({
    key: "countries",
    label: "Countries",
    singular: "Country",
    serverApiPath: "/lookups/countries",
    clientApiPath: "/api/lookups/countries",
    mode: "read-only",
    primaryId: "id",
    fields: [
      field("name", "Country", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("code", "ISO Code", "string", { isReadOnly: true }),
      field("isActive", "Active", "boolean", {
        isReadOnly: true,
        isStatus: true,
      }),
      field("sortOrder", "Sort Order", "number", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "country-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", readonly: true },
          { key: "code", readonly: true },
          { key: "isActive", readonly: true },
          { key: "sortOrder", readonly: true },
        ],
      }),
    ],
    columns: ["name", "code", "isActive", "sortOrder"],
    permissions: { read: "settings.read" },
    transfer: { export: true, exportTemplate: true },
    widgets: [
      {
        id: "country-usage",
        label: "Usage",
        widgetType: "regional_usage",
        tabKey: "usage",
        columnSpan: 3,
        dataSource: {
          apiPath: "/api/lookups/countries/{recordId}/usage",
        },
      },
    ],
  }),
  adapter({
    key: "states",
    label: "States / Provinces",
    singular: "State / Province",
    serverApiPath: "/lookups/states",
    clientApiPath: "/api/lookups/states",
    primaryId: "id",
    fields: [
      field("name", "State / Province", "string", { isPrimaryName: true }),
      field("code", "Code", "string"),
      field("countryId", "Country", "lookup"),
      field("countryName", "Country", "string", { isReadOnly: true }),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("sortOrder", "Sort Order", "number"),
    ],
    formSections: [
      formSection({
        id: "state-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          { key: "countryId", required: true },
          "isActive",
          "sortOrder",
        ],
      }),
    ],
    columns: ["name", "code", "countryName", "isActive", "sortOrder"],
    lookupSources: {
      countryId: "/api/lookups/countries",
    },
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: {
      name: "",
      code: "",
      countryId: "",
      isActive: true,
      sortOrder: 0,
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    widgets: [
      {
        id: "state-usage",
        label: "Usage",
        widgetType: "regional_usage",
        tabKey: "usage",
        columnSpan: 3,
        dataSource: {
          apiPath: "/api/lookups/states/{recordId}/usage",
        },
      },
    ],
    relatedTabs: [
      {
        tabKey: "cities",
        label: "Cities",
        order: 40,
        relationshipName: "state_cities",
        relatedEntityLogicalName: "settings_cities",
        targetFieldLogicalName: "stateProvinceId",
        columns: ["name", "countryName", "stateProvinceName", "isActive"],
        listPath: "/api/lookups/cities?stateProvinceId={parentId}",
        createPath: "/api/lookups/cities",
        updatePath: "/api/lookups/cities/{recordId}",
        deletePath: "/api/lookups/cities/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "name",
            label: "City",
            dataType: "string",
            required: true,
          },
          {
            fieldLogicalName: "isActive",
            label: "Active",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "sortOrder",
            label: "Sort Order",
            dataType: "number",
          },
        ],
        permissions: {
          create: "settings.update",
          update: "settings.update",
          delete: "settings.update",
        },
      },
    ],
  }),
  adapter({
    key: "cities",
    label: "Cities",
    singular: "City",
    serverApiPath: "/lookups/cities",
    clientApiPath: "/api/lookups/cities",
    primaryId: "id",
    fields: [
      field("name", "City", "string", { isPrimaryName: true }),
      field("countryId", "Country", "lookup"),
      field("countryName", "Country", "string", { isReadOnly: true }),
      field("stateProvinceId", "State / Province", "lookup", {
        dependsOnFieldId: "countryId",
        dependencyFilterKey: "countryId",
        resetOnParentChange: true,
      }),
      field("stateProvinceName", "State / Province", "string", {
        isReadOnly: true,
      }),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("sortOrder", "Sort Order", "number"),
    ],
    formSections: [
      formSection({
        id: "city-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "countryId", required: true },
          "stateProvinceId",
          "isActive",
          "sortOrder",
        ],
      }),
    ],
    columns: [
      "name",
      "countryName",
      "stateProvinceName",
      "isActive",
      "sortOrder",
    ],
    lookupSources: {
      countryId: "/api/lookups/countries",
      stateProvinceId: "/api/lookups/states",
    },
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: {
      name: "",
      countryId: "",
      stateProvinceId: "",
      isActive: true,
      sortOrder: 0,
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    widgets: [
      {
        id: "city-usage",
        label: "Usage",
        widgetType: "regional_usage",
        tabKey: "usage",
        columnSpan: 3,
        dataSource: {
          apiPath: "/api/lookups/cities/{recordId}/usage",
        },
      },
    ],
  }),
  adapter({
    key: "timezones",
    label: "Timezones",
    singular: "Timezone",
    serverApiPath: "/configuration/timezones",
    clientApiPath: "/api/configuration/timezones",
    collectionKey: "items",
    mode: "read-only",
    primaryId: "value",
    primaryName: "label",
    fields: [
      field("label", "Timezone", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("value", "Identifier", "string", { isReadOnly: true }),
      field("offset", "UTC Offset", "string", { isReadOnly: true }),
    ],
    permissions: { read: "settings.read" },
    transfer: { export: true, exportTemplate: true },
  }),
  adapter({
    key: "currencies",
    label: "Currencies",
    singular: "Currency",
    serverApiPath: "/configuration/currencies",
    clientApiPath: "/api/configuration/currencies",
    collectionKey: "items",
    primaryId: "id",
    primaryName: "name",
    ownerField: "ownerUserId",
    statusField: "status",
    subStatusField: "subStatus",
    fields: [
      field("name", "Currency Name", "string", {
        isPrimaryName: true,
      }),
      field("code", "ISO Code", "string"),
      field("symbol", "Symbol", "string"),
      field("decimalPlaces", "Decimal Places", "number"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: currencyStatusOptions,
      }),
      field("subStatus", "Sub Status", "optionset", {
        isSubStatus: true,
        options: currencyStatusSubStatusOptions,
      }),
      field("ownerUserId", "Record Owner", "lookup", { isOwner: true }),
      field("description", "Description", "multiline-string"),
    ],
    formSections: [
      formSection({
        id: "currency-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          "symbol",
          "decimalPlaces",
          "status",
          "subStatus",
          "ownerUserId",
          "description",
        ],
      }),
    ],
    lookupSources: {
      ownerUserId: "/api/users",
    },
    columns: [
      "name",
      "code",
      "symbol",
      "decimalPlaces",
      "status",
      "subStatus",
      "ownerUserId",
    ],
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: {
      name: "",
      code: "",
      symbol: "",
      decimalPlaces: 2,
      status: "ACTIVE",
      subStatus: "AVAILABLE",
      description: "",
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    widgets: [
      {
        id: "currency-exchange-rate",
        label: "Exchange Rate",
        widgetType: "currency_exchange_rate",
        tabKey: "exchange-rate",
        columnSpan: 3,
        dataSource: {
          apiPath: "/api/configuration/currencies/{recordId}/rate-summary",
        },
      },
      {
        id: "currency-manual-override",
        label: "Manual Override",
        widgetType: "currency_manual_override",
        tabKey: "manual-override",
        columnSpan: 3,
        dataSource: {
          apiPath: "/api/configuration/currencies/{recordId}/manual-override",
        },
      },
      {
        id: "currency-usage",
        label: "Usage",
        widgetType: "currency_usage",
        tabKey: "usage",
        columnSpan: 3,
        dataSource: {
          apiPath: "/api/configuration/currencies/{recordId}/usage",
        },
      },
    ],
  }),
  adapter({
    key: "organizations",
    label: "Organizations",
    serverApiPath: "/organizations",
    ownerField: "ownerUserId",
    statusField: "status",
    subStatusField: "subStatus",
    fields: [
      field("code", "Integration Identifier", "string", { isReadOnly: true }),
      field("name", "Organization Name", "string", {
        isPrimaryName: true,
      }),
      field("organizationType", "Organization Type", "optionset", {
        options: organizationTypeOptions,
      }),
      field("parentOrganizationId", "Parent Organization", "lookup"),
      field("headEmployeeId", "Organization Head", "lookup"),
      field("ownerUserId", "Record Owner", "lookup", { isOwner: true }),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: activeStatusOptions,
      }),
      field("subStatus", "Sub Status", "optionset", {
        isSubStatus: true,
        options: structureSubStatusOptions,
      }),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isReadOnly: true }),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "organization-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", label: "Organization Name", required: true },
          "organizationType",
          "parentOrganizationId",
          "headEmployeeId",
          "ownerUserId",
          "status",
          "subStatus",
          "description",
        ],
      }),
    ],
    lookupSources: {
      parentOrganizationId: "/api/organizations",
      headEmployeeId: "/api/employees",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
    },
    columns: [
      "name",
      "organizationType",
      "parentOrganizationId",
      "headEmployeeId",
      "status",
      "subStatus",
      "ownerUserId",
    ],
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: {
      name: "",
      organizationType: "OPERATING",
      parentOrganizationId: null,
      status: "ACTIVE",
      subStatus: "OPERATIONAL",
      description: "",
    },
    softDelete: true,
    formatters: {
      createdAt: "datetime",
      updatedAt: "datetime",
    },
    widgets: [
      {
        id: "organization-hierarchy-tree",
        label: "Organization Hierarchy",
        widgetType: "organization_hierarchy",
        columnSpan: 3,
      },
    ],
    widgetTabLabel: "Hierarchy",
    relatedTabs: [
      {
        tabKey: "business-units",
        label: "Business Units",
        order: 40,
        relationshipName: "organization_business_units",
        relatedEntityLogicalName: "settings_business_units",
        targetFieldLogicalName: "organizationId",
        columns: ["name", "parentBusinessUnitId", "headEmployeeId", "status"],
        listPath: "/api/business-units?organizationId={parentId}",
        createPath: "/api/business-units",
        updatePath: "/api/business-units/{recordId}",
        deletePath: "/api/business-units/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "name",
            label: "Business Unit Name",
            dataType: "string",
            required: true,
          },
          {
            fieldLogicalName: "parentBusinessUnitId",
            label: "Parent Business Unit",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "description",
            label: "Description",
            dataType: "multiline-string",
          },
        ],
        permissions: {
          create: "settings.update",
          update: "settings.update",
          delete: "settings.update",
        },
      },
    ],
  }),
  adapter({
    key: "business-units",
    label: "Business Units",
    serverApiPath: "/business-units",
    ownerField: "ownerUserId",
    statusField: "status",
    subStatusField: "subStatus",
    fields: [
      field("code", "Integration Identifier", "string", { isReadOnly: true }),
      field("name", "Business Unit Name", "string", { isPrimaryName: true }),
      field("organizationId", "Organization", "lookup"),
      field("parentBusinessUnitId", "Parent Business Unit", "lookup"),
      field("headEmployeeId", "Business Unit Head", "lookup"),
      field("ownerUserId", "Record Owner", "lookup", { isOwner: true }),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: activeStatusOptions,
      }),
      field("subStatus", "Sub Status", "optionset", {
        isSubStatus: true,
        options: structureSubStatusOptions,
      }),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isReadOnly: true }),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "business-unit-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", label: "Business Unit Name", required: true },
          { key: "organizationId", label: "Organization", required: true },
          "parentBusinessUnitId",
          "headEmployeeId",
          "ownerUserId",
          "status",
          "subStatus",
          "description",
        ],
      }),
    ],
    lookupSources: {
      organizationId: "/api/organizations",
      parentBusinessUnitId: "/api/business-units",
      headEmployeeId: "/api/employees",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
    },
    columns: [
      "name",
      "organizationId",
      "parentBusinessUnitId",
      "headEmployeeId",
      "status",
      "subStatus",
      "ownerUserId",
    ],
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: {
      name: "",
      organizationId: "",
      parentBusinessUnitId: null,
      status: "ACTIVE",
      subStatus: "OPERATIONAL",
      description: "",
    },
    softDelete: true,
    widgets: [
      {
        id: "business-unit-hierarchy-tree",
        label: "Business Unit Hierarchy",
        widgetType: "organization_hierarchy",
        columnSpan: 3,
      },
    ],
    widgetTabLabel: "Hierarchy",
    relatedTabs: [
      {
        tabKey: "departments",
        label: "Departments",
        order: 40,
        relationshipName: "business_unit_departments",
        relatedEntityLogicalName: "settings_departments",
        targetFieldLogicalName: "businessUnitId",
        columns: ["name", "headEmployeeId", "status", "subStatus"],
        listPath: "/api/departments?businessUnitId={parentId}",
        createPath: "/api/departments",
        updatePath: "/api/departments/{recordId}",
        deletePath: "/api/departments/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "name",
            label: "Department Name",
            dataType: "string",
            required: true,
          },
          {
            fieldLogicalName: "headEmployeeId",
            label: "Department Head",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "description",
            label: "Description",
            dataType: "multiline-string",
          },
        ],
        permissions: {
          create: "departments.create",
          update: "departments.update",
          delete: "departments.update",
        },
      },
    ],
  }),
  adapter({
    key: "departments",
    label: "Departments",
    serverApiPath: "/departments",
    ownerField: "ownerUserId",
    statusField: "status",
    subStatusField: "subStatus",
    fields: [
      field("code", "Integration Identifier", "string", { isReadOnly: true }),
      field("name", "Department Name", "string", { isPrimaryName: true }),
      field("businessUnitId", "Business Unit", "lookup"),
      field("headEmployeeId", "Department Head", "lookup"),
      field("ownerUserId", "Record Owner", "lookup", { isOwner: true }),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: activeStatusOptions,
      }),
      field("subStatus", "Sub Status", "optionset", {
        isSubStatus: true,
        options: structureSubStatusOptions,
      }),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isReadOnly: true }),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "department-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", label: "Department Name", required: true },
          { key: "businessUnitId", label: "Business Unit", required: true },
          "headEmployeeId",
          "ownerUserId",
          "status",
          "subStatus",
          "description",
        ],
      }),
    ],
    lookupSources: {
      businessUnitId: "/api/business-units",
      headEmployeeId: "/api/employees",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
    },
    columns: [
      "name",
      "businessUnitId",
      "headEmployeeId",
      "status",
      "subStatus",
      "ownerUserId",
    ],
    permissions: {
      read: "departments.read",
      create: "departments.create",
      update: "departments.update",
      delete: "departments.update",
    },
    initialValues: {
      name: "",
      description: "",
      status: "ACTIVE",
      subStatus: "OPERATIONAL",
      businessUnitId: "",
    },
    softDelete: true,
    relatedTabs: [
      {
        tabKey: "teams",
        label: "Teams",
        order: 40,
        relationshipName: "department_teams",
        relatedEntityLogicalName: "settings_teams",
        targetFieldLogicalName: "departmentId",
        columns: ["name", "teamType", "ownerUserId", "isActive"],
        listPath: "/api/teams?departmentId={parentId}",
        createPath: "/api/teams",
        updatePath: "/api/teams/{recordId}",
        deletePath: "/api/teams/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "name",
            label: "Team Name",
            dataType: "string",
            required: true,
          },
          {
            fieldLogicalName: "teamType",
            label: "Team Type",
            dataType: "string",
          },
        ],
        permissions: {
          create: "teams.create",
          update: "teams.update",
          delete: "teams.delete",
        },
      },
    ],
  }),
  adapter({
    key: "designations",
    label: "Designations",
    serverApiPath: "/designations",
    fields: [
      field("name", "Designation Name", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("employeeLevelId", "Employee Level", "lookup"),
      field("employeesCount", "Employees Count", "number", {
        isReadOnly: true,
      }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "designation-summary",
        label: "Summary",
        order: 10,
        fields: [
          { key: "name", label: "Designation Name", required: true },
          { key: "employeeLevelId", label: "Employee Level" },
          "description",
        ],
      }),
    ],
    columns: [
      "name",
      "employeeLevelId",
      "employeesCount",
      "description",
      "updatedAt",
    ],
    lookupSources: { employeeLevelId: "/api/employee-levels" },
    permissions: {
      read: "designations.read",
      create: "designations.create",
      update: "designations.update",
      delete: "designations.update",
    },
    initialValues: {
      name: "",
      code: "",
      description: "",
      isActive: true,
      employeeLevelId: null,
    },
    transfer: { import: true, export: true, exportTemplate: true },
    relatedTabs: [
      {
        tabKey: "employees",
        label: "Employees",
        order: 20,
        relationshipName: "designation_employees",
        relatedEntityLogicalName: "employees",
        targetFieldLogicalName: "designationId",
        columns: [
          "employeeCode",
          "fullName",
          "departmentId",
          "businessUnitId",
          "employmentStatus",
        ],
        listPath: "/api/employees?designationId={parentId}",
      },
    ],
  }),
  adapter({
    key: "employee-levels",
    label: "Employee Levels",
    serverApiPath: "/employee-levels",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("rank", "Rank", "number"),
      field("parentEmployeeLevelId", "Parent Level", "lookup"),
      field("nextEmployeeLevelId", "Next Level", "lookup"),
      field("employeesCount", "Employees Count", "number", {
        isReadOnly: true,
      }),
      field("designationsCount", "Designations Count", "number", {
        isReadOnly: true,
      }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "employee-level-summary",
        label: "Summary",
        order: 10,
        fields: [
          { key: "name", required: true },
          { key: "rank", required: true },
          "parentEmployeeLevelId",
          "nextEmployeeLevelId",
          "description",
        ],
      }),
    ],
    columns: [
      "name",
      "rank",
      "parentEmployeeLevelId",
      "nextEmployeeLevelId",
      "employeesCount",
      "designationsCount",
      "updatedAt",
    ],
    lookupSources: {
      parentEmployeeLevelId: "/api/employee-levels",
      nextEmployeeLevelId: "/api/employee-levels",
    },
    permissions: {
      read: "employee-levels.read",
      create: "employee-levels.manage",
      update: "employee-levels.manage",
      delete: "employee-levels.manage",
    },
    initialValues: { name: "", code: "", rank: 0, isActive: true },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    relatedTabs: [
      {
        tabKey: "designations",
        label: "Designations",
        order: 20,
        relationshipName: "employee_level_designations",
        relatedEntityLogicalName: "designations",
        targetFieldLogicalName: "employeeLevelId",
        columns: ["name", "employeesCount"],
        listPath: "/api/designations?employeeLevelId={parentId}",
      },
      {
        tabKey: "employees",
        label: "Employees",
        order: 30,
        relationshipName: "employee_level_employees",
        relatedEntityLogicalName: "employees",
        targetFieldLogicalName: "employeeLevelId",
        columns: [
          "employeeCode",
          "fullName",
          "designationId",
          "departmentId",
          "employmentStatus",
        ],
        listPath: "/api/employees?employeeLevelId={parentId}",
      },
    ],
  }),
  adapter({
    key: "employment-types",
    label: "Employment Types",
    singular: "Employment Type",
    serverApiPath: "/employment-types",
    primaryId: "id",
    primaryName: "name",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("payrollEligible", "Payroll Eligible", "boolean"),
      field("leaveEligible", "Leave Eligible", "boolean"),
      field("overtimeEligible", "Overtime Eligible", "boolean"),
      field("benefitsEligible", "Benefits Eligible", "boolean"),
      field("defaultProbationDays", "Default Probation Days", "number"),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("employeesCount", "Employees Count", "number", {
        isReadOnly: true,
      }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "employment-type-summary",
        label: "Summary",
        order: 10,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          "description",
          "payrollEligible",
          "leaveEligible",
          "overtimeEligible",
          "benefitsEligible",
          "defaultProbationDays",
        ],
      }),
    ],
    columns: [
      "name",
      "code",
      "payrollEligible",
      "leaveEligible",
      "overtimeEligible",
      "benefitsEligible",
      "defaultProbationDays",
      "updatedAt",
    ],
    permissions: {
      read: "employment-types.read",
      create: "employment-types.manage",
      update: "employment-types.manage",
      delete: "employment-types.manage",
    },
    initialValues: {
      name: "",
      code: "",
      description: "",
      payrollEligible: true,
      leaveEligible: true,
      overtimeEligible: false,
      benefitsEligible: true,
      defaultProbationDays: 0,
      isActive: true,
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    relatedTabs: [
      {
        tabKey: "employees",
        label: "Employees",
        order: 20,
        relationshipName: "employment_type_employees",
        relatedEntityLogicalName: "employees",
        targetFieldLogicalName: "employmentTypeId",
        columns: [
          "employeeCode",
          "fullName",
          "departmentId",
          "designationId",
          "employmentStatus",
        ],
        listPath: "/api/employees?employmentTypeId={parentId}",
      },
    ],
  }),
  adapter({
    key: "locations",
    label: "Work Sites",
    singular: "Work Site",
    serverApiPath: "/locations",
    fields: [
      ...namedCatalogFields,
      field("addressLine1", "Address", "multiline-string"),
      field("addressLine2", "Address line 2"),
      field("city", "City"),
      field("state", "Region"),
      field("country", "Country", "lookup"),
      field("zipCode", "Postal code"),
      field("timezone", "Timezone", "lookup"),
      field("latitude", "Latitude", "decimal"),
      field("longitude", "Longitude", "decimal"),
      field("allowedRadiusMeters", "Geofence Radius (m)", "number"),
      /*
       * `defaultWorkScheduleId` and `holidayCalendarId` are deliberately absent.
       * The columns still exist so tenant data is preserved, but a Work Site is
       * a physical place and does not decide who works when: schedule and
       * calendar resolve down the organizational hierarchy (Employee -> Team ->
       * Department -> Business Unit -> Organization -> Tenant). Listing them
       * here would put an authority on this page that the engine no longer
       * honours.
       */
      /*
       * Attendance configuration for this work site.
       *
       * These columns are nullable on purpose: empty means "use the tenant
       * setting". They are rendered by the purpose-built Attendance Policy
       * section rather than as generic fields, which is what lets the page show
       * an explicit "Use tenant setting" choice alongside the value the tenant
       * currently resolves to. The specs stay here so validation, views,
       * import/export and the API payload continue to know these columns.
       */
      field(
        "maximumAccuracyMeters",
        "Location Accuracy Requirement (m)",
        "number",
      ),
      field("attendanceEnabled", "Attendance Enabled", "boolean"),
      field(
        "allowedAttendanceMethods",
        "Allowed Attendance Methods",
        "multi-optionset",
        {
          options: choices("DEVICE", "WEB", "MOBILE", "MANUAL"),
        },
      ),
      field("webAttendancePolicy", "Web Attendance", "optionset", {
        options: choices("ALLOWED", "DISALLOWED", "FALLBACK_ONLY"),
      }),
      field("devicePolicy", "Office Device Requirement", "optionset", {
        options: choices(
          "DEVICE_REQUIRED",
          "DEVICE_PREFERRED",
          "DEVICE_OPTIONAL",
        ),
      }),
      field("webFallbackEnabled", "Web Fallback", "boolean"),
      field("validFrom", "Valid From", "date"),
      field("validTo", "Valid To", "date"),
    ],
    formSections: workSiteFormSections(),
    /*
     * Pinned rather than derived. The default takes the first six fields, which
     * now begin with two address lines — a list of work sites is more useful
     * keyed on where and when than on street detail.
     */
    columns: ["name", "code", "city", "country", "timezone", "isActive"],
    lookupSources: {
      country: "/api/lookups/countries",
      timezone: "/api/configuration/timezones",
    },
    permissions: {
      read: "locations.read",
      create: "locations.create",
      update: "locations.update",
      delete: "locations.update",
    },
    initialValues: {
      name: "",
      code: "",
      city: "",
      state: "",
      country: "",
      isActive: true,
    },
    softDelete: true,
  }),
  adapter({
    key: "work-calendars",
    label: "Work Calendars",
    singular: "Work Calendar",
    serverApiPath: "/holiday-calendars",
    fields: [
      ...namedCatalogFields,
      field("countryCode", "Country", "lookup"),
      field("regionCode", "Region / State", "lookup", {
        dependsOnFieldId: "countryCode",
        dependencyFilterKey: "countryId",
        resetOnParentChange: true,
      }),
      field("timezone", "Timezone", "lookup"),
      field("weekendDays", "Weekend Days", "multi-optionset", {
        options: choices(
          "SUNDAY",
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ),
      }),
      field("organizationId", "Organization", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("projectId", "Project / Team", "lookup"),
      field("isDefault", "Default", "boolean"),
      field("effectiveStartDate", "Effective From", "date"),
      field("effectiveEndDate", "Effective To", "date"),
    ],
    formSections: [
      formSection({
        id: "work-calendar-identity",
        label: "Calendar Identity",
        order: 10,
        column: 1,
        fields: [
          { key: "name", required: true },
          "code",
          "description",
          "isActive",
          "isDefault",
        ],
      }),
      formSection({
        id: "work-calendar-region",
        label: "Regional Working Rules",
        order: 20,
        column: 2,
        fields: ["countryCode", "regionCode", "timezone", "weekendDays"],
      }),
      formSection({
        id: "work-calendar-scope",
        label: "Scope",
        order: 25,
        column: 1,
        fields: ["organizationId", "businessUnitId", "projectId"],
      }),
      formSection({
        id: "work-calendar-effective-dates",
        label: "Effective Dates",
        order: 30,
        column: 2,
        fields: ["effectiveStartDate", "effectiveEndDate"],
      }),
    ],
    lookupSources: {
      countryCode: "/api/lookups/countries",
      regionCode: "/api/lookups/states",
      timezone: "/api/configuration/timezones",
      organizationId: "/api/organizations",
      businessUnitId: "/api/business-units",
      projectId: "/api/projects",
    },
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
    },
    initialValues: { name: "", code: "", isActive: true, isDefault: false },
    formatters: {
      effectiveStartDate: "date",
      effectiveEndDate: "date",
      isActive: "boolean",
    },
  }),
  adapter({
    key: "holiday-calendars",
    label: "Holidays",
    singular: "Holiday",
    serverApiPath: "/holiday-calendars",
    mode: "specialized",
    specializedHref: "/settings/people/work-management/holiday-calendars",
    fields: [
      field("name", "Holiday", "string", { isPrimaryName: true }),
      field("date", "Date", "date"),
      field("description", "Description", "multiline-string"),
      field("isOptional", "Optional", "boolean"),
    ],
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: { name: "", date: "", description: "", isOptional: false },
    softDelete: true,
    formatters: { date: "date", isOptional: "boolean" },
  }),
  adapter({
    key: "shifts",
    label: "Shifts",
    serverApiPath: "/shift-templates",
    fields: [
      ...namedCatalogFields,
      field("workScheduleId", "Work Schedule", "lookup"),
      field("startTime", "Start Time", "time"),
      field("endTime", "End Time", "time"),
      field("breakMinutes", "Break Minutes", "number"),
      field("expectedHours", "Expected Hours", "decimal"),
      field("lateGraceMinutes", "Late Grace", "number"),
      field("earlyExitGraceMinutes", "Early Exit Grace", "number"),
      field("timezone", "Timezone", "lookup"),
      field("isNightShift", "Night Shift", "boolean"),
    ],
    formSections: [
      formSection({
        id: "shift-identity",
        label: "Shift Identity",
        order: 10,
        column: 1,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          "description",
          "isActive",
          "workScheduleId",
        ],
      }),
      formSection({
        id: "shift-hours",
        label: "Working Hours",
        order: 20,
        column: 2,
        fields: [
          { key: "startTime", required: true },
          { key: "endTime", required: true },
          "breakMinutes",
          "expectedHours",
          "timezone",
          "isNightShift",
        ],
      }),
      formSection({
        id: "shift-attendance-rules",
        label: "Attendance Grace",
        order: 30,
        column: 2,
        fields: ["lateGraceMinutes", "earlyExitGraceMinutes"],
      }),
    ],
    lookupSources: {
      timezone: "/api/configuration/timezones",
      workScheduleId: "/api/work-schedules",
    },
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
    },
    initialValues: {
      name: "",
      code: "",
      startTime: "09:00",
      endTime: "17:00",
      isActive: true,
      isNightShift: false,
    },
  }),
  adapter({
    key: "leave-types",
    label: "Leave Types",
    serverApiPath: "/leave-types",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("category", "Leave Category", "optionset", {
        options: choices(
          "PAID",
          "UNPAID",
          "STATUTORY",
          "SPECIAL",
          "COMPENSATORY",
          "OTHER",
        ),
      }),
      field("description", "Description", "multiline-string"),
      field("isPaid", "Paid Leave", "boolean"),
      field("affectsPayroll", "Affects Payroll", "boolean"),
      field("consumesBalance", "Consumes Leave Balance", "boolean"),
      field("employeeRequestAllowed", "Employee Request Allowed", "boolean"),
      field("requiresAttachment", "Requires Attachment", "boolean"),
      field("allowHalfDay", "Allow Half Day", "boolean"),
      field("allowHourlyLeave", "Allow Hourly Leave", "boolean"),
      field("requiresApproval", "Requires Approval", "boolean", {
        isReadOnly: true,
      }),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "leave-type-details",
        label: "Leave Type Details",
        order: 10,
        fields: [
          { key: "name", required: true },
          { key: "category", label: "Leave Category", required: true },
          "description",
        ],
      }),
      formSection({
        id: "leave-type-behavior",
        label: "Behavior",
        order: 20,
        fields: [
          "isPaid",
          "affectsPayroll",
          "consumesBalance",
          "employeeRequestAllowed",
          "requiresAttachment",
          "allowHalfDay",
          "allowHourlyLeave",
        ],
      }),
    ],
    columns: [
      "name",
      "category",
      "isPaid",
      "affectsPayroll",
      "consumesBalance",
      "employeeRequestAllowed",
      "requiresAttachment",
      "updatedAt",
    ],
    permissions: {
      read: "leave-types.read",
      create: "leave-types.create",
      update: "leave-types.update",
      delete: "leave-types.update",
    },
    initialValues: {
      name: "",
      code: "",
      category: "PAID",
      isPaid: true,
      affectsPayroll: false,
      consumesBalance: true,
      employeeRequestAllowed: true,
      requiresAttachment: false,
      allowHalfDay: true,
      allowHourlyLeave: false,
      requiresApproval: false,
      isActive: true,
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    relatedTabs: [
      {
        tabKey: "policies",
        label: "Policies",
        order: 20,
        relationshipName: "leave_type_policy_rules",
        relatedEntityLogicalName: "leave_policy_rules",
        targetFieldLogicalName: "leaveTypeId",
        columns: [
          "leavePolicyId",
          "entitlementDays",
          "accrualType",
          "carryForwardAllowed",
          "isActive",
        ],
        listPath: "/api/leave-types/{parentId}/policy-rules",
      },
      {
        tabKey: "usage",
        label: "Usage",
        order: 30,
        relationshipName: "leave_type_usage",
        relatedEntityLogicalName: "leave_type_usage",
        targetFieldLogicalName: "leaveTypeId",
        columns: ["source", "count"],
        listPath: "/api/leave-types/{parentId}/usage",
      },
    ],
  }),
  adapter({
    key: "leave-policies",
    label: "Leave Policies",
    createCommandLabel: "Add Leave Policy",
    serverApiPath: "/leave-policies",
    fields: [
      field("name", "Policy Name", "string", { isPrimaryName: true }),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("assignedEmployeesCount", "Assigned Employees Count", "number", {
        isReadOnly: true,
      }),
      field("rulesCount", "Rules Count", "number", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("leaveTypeId", "Leave Type", "lookup"),
      field("entitlementDays", "Annual Entitlement Days", "number"),
      field("minimumServiceDays", "Minimum Service Days", "number"),
      field("prorateOnJoining", "Prorate On Joining", "boolean"),
      field("prorateOnExit", "Prorate On Exit", "boolean"),
      field("negativeBalanceAllowed", "Allow Negative Balance", "boolean"),
      field("maximumNegativeBalance", "Maximum Negative Balance", "number"),
      field("accrualType", "Accrual Type", "optionset", {
        options: choices(
          "FIXED_ANNUAL",
          "MONTHLY_ACCRUAL",
          "PER_PAY_PERIOD",
          "PER_WORKED_HOUR",
          "NONE",
        ),
      }),
      field("accrualFrequency", "Accrual Frequency", "optionset", {
        options: choices("MONTHLY", "QUARTERLY", "ANNUALLY", "PAY_PERIOD"),
      }),
      field("accrualDay", "Accrual Day", "number"),
      field("accrualAmount", "Accrual Amount", "number"),
      field("accrueDuringProbation", "Accrue During Probation", "boolean"),
      field("creditOnJoining", "Credit On Joining", "boolean"),
      field("carryForwardAllowed", "Allow Carry Forward", "boolean"),
      field("carryForwardLimit", "Maximum Carry Forward Days", "number"),
      field(
        "carryForwardExpiryMonths",
        "Carry Forward Expiry Months",
        "number",
      ),
      field("encashUnusedBalance", "Encash Unused Balance", "boolean"),
      field("maximumEncashmentDays", "Maximum Encashment Days", "number"),
      field("scopeType", "Scope Type", "optionset", {
        options: choices(
          "TENANT",
          "ORGANIZATION",
          "BUSINESS_UNIT",
          "DEPARTMENT",
          "EMPLOYEE_LEVEL",
          "EMPLOYEE",
        ),
      }),
      field("organizationId", "Organization", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("departmentId", "Department", "lookup"),
      field("employeeLevelId", "Employee Level", "lookup"),
      field("employeeId", "Employee", "lookup"),
      field("effectiveFrom", "Assigned On", "date"),
      field("minimumNoticeDays", "Minimum Notice Days", "number"),
      field("maxConsecutiveDays", "Maximum Consecutive Days", "number"),
      field("minimumConsecutiveDays", "Minimum Consecutive Days", "number"),
      field("allowDuringProbation", "Allow During Probation", "boolean"),
      field("allowBackdatedRequests", "Allow Backdated Requests", "boolean"),
      field("maxBackdatedDays", "Max Backdated Days", "number"),
      field("allowFutureRequests", "Allow Future Requests", "boolean"),
      field("maxFutureDays", "Max Future Days", "number"),
      field(
        "requiresDocumentAfterDays",
        "Require Attachment After Days",
        "number",
      ),
      field("approvalRequired", "Approval Required", "boolean"),
      field("approvalMatrixId", "Approval Matrix", "lookup"),
      field("autoApproveUnderDays", "Auto Approve Under Days", "number"),
      field("requireHrApproval", "Require HR Approval", "boolean"),
      field("requirePayrollApproval", "Require Payroll Approval", "boolean"),
    ],
    formSections: [
      formSection({
        id: "leave-policy-summary",
        label: "Policy Details",
        order: 10,
        fields: [
          { key: "name", label: "Policy Name", required: true },
          "description",
        ],
      }),
    ],
    columns: [
      "name",
      "isActive",
      "assignedEmployeesCount",
      "rulesCount",
      "updatedAt",
    ],
    lookupSources: {
      leaveTypeId: "/api/leave-types",
      organizationId: "/api/organizations",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      employeeLevelId: "/api/employee-levels",
      employeeId: "/api/employees",
      approvalMatrixId: "/api/approval-matrices",
    },
    permissions: {
      read: "leave-policies.read",
      create: "leave-policies.create",
      update: "leave-policies.update",
      delete: "leave-policies.update",
    },
    initialValues: { name: "", description: "", isActive: true },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    relatedTabs: [
      {
        tabKey: "entitlements",
        label: "Entitlements",
        order: 20,
        relationshipName: "leave_policy_rules",
        relatedEntityLogicalName: "leave_policy_rules",
        targetFieldLogicalName: "leavePolicyId",
        columns: [
          "leaveTypeId",
          "entitlementDays",
          "minimumServiceDays",
          "prorateOnJoining",
          "prorateOnExit",
          "negativeBalanceAllowed",
          "maximumNegativeBalance",
        ],
        listPath: "/api/leave-policies/{parentId}/rules",
        createPath: "/api/leave-policies/{parentId}/rules",
        updatePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        deletePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "leaveTypeId",
            label: "Leave Type",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "entitlementDays",
            label: "Annual Entitlement Days",
            dataType: "number",
            required: true,
          },
          {
            fieldLogicalName: "minimumServiceDays",
            label: "Minimum Service Days",
            dataType: "number",
          },
          {
            fieldLogicalName: "prorateOnJoining",
            label: "Prorate On Joining",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "prorateOnExit",
            label: "Prorate On Exit",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "negativeBalanceAllowed",
            label: "Allow Negative Balance",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "maximumNegativeBalance",
            label: "Maximum Negative Balance",
            dataType: "number",
          },
        ],
        permissions: {
          create: "leave-policies.update",
          update: "leave-policies.update",
          delete: "leave-policies.update",
        },
      },
      {
        tabKey: "accrual-rules",
        label: "Accrual Rules",
        order: 30,
        relationshipName: "leave_policy_rules_accrual",
        relatedEntityLogicalName: "leave_policy_rules",
        targetFieldLogicalName: "leavePolicyId",
        columns: [
          "leaveTypeId",
          "accrualType",
          "accrualFrequency",
          "accrualDay",
          "accrualAmount",
          "accrueDuringProbation",
          "creditOnJoining",
        ],
        listPath: "/api/leave-policies/{parentId}/rules",
        createPath: "/api/leave-policies/{parentId}/rules",
        updatePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        deletePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "leaveTypeId",
            label: "Leave Type",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "accrualType",
            label: "Accrual Type",
            dataType: "optionset",
          },
          {
            fieldLogicalName: "accrualFrequency",
            label: "Accrual Frequency",
            dataType: "optionset",
          },
          {
            fieldLogicalName: "accrualDay",
            label: "Accrual Day",
            dataType: "number",
          },
          {
            fieldLogicalName: "accrualAmount",
            label: "Accrual Amount",
            dataType: "number",
          },
          {
            fieldLogicalName: "accrueDuringProbation",
            label: "Accrue During Probation",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "creditOnJoining",
            label: "Credit On Joining",
            dataType: "boolean",
          },
        ],
        permissions: {
          create: "leave-policies.update",
          update: "leave-policies.update",
          delete: "leave-policies.update",
        },
      },
      {
        tabKey: "carry-forward",
        label: "Carry Forward",
        order: 40,
        relationshipName: "leave_policy_rules_carry_forward",
        relatedEntityLogicalName: "leave_policy_rules",
        targetFieldLogicalName: "leavePolicyId",
        columns: [
          "leaveTypeId",
          "carryForwardAllowed",
          "carryForwardLimit",
          "carryForwardExpiryMonths",
          "encashUnusedBalance",
          "maximumEncashmentDays",
        ],
        listPath: "/api/leave-policies/{parentId}/rules",
        createPath: "/api/leave-policies/{parentId}/rules",
        updatePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        deletePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "leaveTypeId",
            label: "Leave Type",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "carryForwardAllowed",
            label: "Allow Carry Forward",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "carryForwardLimit",
            label: "Maximum Carry Forward Days",
            dataType: "number",
          },
          {
            fieldLogicalName: "carryForwardExpiryMonths",
            label: "Carry Forward Expiry Months",
            dataType: "number",
          },
          {
            fieldLogicalName: "encashUnusedBalance",
            label: "Encash Unused Balance",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "maximumEncashmentDays",
            label: "Maximum Encashment Days",
            dataType: "number",
          },
        ],
        permissions: {
          create: "leave-policies.update",
          update: "leave-policies.update",
          delete: "leave-policies.update",
        },
      },
      {
        tabKey: "eligibility",
        label: "Eligibility",
        order: 50,
        relationshipName: "leave_policy_assignments",
        relatedEntityLogicalName: "leave_policy_assignments",
        targetFieldLogicalName: "leavePolicyId",
        columns: [
          "scopeType",
          "organizationId",
          "businessUnitId",
          "departmentId",
          "employeeLevelId",
          "employeeId",
          "effectiveFrom",
        ],
        listPath: "/api/leave-policies/{parentId}/assignments",
        createPath: "/api/leave-policies/assignments",
        deletePath: "/api/leave-policies/assignments/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "scopeType",
            label: "Scope Type",
            dataType: "optionset",
            required: true,
          },
          {
            fieldLogicalName: "organizationId",
            label: "Organization",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "businessUnitId",
            label: "Business Unit",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "departmentId",
            label: "Department",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "employeeLevelId",
            label: "Employee Level",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "employeeId",
            label: "Employee",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "effectiveFrom",
            label: "Assigned On",
            dataType: "date",
            // CreateLeavePolicyAssignmentDto requires this. Rendered optional, a
            // blank value reached the API and came back as a raw validation
            // string, so the field has to carry its own requirement and stop the
            // submission first.
            required: true,
          },
        ],
        permissions: {
          create: "leave-policy-assignments.create",
          delete: "leave-policy-assignments.delete",
        },
      },
      {
        tabKey: "restrictions",
        label: "Restrictions",
        order: 60,
        relationshipName: "leave_policy_rules_restrictions",
        relatedEntityLogicalName: "leave_policy_rules",
        targetFieldLogicalName: "leavePolicyId",
        columns: [
          "leaveTypeId",
          "minimumNoticeDays",
          "maxConsecutiveDays",
          "minimumConsecutiveDays",
          "allowDuringProbation",
          "allowBackdatedRequests",
          "maxBackdatedDays",
          "allowFutureRequests",
          "maxFutureDays",
        ],
        listPath: "/api/leave-policies/{parentId}/rules",
        createPath: "/api/leave-policies/{parentId}/rules",
        updatePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        deletePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "leaveTypeId",
            label: "Leave Type",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "minimumNoticeDays",
            label: "Minimum Notice Days",
            dataType: "number",
          },
          {
            fieldLogicalName: "maxConsecutiveDays",
            label: "Maximum Consecutive Days",
            dataType: "number",
          },
          {
            fieldLogicalName: "minimumConsecutiveDays",
            label: "Minimum Consecutive Days",
            dataType: "number",
          },
          {
            fieldLogicalName: "allowDuringProbation",
            label: "Allow During Probation",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "allowBackdatedRequests",
            label: "Allow Backdated Requests",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "maxBackdatedDays",
            label: "Max Backdated Days",
            dataType: "number",
          },
          {
            fieldLogicalName: "allowFutureRequests",
            label: "Allow Future Requests",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "maxFutureDays",
            label: "Max Future Days",
            dataType: "number",
          },
          {
            fieldLogicalName: "requiresDocumentAfterDays",
            label: "Require Attachment After Days",
            dataType: "number",
          },
        ],
        permissions: {
          create: "leave-policies.update",
          update: "leave-policies.update",
          delete: "leave-policies.update",
        },
      },
      {
        tabKey: "approval",
        label: "Approval",
        order: 70,
        relationshipName: "leave_policy_rules_approval",
        relatedEntityLogicalName: "leave_policy_rules",
        targetFieldLogicalName: "leavePolicyId",
        columns: [
          "leaveTypeId",
          "approvalRequired",
          "approvalMatrixId",
          "autoApproveUnderDays",
          "requireHrApproval",
          "requirePayrollApproval",
        ],
        listPath: "/api/leave-policies/{parentId}/rules",
        createPath: "/api/leave-policies/{parentId}/rules",
        updatePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        deletePath: "/api/leave-policies/{parentId}/rules/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "leaveTypeId",
            label: "Leave Type",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "approvalRequired",
            label: "Approval Required",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "approvalMatrixId",
            label: "Approval Matrix",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "autoApproveUnderDays",
            label: "Auto Approve Under Days",
            dataType: "number",
          },
          {
            fieldLogicalName: "requireHrApproval",
            label: "Require HR Approval",
            dataType: "boolean",
          },
          {
            fieldLogicalName: "requirePayrollApproval",
            label: "Require Payroll Approval",
            dataType: "boolean",
          },
        ],
        permissions: {
          create: "leave-policies.update",
          update: "leave-policies.update",
          delete: "leave-policies.update",
        },
      },
      {
        tabKey: "assignments",
        label: "Assignments",
        order: 80,
        relationshipName: "leave_policy_assignments_all",
        relatedEntityLogicalName: "leave_policy_assignments",
        targetFieldLogicalName: "leavePolicyId",
        columns: [
          "scopeType",
          "organizationId",
          "businessUnitId",
          "departmentId",
          "employeeLevelId",
          "employeeId",
          "effectiveFrom",
        ],
        listPath: "/api/leave-policies/{parentId}/assignments",
        createPath: "/api/leave-policies/assignments",
        deletePath: "/api/leave-policies/assignments/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "scopeType",
            label: "Scope Type",
            dataType: "optionset",
            required: true,
          },
          {
            fieldLogicalName: "organizationId",
            label: "Organization",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "businessUnitId",
            label: "Business Unit",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "departmentId",
            label: "Department",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "employeeLevelId",
            label: "Employee Level",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "employeeId",
            label: "Employee",
            dataType: "lookup",
          },
          {
            fieldLogicalName: "effectiveFrom",
            label: "Assigned On",
            dataType: "date",
            // CreateLeavePolicyAssignmentDto requires this. Rendered optional, a
            // blank value reached the API and came back as a raw validation
            // string, so the field has to carry its own requirement and stop the
            // submission first.
            required: true,
          },
        ],
        permissions: {
          create: "leave-policy-assignments.create",
          delete: "leave-policy-assignments.delete",
        },
      },
    ],
  }),
  adapter({
    key: "approval-matrices",
    label: "Approval Matrices",
    singular: "Approval Matrix Step",
    serverApiPath: "/approval-matrices",
    routeBase: "/settings/approval-matrices",
    primaryId: "id",
    fields: [
      field("name", "Step Name", "string", {
        isPrimaryName: true,
        requirementLevel: "required",
      }),
      field("moduleKey", "Module", "optionset", {
        requirementLevel: "required",
        options: choices(
          "LEAVE_REQUEST",
          "TIMESHEET",
          "CLAIM_REQUEST",
          "BUSINESS_TRIP",
          "RESOURCE_REQUEST",
          "PAYROLL_RUN",
          "LOAN_REQUEST",
          "BENEFIT_ASSIGNMENT",
        ),
      }),
      field("recordType", "Record Type"),
      field("sequence", "Sequence", "number", {
        requirementLevel: "required",
        min: 1,
      }),
      field("approvalMode", "Approval Mode", "optionset", {
        options: [
          { value: "ANY_ONE", label: "Any One" },
          { value: "ALL", label: "All" },
        ],
      }),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("approverType", "Approver Source", "optionset", {
        requirementLevel: "required",
        options: choices(
          "LINE_MANAGER",
          "ROLE",
          "USER",
          "DEPARTMENT_HEAD",
          "BUSINESS_UNIT_HEAD",
          "REQUEST_OWNER_MANAGER",
          "MANAGER",
          "HR",
        ),
      }),
      field("approverRoleId", "Approver Role", "lookup"),
      field("approverUserId", "Approver User", "lookup"),
      field("scopeType", "Legacy Scope Type", "optionset", {
        options: choices(
          "TENANT",
          "ORGANIZATION",
          "BUSINESS_UNIT",
          "DEPARTMENT",
          "EMPLOYEE_LEVEL",
          "EMPLOYEE",
        ),
      }),
      field("scopeId", "Legacy Scope Record ID"),
      field("organizationId", "Organization", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("departmentId", "Department", "lookup"),
      field("employeeLevelId", "Employee Level", "lookup"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("leavePolicyId", "Leave Policy", "lookup"),
      field("leaveTypeId", "Leave Type", "lookup"),
      field("claimTypeId", "Claim Type", "lookup"),
      field("loanPolicyId", "Loan Policy", "lookup"),
      field("currencyCode", "Currency", "lookup"),
      field("minimumAmount", "Minimum Amount", "decimal", { min: 0 }),
      field("maximumAmount", "Maximum Amount", "decimal", { min: 0 }),
      field("minimumDuration", "Minimum Duration", "decimal", { min: 0 }),
      field("maximumDuration", "Maximum Duration", "decimal", { min: 0 }),
      field("conditions", "Additional Conditions", "json"),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "approval-matrix-summary",
        label: "Summary",
        tabKey: "summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "moduleKey", required: true },
          "recordType",
          { key: "sequence", required: true },
          "approvalMode",
          "isActive",
        ],
      }),
      formSection({
        id: "approval-matrix-scope",
        label: "Applicability & Effective Dates",
        tabKey: "scope",
        order: 20,
        columns: 2,
        fields: [
          "organizationId",
          "businessUnitId",
          "departmentId",
          "employeeLevelId",
          "effectiveFrom",
          "effectiveTo",
        ],
      }),
      formSection({
        id: "approval-matrix-conditions",
        label: "Module Conditions",
        tabKey: "conditions",
        order: 30,
        columns: 2,
        fields: [
          "leavePolicyId",
          "leaveTypeId",
          "claimTypeId",
          "loanPolicyId",
          "currencyCode",
          "minimumAmount",
          "maximumAmount",
          "minimumDuration",
          "maximumDuration",
          { key: "conditions", columnSpan: 2 },
        ],
      }),
      formSection({
        id: "approval-matrix-approver",
        label: "Approver",
        tabKey: "approver",
        order: 40,
        columns: 2,
        fields: [
          { key: "approverType", required: true },
          "approverRoleId",
          "approverUserId",
        ],
      }),
    ],
    lookupSources: {
      approverRoleId: "/api/roles",
      approverUserId: "/api/users",
      organizationId: "/api/organizations",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      employeeLevelId: "/api/employee-levels",
      leavePolicyId: "/api/leave-policies",
      leaveTypeId: "/api/leave-types",
      claimTypeId: "/api/claims/types",
      loanPolicyId: "/api/loan-policies",
      currencyCode: "/api/configuration/currencies",
    },
    columns: [
      "name",
      "moduleKey",
      "recordType",
      "sequence",
      "approverType",
      "approvalMode",
      "isActive",
      "updatedAt",
    ],
    permissions: {
      read: "approval-matrices.read",
      create: "approval-matrices.create",
      update: "approval-matrices.update",
      delete: "approval-matrices.delete",
    },
    initialValues: {
      name: "",
      moduleKey: "LEAVE_REQUEST",
      recordType: "",
      sequence: 1,
      approverType: "LINE_MANAGER",
      approvalMode: "ANY_ONE",
      conditions: {},
      isActive: true,
    },
    softDelete: true,
    formatters: {
      effectiveFrom: "date",
      effectiveTo: "date",
      updatedAt: "datetime",
      isActive: "boolean",
    },
  }),
  adapter({
    key: "policy-engine",
    label: "Policy Engine",
    singular: "Policy",
    serverApiPath: "/policies",
    mode: "specialized",
    blocker:
      "Policy Engine includes scoped assignments and resolver diagnostics that are not a flat record form.",
    specializedHref: "/settings/policies",
    fields: [
      ...namedCatalogFields,
      field("policyType", "Policy Type", "optionset"),
      field("scopeType", "Scope Type", "optionset"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("priority", "Priority", "number"),
    ],
    permissions: {
      read: "policies.read",
      create: "policies.manage",
      update: "policies.manage",
      delete: "policies.manage",
    },
    initialValues: {
      name: "",
      code: "",
      policyType: "",
      scopeType: "TENANT",
      priority: 0,
      isActive: true,
    },
    softDelete: true,
    formatters: {
      effectiveFrom: "date",
      effectiveTo: "date",
      isActive: "boolean",
    },
  }),
  adapter({
    key: "pay-components",
    label: "Pay Components",
    serverApiPath: "/pay-components",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code", "string"),
      field("description", "Description", "multiline-string"),
      field("organizationId", "Organization", "lookup"),
      field("legalEntityId", "Legal Entity", "lookup"),
      field("ownerUserId", "Owner", "lookup", { isOwner: true }),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("isDefault", "Default Component", "boolean"),
      field("isActive", "Active", "boolean"),
      field("componentCategory", "Component Category", "optionset", {
        options: choices(
          "BASIC",
          "ALLOWANCE",
          "BONUS",
          "DEDUCTION",
          "TAX",
          "EMPLOYER_CONTRIBUTION",
          "REIMBURSEMENT",
          "LOAN_RECOVERY",
          "BENEFIT",
          "ADJUSTMENT",
        ),
      }),
      field("componentType", "Component Type", "optionset", {
        options: choices(
          "EARNING",
          "ALLOWANCE",
          "REIMBURSEMENT",
          "DEDUCTION",
          "TAX",
          "EMPLOYER_CONTRIBUTION",
          "ADJUSTMENT",
        ),
      }),
      field("calculationMethod", "Calculation", "optionset", {
        options: choices(
          "FIXED",
          "PERCENTAGE",
          "FORMULA",
          "MANUAL",
          "SYSTEM_CALCULATED",
        ),
      }),
      field("isTaxable", "Taxable", "boolean"),
      field("affectsGrossPay", "Affects Gross Pay", "boolean"),
      field("affectsNetPay", "Affects Net Pay", "boolean"),
      field("isRecurring", "Recurring", "boolean"),
      field("requiresApproval", "Requires Approval", "boolean"),
      field("displayOnPayslip", "Payslip Visible", "boolean"),
      field("employeeVisible", "Employee Visible", "boolean"),
      field("displayOrder", "Display Order", "number"),
      field("fixedAmount", "Fixed Amount", "currency"),
      field("percentage", "Percentage Value", "decimal"),
      field("percentageBaseComponentId", "Percentage Base Component", "lookup"),
      field("formulaExpression", "Formula Expression", "multiline-string"),
      field("eligibilityAppliesTo", "Applies To", "optionset", {
        options: choices("ALL_EMPLOYEES", "MATCHING_EMPLOYEES"),
      }),
      field("eligibilityRules", "Eligibility Rules", "json"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("prorationBasis", "Proration Basis", "optionset", {
        options: choices("NONE", "CALENDAR_DAYS", "WORKING_DAYS", "HOURS"),
      }),
      field("minimumAmount", "Minimum Amount", "currency"),
      field("maximumAmount", "Maximum Amount", "currency"),
      field("roundingMethod", "Rounding Method", "optionset", {
        options: choices("NONE", "NEAREST", "UP", "DOWN"),
      }),
      field("defaultDebitAccountId", "Default Debit Account", "lookup"),
      field("defaultCreditAccountId", "Default Credit Account", "lookup"),
      field("version", "Version", "number", { isReadOnly: true }),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "pay-component-summary",
        label: "Summary",
        tabKey: "summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          "organizationId",
          "legalEntityId",
          "description",
          { key: "componentCategory", required: true },
          { key: "componentType", required: true },
          { key: "calculationMethod", required: true },
          { key: "status", required: true },
          { key: "ownerUserId", required: true },
          "isDefault",
          "effectiveFrom",
          "effectiveTo",
        ],
      }),
      formSection({
        id: "pay-component-calculation",
        label: "Formula / Calculation",
        order: 20,
        tabKey: "calculation",
        columns: 2,
        fields: [
          "fixedAmount",
          "percentage",
          "percentageBaseComponentId",
          "formulaExpression",
          "prorationBasis",
          "minimumAmount",
          "maximumAmount",
          "roundingMethod",
        ],
      }),
      formSection({
        id: "pay-component-eligibility",
        label: "Eligibility Rules",
        order: 25,
        tabKey: "eligibility",
        columns: 2,
        fields: [
          "eligibilityAppliesTo",
          "eligibilityRules",
          "effectiveFrom",
          "effectiveTo",
        ],
      }),
      formSection({
        id: "pay-component-accounting",
        label: "Accounting",
        order: 30,
        tabKey: "accounting",
        columns: 2,
        fields: ["defaultDebitAccountId", "defaultCreditAccountId"],
      }),
      formSection({
        id: "pay-component-usage",
        label: "Usage",
        order: 40,
        tabKey: "usage",
        columns: 2,
        fields: [
          "isTaxable",
          "isRecurring",
          "affectsGrossPay",
          "affectsNetPay",
          "displayOnPayslip",
          "employeeVisible",
          "requiresApproval",
          "displayOrder",
        ],
      }),
      formSection({
        id: "pay-component-version-history",
        label: "Version History",
        order: 80,
        tabKey: "version-history",
        columns: 3,
        fields: [
          { key: "version", readonly: true },
          { key: "createdAt", readonly: true },
          { key: "updatedAt", readonly: true },
        ],
      }),
      formSection({
        id: "pay-component-audit",
        label: "Audit",
        order: 90,
        tabKey: "audit",
        columns: 2,
        fields: [
          { key: "createdById", readonly: true },
          { key: "updatedById", readonly: true },
        ],
      }),
    ],
    columns: [
      "name",
      "code",
      "componentCategory",
      "componentType",
      "calculationMethod",
      "status",
      "isDefault",
    ],
    lookupSources: {
      organizationId: "/api/organizations?isActive=true",
      legalEntityId:
        "/api/organizations?isActive=true&organizationType=LEGAL_ENTITY",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
      percentageBaseComponentId: "/api/pay-components?isActive=true",
      defaultDebitAccountId: "/api/payroll/gl-accounts",
      defaultCreditAccountId: "/api/payroll/gl-accounts",
    },
    permissions: {
      read: "pay-components.read",
      create: "pay-components.manage",
      update: "pay-components.manage",
      delete: "pay-components.manage",
    },
    softDelete: true,
    initialValues: {
      name: "",
      code: "",
      componentCategory: "BASIC",
      componentType: "EARNING",
      calculationMethod: "FIXED",
      eligibilityAppliesTo: "ALL_EMPLOYEES",
      eligibilityRules: [],
      isTaxable: false,
      displayOnPayslip: true,
      employeeVisible: true,
      prorationBasis: "NONE",
      roundingMethod: "NONE",
      status: "ACTIVE",
      isDefault: false,
      isActive: true,
    },
  }),
  adapter({
    key: "claim-types",
    label: "Claim Types",
    serverApiPath: "/claims/types",
    clientApiPath: "/api/claims/types",
    fields: [
      field("name", "Claim Type Name", "string", { isPrimaryName: true }),
      field("description", "Description", "multiline-string"),
      field("receiptRequired", "Receipt Required", "boolean"),
      field("maxAmount", "Max Amount", "currency"),
      field("currencyCode", "Currency", "lookup"),
      field("approvalRequired", "Approval Required", "boolean"),
      field("payrollIncluded", "Payroll Included", "boolean"),
      field("taxable", "Taxable", "boolean"),
    ],
    formSections: [
      formSection({
        id: "claim-type-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          "description",
          "receiptRequired",
          "maxAmount",
          "currencyCode",
          "approvalRequired",
          "payrollIncluded",
          "taxable",
        ],
      }),
    ],
    columns: [
      "name",
      "currencyCode",
      "maxAmount",
      "receiptRequired",
      "approvalRequired",
      "payrollIncluded",
      "taxable",
    ],
    lookupSources: { currencyCode: "/api/configuration/currencies" },
    permissions: {
      read: "claim-types.read",
      create: "claim-types.manage",
      update: "claim-types.manage",
    },
    initialValues: {
      name: "",
      receiptRequired: false,
      approvalRequired: true,
      payrollIncluded: false,
      taxable: false,
    },
  }),
  adapter({
    key: "overtime-policies",
    label: "Overtime Rules",
    serverApiPath: "/overtime-policies",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("description", "Description", "multiline-string"),
      field("organizationId", "Organization", "lookup"),
      field("employeeLevelId", "Employee Level", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("departmentId", "Department", "lookup"),
      field("employmentTypeId", "Employment Type", "lookup"),
      field("calculationPeriod", "Calculation Period", "optionset", {
        options: choices("DAILY", "WEEKLY", "MONTHLY"),
      }),
      field("thresholdHours", "Threshold Hours", "decimal"),
      field("rateMultiplier", "Rate Multiplier", "decimal"),
      field("normalOtMultiplier", "Normal OT Multiplier", "decimal"),
      field("weekendOtMultiplier", "Weekend OT Multiplier", "decimal"),
      field("holidayOtMultiplier", "Holiday OT Multiplier", "decimal"),
      field("nightOtMultiplier", "Night OT Multiplier", "decimal"),
      field("minimumOtMinutes", "Minimum OT Minutes", "number"),
      field("maximumOtHours", "Maximum OT Hours", "decimal"),
      field("roundToMinutes", "Round To Minutes", "optionset", {
        options: choices("15", "30", "60"),
      }),
      field("payComponentId", "Pay Component", "lookup"),
      field("requiresApproval", "Requires Approval", "boolean"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
    ],
    formSections: [
      formSection({
        id: "overtime-policy-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          "description",
          { key: "calculationPeriod", required: true },
          { key: "thresholdHours", required: true },
          "requiresApproval",
          { key: "effectiveFrom", required: true },
          "effectiveTo",
        ],
      }),
      formSection({
        id: "overtime-policy-rates",
        label: "Rates",
        order: 20,
        columns: 2,
        fields: [
          { key: "rateMultiplier", required: true },
          "normalOtMultiplier",
          "weekendOtMultiplier",
          "holidayOtMultiplier",
          "nightOtMultiplier",
          "minimumOtMinutes",
          "maximumOtHours",
          "roundToMinutes",
          "payComponentId",
        ],
      }),
      formSection({
        id: "overtime-policy-eligibility",
        label: "Eligibility",
        order: 30,
        columns: 2,
        fields: [
          "organizationId",
          "businessUnitId",
          "departmentId",
          "employeeLevelId",
          "employmentTypeId",
        ],
      }),
    ],
    columns: [
      "name",
      "employeeLevelId",
      "businessUnitId",
      "calculationPeriod",
      "thresholdHours",
      "rateMultiplier",
      "requiresApproval",
    ],
    permissions: {
      read: "overtime-policies.read",
      create: "overtime-policies.manage",
      update: "overtime-policies.manage",
    },
    lookupSources: {
      organizationId: "/api/organizations",
      employeeLevelId: "/api/employee-levels",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      employmentTypeId: "/api/employment-types",
      payComponentId: "/api/pay-components",
    },
    initialValues: {
      name: "",
      calculationPeriod: "DAILY",
      thresholdHours: 8,
      rateMultiplier: 1.5,
      roundToMinutes: "15",
      requiresApproval: true,
      effectiveFrom: "",
      isActive: true,
    },
  }),
  adapter({
    key: "travel-allowance-policies",
    label: "Travel Allowance Rules",
    serverApiPath: "/travel-allowance-policies",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("description", "Description", "multiline-string"),
      field("travelType", "Travel Type", "optionset", {
        options: choices("DOMESTIC", "INTERNATIONAL"),
      }),
      field("businessUnitId", "Business Unit", "lookup"),
      field("departmentId", "Department", "lookup"),
      field("employeeLevelId", "Employee Level", "lookup"),
      field("employmentTypeId", "Employment Type", "lookup"),
      field("countryCode", "Country", "lookup"),
      field("city", "City", "string"),
      field("currencyCode", "Currency", "lookup"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
    ],
    formSections: [
      formSection({
        id: "travel-allowance-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          "description",
          "travelType",
          "currencyCode",
          { key: "effectiveFrom", required: true },
          "effectiveTo",
        ],
      }),
      formSection({
        id: "travel-allowance-eligibility",
        label: "Eligibility",
        order: 20,
        columns: 2,
        fields: [
          "employeeLevelId",
          "employmentTypeId",
          "businessUnitId",
          "departmentId",
          "countryCode",
          "city",
        ],
      }),
    ],
    columns: [
      "name",
      "travelType",
      "currencyCode",
      "employeeLevelId",
      "businessUnitId",
    ],
    lookupSources: {
      employeeLevelId: "/api/employee-levels",
      employmentTypeId: "/api/employment-types",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      countryCode: "/api/lookups/countries",
      currencyCode: "/api/configuration/currencies",
    },
    permissions: {
      read: "tada-policies.read",
      create: "tada-policies.manage",
      update: "tada-policies.manage",
    },
    initialValues: {
      name: "",
      travelType: "DOMESTIC",
      currencyCode: "",
      effectiveFrom: "",
    },
  }),
  adapter({
    key: "time-payroll-policies",
    label: "Time-Based Pay Rules",
    serverApiPath: "/time-payroll-policies",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("description", "Description", "multiline-string"),
      field("organizationId", "Organization", "lookup"),
      field("employeeLevelId", "Employee Level", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("departmentId", "Department", "lookup"),
      field("employmentTypeId", "Employment Type", "lookup"),
      field("countryCode", "Country", "lookup"),
      field("mode", "Mode", "optionset", {
        options: choices(
          "ATTENDANCE_ONLY",
          "TIMESHEET_ONLY",
          "ATTENDANCE_TO_TIMESHEET",
          "ATTENDANCE_AND_TIMESHEET_SEPARATE",
        ),
      }),
      field("useAttendanceForPayroll", "Use Attendance", "boolean"),
      field("useTimesheetForPayroll", "Use Timesheets", "boolean"),
      field(
        "requireAttendanceApproval",
        "Require Attendance Approval",
        "boolean",
      ),
      field(
        "requireTimesheetApproval",
        "Require Timesheet Approval",
        "boolean",
      ),
      field("detectNoShow", "Detect No-show", "boolean"),
      field("deductNoShow", "Deduct No-show", "boolean"),
      field("overtimeEnabled", "Overtime Enabled", "boolean"),
      field("standardHoursPerDay", "Standard Hours / Day", "decimal"),
      field("standardWorkingDaysPerMonth", "Working Days / Month", "decimal"),
      field("prorationBasis", "Proration Basis", "optionset", {
        options: choices("CALENDAR_DAYS", "WORKING_DAYS", "FIXED_30_DAYS"),
      }),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
    ],
    formSections: [
      formSection({
        id: "time-payroll-policy-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          "description",
          "organizationId",
          "employeeLevelId",
          "businessUnitId",
          "departmentId",
          "employmentTypeId",
          "countryCode",
          { key: "mode", required: true },
        ],
      }),
      formSection({
        id: "time-payroll-policy-rules",
        label: "Rules",
        order: 20,
        columns: 2,
        fields: [
          "useAttendanceForPayroll",
          "useTimesheetForPayroll",
          "requireAttendanceApproval",
          "requireTimesheetApproval",
          "detectNoShow",
          "deductNoShow",
          "overtimeEnabled",
          { key: "standardHoursPerDay", required: true },
          "standardWorkingDaysPerMonth",
          { key: "prorationBasis", required: true },
          { key: "effectiveFrom", required: true },
          "effectiveTo",
        ],
      }),
      formSection({
        id: "time-payroll-policy-eligibility",
        label: "Eligibility",
        order: 30,
        columns: 2,
        fields: [
          "organizationId",
          "businessUnitId",
          "departmentId",
          "employeeLevelId",
          "employmentTypeId",
          "countryCode",
        ],
      }),
    ],
    columns: [
      "name",
      "mode",
      "employeeLevelId",
      "businessUnitId",
      "requireTimesheetApproval",
      "overtimeEnabled",
    ],
    permissions: {
      read: "time-payroll-policies.read",
      create: "time-payroll-policies.manage",
      update: "time-payroll-policies.manage",
    },
    lookupSources: {
      organizationId: "/api/organizations",
      employeeLevelId: "/api/employee-levels",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      employmentTypeId: "/api/employment-types",
      countryCode: "/api/lookups/countries",
    },
    initialValues: {
      name: "",
      mode: "ATTENDANCE_AND_TIMESHEET_SEPARATE",
      standardHoursPerDay: 8,
      prorationBasis: "WORKING_DAYS",
      effectiveFrom: "",
      isActive: true,
    },
  }),
  adapter({
    key: "tax-rules",
    label: "Tax Policies",
    singular: "Tax Policy",
    serverApiPath: "/tax-rules",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("organizationId", "Organization", "lookup"),
      field("legalEntityId", "Legal Entity", "lookup"),
      field("payrollRegionId", "Payroll Region", "lookup"),
      field("taxAuthority", "Tax Authority"),
      field("taxType", "Tax Type", "optionset", {
        options: choices("INCOME_TAX", "SOCIAL_SECURITY", "MEDICARE", "OTHER"),
      }),
      field("calculationMethod", "Calculation Method", "optionset", {
        options: [
          { value: "BRACKET", label: "Progressive Slabs" },
          { value: "PERCENTAGE", label: "Flat Percentage" },
          { value: "FIXED", label: "Fixed Amount" },
          { value: "FORMULA", label: "Formula" },
          { value: "ZERO", label: "Zero Tax" },
          { value: "EXTERNAL", label: "External" },
        ],
      }),
      field("calculationStrategy", "Calculation Strategy", "optionset", {
        options: choices(
          "PERIODIC",
          "CUMULATIVE_YTD",
          "ANNUALIZED_PROJECTION",
          "EXTERNAL",
        ),
      }),
      field("countryCode", "Country", "lookup"),
      field("regionCode", "Region / State / Province", "lookup", {
        dependsOnFieldId: "countryCode",
        dependencyFilterKey: "countryCode",
        resetOnParentChange: true,
      }),
      field("currencyCode", "Currency", "lookup"),
      field("taxYearStart", "Tax Year Start", "date"),
      field("taxYearEnd", "Tax Year End", "date"),
      field("employeeRate", "Employee Rate %", "decimal"),
      field("employerRate", "Employer Rate %", "decimal"),
      field("fixedEmployeeAmount", "Fixed Employee Tax", "currency"),
      field("fixedEmployerAmount", "Fixed Employer Tax", "currency"),
      field("formulaExpression", "Formula", "multiline-string"),
      field("employeeLevelId", "Employee Level", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("departmentId", "Department", "lookup"),
      field("employmentTypeId", "Employment Type", "lookup"),
      field("priority", "Priority", "number"),
      field("applicabilityRules", "Additional Eligibility Rules", "json"),
      field("employeeTaxComponentId", "Employee Tax Pay Component", "lookup"),
      field(
        "employerTaxComponentId",
        "Employer Tax / Contribution Component",
        "lookup",
      ),
      field("postingCategory", "Posting Category"),
      field("taxStatementTemplateId", "Tax Statement Template", "lookup"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("ownerUserId", "Owner", "lookup", { isOwner: true }),
      field("isDefault", "Default Policy", "boolean"),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("version", "Version", "number", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "tax-rule-summary",
        label: "Summary",
        tabKey: "summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          "organizationId",
          "legalEntityId",
          "taxAuthority",
          { key: "taxType", required: true },
          { key: "calculationMethod", required: true },
          { key: "calculationStrategy", required: true },
          "countryCode",
          "regionCode",
          "currencyCode",
          "taxYearStart",
          "taxYearEnd",
          { key: "effectiveFrom", required: true },
          "effectiveTo",
          { key: "status", required: true },
          { key: "ownerUserId", required: true },
          "isDefault",
          "description",
        ],
      }),
      formSection({
        id: "tax-rule-applicability",
        label: "Applicability",
        tabKey: "applicability",
        order: 30,
        columns: 2,
        fields: [
          "organizationId",
          "legalEntityId",
          "countryCode",
          "payrollRegionId",
          "businessUnitId",
          "departmentId",
          "employeeLevelId",
          "employmentTypeId",
          "priority",
          { key: "applicabilityRules", columnSpan: 2 },
        ],
      }),
      formSection({
        id: "tax-rule-calculation",
        label: "Calculation",
        tabKey: "calculation",
        order: 40,
        columns: 2,
        fields: [
          "calculationMethod",
          "calculationStrategy",
          "employeeRate",
          "employerRate",
          "fixedEmployeeAmount",
          "fixedEmployerAmount",
          { key: "formulaExpression", columnSpan: 2 },
        ],
      }),
      formSection({
        id: "tax-rule-output",
        label: "Output Components",
        tabKey: "output-components",
        order: 50,
        columns: 2,
        fields: [
          "employeeTaxComponentId",
          "employerTaxComponentId",
          "postingCategory",
        ],
      }),
      formSection({
        id: "tax-rule-statements",
        label: "Statements",
        tabKey: "statements",
        order: 60,
        columns: 2,
        fields: ["taxStatementTemplateId"],
      }),
      formSection({
        id: "tax-rule-audit",
        label: "Audit",
        tabKey: "audit",
        order: 90,
        columns: 3,
        fields: [
          { key: "createdById", readonly: true },
          { key: "updatedById", readonly: true },
          { key: "createdAt", readonly: true },
          { key: "updatedAt", readonly: true },
          { key: "version", readonly: true },
        ],
      }),
    ],
    relatedTabs: [
      {
        tabKey: "slabs",
        label: "Slabs",
        order: 20,
        relationshipName: "tax_rule_brackets",
        relatedEntityLogicalName: "taxRuleBracket",
        targetFieldLogicalName: "taxRuleId",
        columns: [
          "sequence",
          "minAmount",
          "maxAmount",
          "employeeRate",
          "fixedEmployeeAmount",
          "excessOver",
          "minimumTax",
          "maximumTax",
          "effectiveFrom",
          "effectiveTo",
          "status",
        ],
        columnLabels: {
          sequence: "Sequence",
          minAmount: "Lower Limit",
          maxAmount: "Upper Limit",
          employeeRate: "Rate %",
          fixedEmployeeAmount: "Base Tax",
          excessOver: "Excess Over",
          minimumTax: "Minimum Tax",
          maximumTax: "Maximum Tax",
          effectiveFrom: "Effective From",
          effectiveTo: "Effective To",
          status: "Status",
        },
        listPath: "/api/tax-rules/{parentId}/brackets",
        createPath: "/api/tax-rules/{parentId}/brackets",
        updatePath: "/api/tax-rules/{parentId}/brackets/{recordId}",
        deletePath: "/api/tax-rules/{parentId}/brackets/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "sequence",
            label: "Sequence",
            dataType: "number",
            required: true,
          },
          {
            fieldLogicalName: "minAmount",
            label: "Lower Limit",
            dataType: "currency",
            required: true,
          },
          {
            fieldLogicalName: "maxAmount",
            label: "Upper Limit",
            dataType: "currency",
          },
          {
            fieldLogicalName: "employeeRate",
            label: "Rate %",
            dataType: "decimal",
          },
          {
            fieldLogicalName: "fixedEmployeeAmount",
            label: "Base Tax",
            dataType: "currency",
          },
          {
            fieldLogicalName: "excessOver",
            label: "Excess Over",
            dataType: "currency",
          },
          {
            fieldLogicalName: "minimumTax",
            label: "Minimum Tax",
            dataType: "currency",
          },
          {
            fieldLogicalName: "maximumTax",
            label: "Maximum Tax",
            dataType: "currency",
          },
          {
            fieldLogicalName: "effectiveFrom",
            label: "Effective From",
            dataType: "date",
          },
          {
            fieldLogicalName: "effectiveTo",
            label: "Effective To",
            dataType: "date",
          },
          {
            fieldLogicalName: "status",
            label: "Status",
            dataType: "optionset",
          },
        ],
        permissions: {
          create: "tax-rules.manage",
          update: "tax-rules.manage",
          delete: "tax-rules.manage",
        },
      },
      {
        tabKey: "assignments",
        label: "Assignments",
        order: 70,
        relationshipName: "tax_policy_assignments",
        relatedEntityLogicalName: "employeeTaxProfile",
        targetFieldLogicalName: "taxRuleId",
        columns: [
          "employeeName",
          "taxStatus",
          "effectiveFrom",
          "effectiveTo",
          "status",
        ],
        listPath: "/api/employee-tax-profiles?taxRuleId={parentId}",
      },
    ],
    columns: [
      "name",
      "taxType",
      "calculationMethod",
      "countryCode",
      "currencyCode",
      "employeeRate",
      "employerRate",
    ],
    lookupSources: {
      countryCode: "/api/lookups/countries",
      regionCode: "/api/lookups/states",
      currencyCode: "/api/configuration/currencies",
      organizationId: "/api/organizations?isActive=true",
      legalEntityId:
        "/api/organizations?isActive=true&organizationType=LEGAL_ENTITY",
      payrollRegionId: "/api/payroll-regions?status=ACTIVE",
      employeeLevelId: "/api/employee-levels",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      employmentTypeId: "/api/employment-types",
      employeeTaxComponentId: "/api/pay-components?isActive=true",
      employerTaxComponentId: "/api/pay-components?isActive=true",
      taxStatementTemplateId:
        "/api/settings-runtime/document-templates?isActive=true",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
    },
    permissions: {
      read: "tax-rules.read",
      create: "tax-rules.manage",
      update: "tax-rules.manage",
    },
    initialValues: {
      name: "",
      code: "",
      taxType: "INCOME_TAX",
      calculationMethod: "BRACKET",
      calculationStrategy: "PERIODIC",
      effectiveFrom: "",
      status: "DRAFT",
      priority: 100,
      isDefault: false,
    },
    formatters: {
      effectiveFrom: "date",
      effectiveTo: "date",
      isActive: "boolean",
    },
  }),
  adapter({
    key: "employee-tax-profiles",
    label: "Employee Tax Profiles",
    singular: "Employee Tax Profile",
    serverApiPath: "/employee-tax-profiles",
    clientApiPath: "/api/employee-tax-profiles",
    ownerField: "ownerUserId",
    statusField: "status",
    fields: [
      field("employeeName", "Employee", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("employeeId", "Employee", "lookup"),
      field("employeeCode", "Employee Code", "string", { isReadOnly: true }),
      field("taxIdentificationNumber", "Tax Identification Number", "string"),
      field("taxResidencyCountryCode", "Tax Residency Country", "lookup"),
      field("workTaxJurisdiction", "Work Tax Jurisdiction", "string"),
      field("taxStatus", "Tax Status", "string"),
      field("taxCategory", "Tax Category", "string"),
      field("filingStatus", "Filing Status", "string"),
      field("dependentAllowances", "Dependents / Allowances", "number"),
      field("taxRuleId", "Assigned Tax Policy", "lookup"),
      field("taxRuleName", "Tax Policy", "string", { isReadOnly: true }),
      field("additionalTaxAmount", "Additional Tax", "currency"),
      field("taxExemptionAmount", "Tax Exemption", "currency"),
      field("taxCreditAmount", "Tax Credit", "currency"),
      field(
        "previousEmployerTaxableIncome",
        "Previous Employer Taxable Income",
        "currency",
      ),
      field(
        "previousEmployerTaxDeducted",
        "Previous Employer Tax Deducted",
        "currency",
      ),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("overrideReason", "Override Reason", "multiline-string"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("ownerUserId", "Owner", "lookup", { isOwner: true }),
    ],
    formSections: [
      formSection({
        id: "employee-tax-profile-identity",
        label: "Employee & Jurisdiction",
        order: 10,
        columns: 2,
        fields: [
          { key: "employeeId", required: true },
          "taxIdentificationNumber",
          "taxResidencyCountryCode",
          "workTaxJurisdiction",
          "taxStatus",
          "taxCategory",
          "filingStatus",
          "dependentAllowances",
        ],
      }),
      formSection({
        id: "employee-tax-profile-calculation",
        label: "Policy & Adjustments",
        order: 20,
        columns: 2,
        fields: [
          "taxRuleId",
          "additionalTaxAmount",
          "taxExemptionAmount",
          "taxCreditAmount",
          "previousEmployerTaxableIncome",
          "previousEmployerTaxDeducted",
          "overrideReason",
        ],
      }),
      formSection({
        id: "employee-tax-profile-effective",
        label: "Effective Dates",
        order: 30,
        columns: 2,
        fields: [
          { key: "effectiveFrom", required: true },
          "effectiveTo",
          "status",
          "ownerUserId",
        ],
      }),
    ],
    columns: [
      "employeeName",
      "employeeCode",
      "taxRuleName",
      "taxStatus",
      "filingStatus",
      "effectiveFrom",
      "effectiveTo",
      "status",
    ],
    lookupSources: {
      employeeId: "/api/employees",
      taxResidencyCountryCode: "/api/lookups/countries",
      taxRuleId: "/api/tax-rules",
      ownerUserId: "/api/users",
    },
    permissions: {
      read: "employee-tax-profiles.read",
      create: "employee-tax-profiles.manage",
      update: "employee-tax-profiles.manage",
      delete: "employee-tax-profiles.manage",
    },
    initialValues: {
      dependentAllowances: 0,
      additionalTaxAmount: 0,
      taxExemptionAmount: 0,
      taxCreditAmount: 0,
      previousEmployerTaxableIncome: 0,
      previousEmployerTaxDeducted: 0,
      effectiveFrom: "",
      status: "ACTIVE",
    },
    formatters: {
      effectiveFrom: "date",
      effectiveTo: "date",
    },
  }),
  adapter({
    key: "payroll-regions",
    label: "Payroll Regions",
    singular: "Payroll Region",
    serverApiPath: "/payroll-regions",
    clientApiPath: "/api/payroll-regions",
    ownerField: "ownerUserId",
    statusField: "status",
    subStatusField: "subStatus",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code", "string"),
      field("organizationId", "Organization", "lookup"),
      field("organizationName", "Organization", "string", { isReadOnly: true }),
      field("businessUnitId", "Business Unit", "lookup"),
      field("businessUnitName", "Business Unit", "string", {
        isReadOnly: true,
      }),
      field("countryCode", "Country", "lookup"),
      field("currencyCode", "Currency", "lookup"),
      field("timezone", "Timezone", "lookup"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("subStatus", "Sub Status", "string", { isSubStatus: true }),
      field("ownerUserId", "Record Owner", "lookup", { isOwner: true }),
      field("description", "Description", "multiline-string"),
    ],
    formSections: [
      formSection({
        id: "payroll-region-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          "code",
          "organizationId",
          "businessUnitId",
          "countryCode",
          { key: "currencyCode", required: true },
          { key: "timezone", required: true },
          "status",
          "subStatus",
          "ownerUserId",
          "description",
        ],
      }),
    ],
    columns: [
      "name",
      "code",
      "organizationName",
      "businessUnitName",
      "countryCode",
      "currencyCode",
      "timezone",
      "status",
    ],
    lookupSources: {
      organizationId: "/api/organizations",
      businessUnitId: "/api/business-units",
      countryCode: "/api/lookups/countries",
      currencyCode: "/api/configuration/currencies",
      timezone: "/api/configuration/timezones",
      ownerUserId: "/api/users",
    },
    permissions: {
      read: "payroll.settings.read",
      create: "payroll.settings.update",
      update: "payroll.settings.update",
      delete: "payroll.settings.update",
    },
    initialValues: {
      name: "",
      code: "",
      currencyCode: "",
      timezone: "",
      status: "ACTIVE",
      subStatus: "OPEN",
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
  }),
  adapter({
    key: "fiscal-years",
    label: "Fiscal Years",
    singular: "Fiscal Year",
    serverApiPath: "/fiscal-years",
    clientApiPath: "/api/fiscal-years",
    ownerField: "ownerUserId",
    statusField: "status",
    subStatusField: "subStatus",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("startDate", "Start Date", "date"),
      field("endDate", "End Date", "date"),
      field("isCurrent", "Current", "boolean"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("subStatus", "Sub Status", "string", { isSubStatus: true }),
      field("ownerUserId", "Record Owner", "lookup", { isOwner: true }),
      field("description", "Description", "multiline-string"),
    ],
    formSections: [
      formSection({
        id: "fiscal-year-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "startDate", required: true },
          { key: "endDate", required: true },
          "isCurrent",
          { key: "status", required: true },
          "subStatus",
          "ownerUserId",
          "description",
        ],
      }),
    ],
    columns: ["name", "startDate", "endDate", "isCurrent", "status"],
    lookupSources: {
      ownerUserId: "/api/users",
    },
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: {
      name: "",
      startDate: "",
      endDate: "",
      isCurrent: false,
      status: "ACTIVE",
      subStatus: "OPEN",
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    formatters: {
      startDate: "date",
      endDate: "date",
      isCurrent: "boolean",
    },
    widgets: [
      {
        id: "fiscal-year-usage",
        label: "Usage",
        widgetType: "regional_usage",
        tabKey: "usage",
        columnSpan: 3,
        dataSource: {
          apiPath: "/api/fiscal-years/{recordId}/usage",
        },
      },
    ],
  }),
  adapter({
    key: "gl-accounts",
    label: "GL Accounts",
    singular: "GL Account",
    serverApiPath: "/payroll/gl-accounts",
    fields: [
      field("name", "Account Name", "string", { isPrimaryName: true }),
      field("code", "Account Number", "string"),
      field("description", "Description", "multiline-string"),
      field("organizationId", "Organization", "lookup"),
      field("legalEntityId", "Legal Entity", "lookup"),
      field("accountType", "Account Type", "optionset", {
        options: choices("EXPENSE", "LIABILITY", "ASSET", "REVENUE", "EQUITY"),
      }),
      field("accountSubtype", "Account Subtype"),
      field("currencyCode", "Currency", "lookup"),
      field("parentAccountId", "Parent Account", "lookup"),
      field("postingAllowed", "Posting Allowed", "boolean"),
      field("isControlAccount", "Control Account", "boolean"),
      field("reconciliationRequired", "Reconciliation Required", "boolean"),
      field(
        "requireBusinessUnitDimension",
        "Business Unit Required",
        "boolean",
      ),
      field("requireDepartmentDimension", "Department Required", "boolean"),
      field("requireCostCenterDimension", "Cost Center Required", "boolean"),
      field("requireProjectDimension", "Project Required", "boolean"),
      field("requireEmployeeDimension", "Employee Required", "boolean"),
      field("requireLocationDimension", "Location Required", "boolean"),
      field("requireLegalEntityDimension", "Legal Entity Required", "boolean"),
      field("externalSystem", "External System"),
      field("externalAccountCode", "External Account Code"),
      field("erpCompanyCode", "ERP Company Code"),
      field("erpLedgerCode", "ERP Ledger Code"),
      field("erpAccountId", "ERP Account ID"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("ownerUserId", "Owner", "lookup", { isOwner: true }),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("version", "Version", "number", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "gl-account-summary",
        label: "Summary",
        tabKey: "summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          "organizationId",
          "legalEntityId",
          { key: "accountType", required: true },
          { key: "status", required: true },
          { key: "ownerUserId", required: true },
          "effectiveFrom",
          "effectiveTo",
          "description",
        ],
      }),
      formSection({
        id: "gl-account-classification",
        label: "Classification",
        tabKey: "classification",
        order: 20,
        columns: 2,
        fields: [
          "accountType",
          "accountSubtype",
          "parentAccountId",
          "currencyCode",
          "postingAllowed",
          "isControlAccount",
          "reconciliationRequired",
        ],
      }),
      formSection({
        id: "gl-account-dimensions",
        label: "Dimensions",
        tabKey: "dimensions",
        order: 30,
        columns: 2,
        fields: [
          "requireBusinessUnitDimension",
          "requireDepartmentDimension",
          "requireCostCenterDimension",
          "requireProjectDimension",
          "requireEmployeeDimension",
          "requireLocationDimension",
          "requireLegalEntityDimension",
        ],
      }),
      formSection({
        id: "gl-account-integration",
        label: "Integration",
        tabKey: "integration",
        order: 40,
        columns: 2,
        fields: [
          "externalSystem",
          "externalAccountCode",
          "erpCompanyCode",
          "erpLedgerCode",
          "erpAccountId",
        ],
      }),
      formSection({
        id: "gl-account-usage",
        label: "Usage",
        tabKey: "usage",
        order: 50,
        columns: 2,
        fields: [
          { key: "postingAllowed", readonly: true },
          { key: "isControlAccount", readonly: true },
        ],
      }),
      formSection({
        id: "gl-account-audit",
        label: "Audit",
        tabKey: "audit",
        order: 60,
        columns: 3,
        fields: [
          { key: "createdById", readonly: true },
          { key: "updatedById", readonly: true },
          { key: "createdAt", readonly: true },
          { key: "updatedAt", readonly: true },
          { key: "version", readonly: true },
        ],
      }),
    ],
    columns: ["name", "code", "accountType", "currencyCode", "postingAllowed"],
    lookupSources: {
      currencyCode: "/api/configuration/currencies",
      parentAccountId: "/api/payroll/gl-accounts",
      organizationId: "/api/organizations?isActive=true",
      legalEntityId:
        "/api/organizations?isActive=true&organizationType=LEGAL_ENTITY",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
    },
    permissions: {
      read: "payroll-gl.read",
      create: "payroll-gl.manage",
      update: "payroll-gl.manage",
    },
    initialValues: {
      name: "",
      accountType: "EXPENSE",
      postingAllowed: true,
      isControlAccount: false,
      reconciliationRequired: false,
      status: "ACTIVE",
      isActive: true,
    },
  }),
  adapter({
    key: "posting-rules",
    label: "Posting Rules",
    singular: "Posting Rule",
    serverApiPath: "/payroll/posting-rules",
    fields: [
      field("name", "Rule Name", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("organizationId", "Organization", "lookup"),
      field("legalEntityId", "Legal Entity", "lookup"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("ownerUserId", "Owner", "lookup", { isOwner: true }),
      field("priority", "Priority", "number"),
      field("isDefault", "Default Rule", "boolean"),
      field("postingEvent", "Posting Event", "optionset", {
        options: choices(
          "PAYROLL_ACCRUAL",
          "PAYROLL_PAYMENT",
          "EMPLOYER_CONTRIBUTION",
          "TAX_LIABILITY",
          "BENEFIT_LIABILITY",
          "LOAN_DEDUCTION",
          "REIMBURSEMENT",
          "ADJUSTMENT",
          "REVERSAL",
          "FINAL_SETTLEMENT",
        ),
      }),
      field("lineCategory", "Line Category", "optionset", {
        options: choices(
          "PAY_COMPONENT",
          "TAX_RULE",
          "CLAIM",
          "BENEFIT",
          "LOAN",
          "ADJUSTMENT",
          "REIMBURSEMENT",
        ),
      }),
      field("sourceCategory", "Payroll Line Type", "optionset", {
        options: choices(
          "EARNING",
          "ALLOWANCE",
          "REIMBURSEMENT",
          "DEDUCTION",
          "TAX",
          "EMPLOYER_CONTRIBUTION",
          "ADJUSTMENT",
        ),
      }),
      field("payComponentId", "Pay Component", "lookup"),
      field("taxRuleId", "Tax Policy", "lookup"),
      field("debitAccountId", "Debit Account", "lookup"),
      field("creditAccountId", "Credit Account", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("departmentId", "Department", "lookup"),
      field("projectId", "Project", "lookup"),
      field("payrollRegionId", "Payroll Region", "lookup"),
      field("costCenterId", "Cost Center", "lookup"),
      field("employmentTypeId", "Employment Type", "lookup"),
      ...postingDimensionFields(),
      field("consolidationMode", "Consolidation Mode", "optionset", {
        options: choices("NONE", "BY_ACCOUNT", "BY_ACCOUNT_AND_DIMENSIONS"),
      }),
      field("descriptionTemplate", "Description Template"),
      field("journalReferenceTemplate", "Journal Reference Template"),
      field("allowZeroPosting", "Allow Zero Posting", "boolean"),
      field("reversalRule", "Reversal Rule", "optionset", {
        options: choices("REVERSE_ORIGINAL", "NEXT_PERIOD", "MANUAL"),
      }),
      field("employeeLevelEntry", "Employee-Level Entry", "boolean"),
      field("componentLevelEntry", "Component-Level Entry", "boolean"),
      field("departmentLevelEntry", "Department-Level Entry", "boolean"),
      field("allowSameAccount", "Allow Same Debit/Credit Account", "boolean"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("version", "Version", "number", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "posting-rule-summary",
        label: "Summary",
        tabKey: "summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          "organizationId",
          "legalEntityId",
          { key: "status", required: true },
          { key: "ownerUserId", required: true },
          { key: "postingEvent", required: true },
          "priority",
          "isDefault",
          { key: "effectiveFrom", required: true },
          "effectiveTo",
          "description",
        ],
      }),
      formSection({
        id: "posting-rule-source",
        label: "Source Criteria",
        tabKey: "source-criteria",
        order: 20,
        columns: 2,
        fields: [
          { key: "lineCategory", required: true },
          { key: "sourceCategory", required: true },
          "payComponentId",
          "taxRuleId",
          "payrollRegionId",
          "businessUnitId",
          "departmentId",
          "projectId",
          "costCenterId",
          "employmentTypeId",
        ],
      }),
      formSection({
        id: "posting-rule-accounts",
        label: "Account Mapping",
        tabKey: "account-mapping",
        order: 30,
        columns: 2,
        fields: [
          { key: "debitAccountId", required: true },
          { key: "creditAccountId", required: true },
          "allowSameAccount",
        ],
      }),
      formSection({
        id: "posting-rule-dimensions",
        label: "Dimension Mapping",
        tabKey: "dimension-mapping",
        order: 40,
        columns: 2,
        fields: [
          "debitBusinessUnitSource",
          "creditBusinessUnitSource",
          "debitDepartmentSource",
          "creditDepartmentSource",
          "debitCostCenterSource",
          "creditCostCenterSource",
          "debitProjectSource",
          "creditProjectSource",
          "debitEmployeeSource",
          "creditEmployeeSource",
        ],
      }),
      formSection({
        id: "posting-rule-journal",
        label: "Journal Behavior",
        tabKey: "journal-behavior",
        order: 50,
        columns: 2,
        fields: [
          "consolidationMode",
          "descriptionTemplate",
          "journalReferenceTemplate",
          "allowZeroPosting",
          "reversalRule",
          "employeeLevelEntry",
          "componentLevelEntry",
          "departmentLevelEntry",
        ],
      }),
      formSection({
        id: "posting-rule-usage",
        label: "Usage",
        tabKey: "usage",
        order: 60,
        columns: 2,
        fields: [
          { key: "isDefault", readonly: true },
          { key: "status", readonly: true },
        ],
      }),
      formSection({
        id: "posting-rule-audit",
        label: "Audit",
        tabKey: "audit",
        order: 70,
        columns: 3,
        fields: [
          { key: "createdById", readonly: true },
          { key: "updatedById", readonly: true },
          { key: "createdAt", readonly: true },
          { key: "updatedAt", readonly: true },
          { key: "version", readonly: true },
        ],
      }),
    ],
    columns: [
      "name",
      "lineCategory",
      "sourceCategory",
      "payComponentId",
      "taxRuleId",
      "debitAccountId",
      "creditAccountId",
    ],
    lookupSources: {
      payComponentId: "/api/pay-components",
      taxRuleId: "/api/tax-rules",
      debitAccountId: "/api/payroll/gl-accounts",
      creditAccountId: "/api/payroll/gl-accounts",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      projectId: "/api/projects",
      organizationId: "/api/organizations?isActive=true",
      legalEntityId:
        "/api/organizations?isActive=true&organizationType=LEGAL_ENTITY",
      payrollRegionId: "/api/payroll-regions?status=ACTIVE",
      costCenterId: "/api/payroll/gl-accounts?isActive=true",
      employmentTypeId: "/api/employment-types?isActive=true",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
    },
    permissions: {
      read: "payroll-gl.read",
      create: "payroll-gl.manage",
      update: "payroll-gl.manage",
    },
    initialValues: {
      name: "",
      code: "",
      postingEvent: "PAYROLL_ACCRUAL",
      lineCategory: "PAY_COMPONENT",
      sourceCategory: "EARNING",
      allowSameAccount: false,
      priority: 100,
      isDefault: false,
      status: "ACTIVE",
      consolidationMode: "BY_ACCOUNT_AND_DIMENSIONS",
      reversalRule: "REVERSE_ORIGINAL",
      componentLevelEntry: true,
      effectiveFrom: "",
    },
  }),
  adapter({
    key: "payroll-periods",
    label: "Payroll Periods",
    singular: "Payroll Period",
    serverApiPath: "/payroll/periods",
    fields: [
      field("name", "Period", "string", { isPrimaryName: true }),
      field("payrollCalendarId", "Payroll Calendar", "lookup"),
      field("periodStart", "Period Start", "date"),
      field("periodEnd", "Period End", "date"),
      field("cutoffDate", "Cutoff Date", "date"),
      field("paymentDate", "Payment Date", "date"),
      field("status", "Status", "optionset", {
        options: choices(
          "OPEN",
          "INPUT_CLOSED",
          "PROCESSING",
          "APPROVED",
          "PAID",
          "LOCKED",
        ),
        isStatus: true,
      }),
    ],
    lookupSources: { payrollCalendarId: "/api/payroll/calendars" },
    permissions: {
      read: "payroll.read",
      create: "payroll.manage",
      update: "payroll.manage",
    },
    initialValues: {
      name: "",
      payrollCalendarId: "",
      periodStart: "",
      periodEnd: "",
      status: "OPEN",
    },
    formatters: {
      periodStart: "date",
      periodEnd: "date",
      cutoffDate: "date",
      paymentDate: "date",
    },
  }),
  adapter({
    key: "benefit-policies",
    label: "Benefit Plans",
    singular: "Benefit Plan",
    serverApiPath: "/benefits/policies",
    clientApiPath: "/api/benefits/policies",
    fields: [
      field("employeeId", "Employee", "lookup"),
      field("name", "Benefit Plan", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("provider", "Provider"),
      field("legalEntityId", "Legal Entity", "lookup"),
      field("ownerUserId", "Owner", "lookup", { isOwner: true }),
      field("isDefault", "Default Plan", "boolean"),
      field("status", "Status", "optionset", {
        options: statusOptions,
        isStatus: true,
      }),
      field("benefitType", "Benefit Type", "optionset", {
        options: [
          ...choices(
            "MEDICAL",
            "DENTAL",
            "LIFE",
            "DISABILITY",
            "RETIREMENT",
            "MEAL",
            "TRANSPORT",
            "WELLNESS",
            "INSURANCE",
            "OTHER",
          ),
        ],
      }),
      field("valueType", "Value Type", "optionset", {
        options: [
          { value: "FIXED_AMOUNT", label: "Fixed Amount" },
          { value: "PERCENTAGE", label: "Percentage" },
        ],
      }),
      field("fixedAmount", "Fixed Amount", "currency"),
      field("percentage", "Percentage", "decimal"),
      field("currencyCode", "Currency", "lookup"),
      field("payrollCategory", "Payroll Category", "optionset", {
        options: choices(
          "EARNING",
          "ALLOWANCE",
          "REIMBURSEMENT",
          "DEDUCTION",
          "TAX",
          "EMPLOYER_CONTRIBUTION",
          "ADJUSTMENT",
        ),
      }),
      field("employeePayComponentId", "Employee Deduction Component", "lookup"),
      field(
        "employerPayComponentId",
        "Employer Contribution Component",
        "lookup",
      ),
      field("postingCategory", "Posting Category"),
      field("minimumServiceMonths", "Minimum Service (Months)", "number"),
      field(
        "employeeContributionMethod",
        "Employee Contribution Method",
        "optionset",
        { options: choices("FIXED_AMOUNT", "PERCENTAGE", "NONE") },
      ),
      field("employeeContributionAmount", "Employee Amount", "currency"),
      field("employeeContributionPercent", "Employee Percentage", "decimal"),
      field(
        "employerContributionMethod",
        "Employer Contribution Method",
        "optionset",
        { options: choices("FIXED_AMOUNT", "PERCENTAGE", "NONE") },
      ),
      field("employerContributionAmount", "Employer Amount", "currency"),
      field("employerContributionPercent", "Employer Percentage", "decimal"),
      field("basePayComponentId", "Base Pay Component", "lookup"),
      field("contributionMinimum", "Minimum Contribution", "currency"),
      field("contributionMaximum", "Maximum Contribution", "currency"),
      field("contributionFrequency", "Frequency", "optionset", {
        options: choices("PER_PAYROLL", "MONTHLY", "QUARTERLY", "ANNUAL"),
      }),
      field("taxTreatment", "Tax Treatment", "optionset", {
        options: choices("TAXABLE", "PRE_TAX", "POST_TAX", "EXEMPT"),
      }),
      field("includeInEmployerCost", "Include in Employer Cost", "boolean"),
      field("prorationMethod", "Proration", "optionset", {
        options: choices("NONE", "CALENDAR_DAYS", "WORKING_DAYS"),
      }),
      field("arrearsHandling", "Arrears Handling", "optionset", {
        options: choices(
          "CARRY_FORWARD",
          "DEDUCT_NEXT_PAYROLL",
          "WAIVE",
          "BLOCK",
        ),
      }),
      field("enrollmentMethod", "Enrollment Method", "optionset", {
        options: choices("AUTOMATIC", "EMPLOYEE_OPT_IN", "HR_ASSIGNED"),
      }),
      field("waitingPeriodDays", "Waiting Period (Days)", "number"),
      field("enrollmentWindowDays", "Enrollment Window (Days)", "number"),
      field("dependentCoverage", "Dependent Coverage", "boolean"),
      field("payrollVisible", "Payroll Visible", "boolean"),
      field("taxable", "Taxable", "boolean"),
      field("payslipVisible", "Payslip Visible", "boolean"),
      field("employeeVisible", "Employee Visible", "boolean"),
      field("sensitive", "Sensitive", "boolean"),
      field("requiredForPayroll", "Required for Payroll", "boolean"),
      field("defaultBalance", "Default Balance", "currency"),
      field("renewalPeriod", "Renewal Period", "optionset", {
        options: [
          { value: "NONE", label: "No Renewal" },
          { value: "MONTHLY", label: "Monthly" },
          { value: "QUARTERLY", label: "Quarterly" },
          { value: "ANNUAL", label: "Annual" },
          { value: "CUSTOM", label: "Custom" },
        ],
      }),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("organizationId", "Organization", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("departmentId", "Department", "lookup"),
      field("locationId", "Work Site", "lookup"),
      field("employeeLevelId", "Employee Level", "lookup"),
      field("employeeType", "Employment Type", "optionset", {
        options: choices(
          "FULL_TIME",
          "PART_TIME",
          "CONTRACT",
          "INTERN",
          "CONSULTANT",
        ),
      }),
      field(
        "requiresProbationCompletion",
        "Probation Completion Required",
        "boolean",
      ),
      field("autoAssignOnHire", "Assign on Hire", "boolean"),
      field("autoAssignOnPromotion", "Assign on Promotion", "boolean"),
      field("requiresAssignmentApproval", "Assignment Approval", "boolean"),
      field("eligibilityRules", "Eligibility Rule Builder", "json"),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("version", "Version", "number", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "benefit-summary",
        label: "Summary",
        tabKey: "summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          { key: "benefitType", required: true },
          "provider",
          "organizationId",
          "legalEntityId",
          { key: "currencyCode", required: true },
          { key: "status", required: true },
          { key: "ownerUserId", required: true },
          { key: "effectiveFrom", required: true },
          "effectiveTo",
          "isDefault",
          "description",
        ],
      }),
      formSection({
        id: "benefit-eligibility",
        label: "Eligibility",
        tabKey: "eligibility",
        order: 20,
        columns: 2,
        fields: [
          "organizationId",
          "businessUnitId",
          "departmentId",
          "locationId",
          "employeeLevelId",
          "employeeType",
          "minimumServiceMonths",
          "requiresProbationCompletion",
          { key: "eligibilityRules", columnSpan: 2 },
        ],
      }),
      formSection({
        id: "benefit-contributions",
        label: "Contributions",
        tabKey: "contributions",
        order: 30,
        columns: 2,
        fields: [
          "valueType",
          "fixedAmount",
          "percentage",
          "employeeContributionMethod",
          "employeeContributionAmount",
          "employeeContributionPercent",
          "employerContributionMethod",
          "employerContributionAmount",
          "employerContributionPercent",
          "basePayComponentId",
          "contributionMinimum",
          "contributionMaximum",
          "contributionFrequency",
        ],
      }),
      formSection({
        id: "benefit-payroll",
        label: "Payroll Integration",
        tabKey: "payroll-integration",
        order: 40,
        columns: 2,
        fields: [
          "payrollVisible",
          "payrollCategory",
          "employeePayComponentId",
          "employerPayComponentId",
          "taxTreatment",
          "postingCategory",
          "payslipVisible",
          "includeInEmployerCost",
          "prorationMethod",
          "arrearsHandling",
        ],
      }),
      formSection({
        id: "benefit-enrollment",
        label: "Enrollment",
        tabKey: "enrollment",
        order: 50,
        columns: 2,
        fields: [
          "enrollmentMethod",
          "waitingPeriodDays",
          "enrollmentWindowDays",
          "dependentCoverage",
          "autoAssignOnHire",
          "autoAssignOnPromotion",
          "requiresAssignmentApproval",
        ],
      }),
      formSection({
        id: "benefit-limits",
        label: "Limits",
        tabKey: "limits",
        order: 60,
        columns: 2,
        fields: [
          "defaultBalance",
          "renewalPeriod",
          "renewalIntervalMonths",
          "expiresAfterMonths",
          "contributionMinimum",
          "contributionMaximum",
        ],
      }),
      formSection({
        id: "benefit-usage",
        label: "Usage",
        tabKey: "usage",
        order: 80,
        columns: 2,
        fields: [
          { key: "status", readonly: true },
          { key: "isDefault", readonly: true },
        ],
      }),
      formSection({
        id: "benefit-audit",
        label: "Audit",
        tabKey: "audit",
        order: 90,
        columns: 3,
        fields: [
          { key: "createdById", readonly: true },
          { key: "updatedById", readonly: true },
          { key: "createdAt", readonly: true },
          { key: "updatedAt", readonly: true },
          { key: "version", readonly: true },
        ],
      }),
    ],
    relatedTabs: [
      {
        tabKey: "assignments",
        label: "Assignments",
        order: 70,
        relationshipName: "benefit_plan_assignments",
        relatedEntityLogicalName: "employeeBenefitAssignment",
        targetFieldLogicalName: "benefitPolicyId",
        columns: [
          "employeeName",
          "status",
          "assignmentSource",
          "effectiveFrom",
          "effectiveTo",
        ],
        listPath: "/api/benefits/assignments?benefitPolicyId={parentId}",
        createPath: "/api/benefits/assignments",
        quickCreateFields: [
          {
            fieldLogicalName: "employeeId",
            label: "Employee",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "effectiveFrom",
            label: "Effective From",
            dataType: "date",
            required: true,
          },
          {
            fieldLogicalName: "effectiveTo",
            label: "Effective To",
            dataType: "date",
          },
        ],
        permissions: {
          create: "benefits.manage",
          update: "benefits.manage",
          delete: "benefits.manage",
        },
      },
    ],
    lookupSources: {
      currencyCode: "/api/configuration/currencies",
      organizationId: "/api/organizations",
      legalEntityId:
        "/api/organizations?isActive=true&organizationType=LEGAL_ENTITY",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      locationId: "/api/locations",
      employeeLevelId: "/api/employee-levels",
      employeePayComponentId: "/api/pay-components?isActive=true",
      employerPayComponentId: "/api/pay-components?isActive=true",
      basePayComponentId: "/api/pay-components?isActive=true",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
      employeeId: "/api/employees",
    },
    permissions: {
      read: "benefits.read",
      create: "benefits.manage",
      update: "benefits.manage",
    },
    initialValues: {
      name: "",
      code: "",
      benefitType: "MEDICAL",
      valueType: "FIXED_AMOUNT",
      payrollVisible: false,
      taxable: false,
      payslipVisible: true,
      employeeVisible: true,
      sensitive: false,
      requiredForPayroll: false,
      renewalPeriod: "NONE",
      effectiveFrom: "",
      status: "ACTIVE",
      employeeContributionMethod: "FIXED_AMOUNT",
      employerContributionMethod: "FIXED_AMOUNT",
      contributionFrequency: "MONTHLY",
      enrollmentMethod: "HR_ASSIGNED",
      waitingPeriodDays: 0,
      includeInEmployerCost: true,
      isDefault: false,
    },
    formatters: { effectiveFrom: "date", effectiveTo: "date" },
  }),
  adapter({
    key: "loan-policies",
    label: "Loan Plans",
    singular: "Loan Plan",
    serverApiPath: "/loan-policies",
    clientApiPath: "/api/loan-policies",
    fields: [
      field("name", "Name", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("loanType", "Loan Type", "optionset", {
        options: choices(
          "SALARY_ADVANCE",
          "PERSONAL_LOAN",
          "EMERGENCY_LOAN",
          "HOUSING_LOAN",
          "VEHICLE_LOAN",
          "EDUCATION_LOAN",
          "OTHER",
        ),
      }),
      field("organizationId", "Organization", "lookup"),
      field("legalEntityId", "Legal Entity", "lookup"),
      field("status", "Status", "optionset", {
        isStatus: true,
        options: statusOptions,
      }),
      field("ownerUserId", "Owner", "lookup", { isOwner: true }),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("isDefault", "Default Plan", "boolean"),
      field("currencyCode", "Currency", "lookup"),
      field("minimumAmount", "Minimum Amount", "currency"),
      field("maximumAmount", "Maximum Amount", "currency"),
      field("maximumInstallments", "Maximum Installments", "number"),
      field("minimumServiceMonths", "Minimum Service (Months)", "number"),
      field("minimumSalary", "Minimum Salary", "currency"),
      field("maximumActiveLoans", "Maximum Active Loans", "number"),
      field("probationCompleted", "Probation Completed", "boolean"),
      field("maximumSalaryMultiple", "Maximum Salary Multiple", "decimal"),
      field("interestMethod", "Interest Method", "optionset", {
        options: choices("NO_INTEREST", "FLAT", "REDUCING_BALANCE", "FORMULA"),
      }),
      field("interestRatePercent", "Interest Rate %", "decimal"),
      field("processingFee", "Processing Fee", "currency"),
      field("insuranceFee", "Insurance Fee", "currency"),
      field("gracePeriodDays", "Grace Period (Days)", "number"),
      field("repaymentFrequency", "Repayment Frequency", "optionset", {
        options: choices("WEEKLY", "BI_WEEKLY", "MONTHLY"),
      }),
      field("installmentMethod", "Installment Method", "optionset", {
        options: choices(
          "EQUAL_INSTALLMENTS",
          "FIXED_AMOUNT",
          "PERCENTAGE_OF_SALARY",
        ),
      }),
      field("fixedInstallment", "Fixed Installment", "currency"),
      field("percentageOfSalary", "Percentage of Salary", "decimal"),
      field(
        "maximumDeductionPercent",
        "Maximum Deduction Percentage",
        "decimal",
      ),
      field("skipPayrollAllowed", "Skip Payroll Allowed", "boolean"),
      field("allowEarlySettlement", "Early Settlement", "boolean"),
      field("settlementFee", "Settlement Fee", "currency"),
      field("arrearsHandling", "Arrears Handling", "optionset", {
        options: choices("CARRY_FORWARD", "EXTEND_TENURE", "BLOCK", "WAIVE"),
      }),
      field(
        "finalSettlementHandling",
        "Final Settlement Handling",
        "optionset",
        {
          options: choices(
            "DEDUCT_BALANCE",
            "CREATE_RECEIVABLE",
            "WAIVE",
            "BLOCK",
          ),
        },
      ),
      field("deductionPayComponentId", "Loan Deduction Component", "lookup"),
      field("interestPayComponentId", "Interest Component", "lookup"),
      field("feePayComponentId", "Fee Component", "lookup"),
      field("postingCategory", "Posting Category"),
      field("payslipVisible", "Payslip Visibility", "boolean"),
      field(
        "negativeNetPayHandling",
        "Negative Net Pay Handling",
        "optionset",
        { options: choices("BLOCK", "CAP_DEDUCTION", "CARRY_FORWARD", "WARN") },
      ),
      field("approvalRequired", "Approval Required", "boolean"),
      field("approvalWorkflowId", "Approval Workflow", "lookup"),
      field("minimumApprovers", "Minimum Approvers", "number"),
      field(
        "supportingDocumentRequired",
        "Supporting Document Required",
        "boolean",
      ),
      field("eligibilityRules", "Eligibility Rule Builder", "json"),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
      field("version", "Version", "number", { isReadOnly: true }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("updatedById", "Modified By", "lookup", { isReadOnly: true }),
      field("isActive", "Active", "boolean", { isStatus: true }),
    ],
    formSections: [
      formSection({
        id: "loan-summary",
        label: "Summary",
        tabKey: "summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", required: true },
          { key: "code", required: true },
          { key: "loanType", required: true },
          "organizationId",
          "legalEntityId",
          { key: "currencyCode", required: true },
          { key: "status", required: true },
          { key: "ownerUserId", required: true },
          "effectiveFrom",
          "effectiveTo",
          "isDefault",
          "description",
        ],
      }),
      formSection({
        id: "loan-eligibility",
        label: "Eligibility",
        tabKey: "eligibility",
        order: 20,
        columns: 2,
        fields: [
          "organizationId",
          "minimumServiceMonths",
          "minimumSalary",
          "maximumActiveLoans",
          "probationCompleted",
          { key: "eligibilityRules", columnSpan: 2 },
        ],
      }),
      formSection({
        id: "loan-financial",
        label: "Financial Terms",
        tabKey: "financial-terms",
        order: 30,
        columns: 2,
        fields: [
          "minimumAmount",
          "maximumAmount",
          "maximumSalaryMultiple",
          "interestMethod",
          "interestRatePercent",
          "processingFee",
          "insuranceFee",
          "gracePeriodDays",
          "maximumInstallments",
        ],
      }),
      formSection({
        id: "loan-repayment",
        label: "Repayment",
        tabKey: "repayment",
        order: 40,
        columns: 2,
        fields: [
          "repaymentFrequency",
          "installmentMethod",
          "fixedInstallment",
          "percentageOfSalary",
          "maximumDeductionPercent",
          "skipPayrollAllowed",
          "allowEarlySettlement",
          "settlementFee",
          "arrearsHandling",
          "finalSettlementHandling",
        ],
      }),
      formSection({
        id: "loan-payroll",
        label: "Payroll Integration",
        tabKey: "payroll-integration",
        order: 50,
        columns: 2,
        fields: [
          "deductionPayComponentId",
          "interestPayComponentId",
          "feePayComponentId",
          "postingCategory",
          "payslipVisible",
          "negativeNetPayHandling",
        ],
      }),
      formSection({
        id: "loan-approval",
        label: "Approval",
        tabKey: "approval",
        order: 60,
        columns: 2,
        fields: [
          "approvalRequired",
          "approvalWorkflowId",
          "minimumApprovers",
          "supportingDocumentRequired",
        ],
      }),
      formSection({
        id: "loan-usage",
        label: "Usage",
        tabKey: "usage",
        order: 80,
        columns: 2,
        fields: [
          { key: "status", readonly: true },
          { key: "isDefault", readonly: true },
        ],
      }),
      formSection({
        id: "loan-audit",
        label: "Audit",
        tabKey: "audit",
        order: 90,
        columns: 3,
        fields: [
          { key: "createdById", readonly: true },
          { key: "updatedById", readonly: true },
          { key: "createdAt", readonly: true },
          { key: "updatedAt", readonly: true },
          { key: "version", readonly: true },
        ],
      }),
    ],
    relatedTabs: [
      {
        tabKey: "assignments",
        label: "Assignments",
        order: 70,
        relationshipName: "loan_plan_requests",
        relatedEntityLogicalName: "loanRequest",
        targetFieldLogicalName: "loanPolicyId",
        columns: [
          "requestNumber",
          "employeeName",
          "requestedAmount",
          "installmentCount",
          "status",
          "requestedStartDate",
        ],
        listPath: "/api/loans?loanPolicyId={parentId}",
      },
    ],
    lookupSources: {
      currencyCode: "/api/configuration/currencies",
      organizationId: "/api/organizations?isActive=true",
      legalEntityId:
        "/api/organizations?isActive=true&organizationType=LEGAL_ENTITY",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      updatedById: "/api/users",
      deductionPayComponentId: "/api/pay-components?isActive=true",
      interestPayComponentId: "/api/pay-components?isActive=true",
      feePayComponentId: "/api/pay-components?isActive=true",
      approvalWorkflowId: "/api/approval-matrices?isActive=true",
    },
    permissions: {
      read: "loans.read-all",
      create: "loans.manage-policies",
      update: "loans.manage-policies",
    },
    initialValues: {
      name: "",
      code: "",
      loanType: "PERSONAL_LOAN",
      status: "ACTIVE",
      interestMethod: "NO_INTEREST",
      interestRatePercent: 0,
      repaymentFrequency: "MONTHLY",
      installmentMethod: "EQUAL_INSTALLMENTS",
      allowEarlySettlement: true,
      payslipVisible: true,
      negativeNetPayHandling: "BLOCK",
      approvalRequired: true,
      minimumApprovers: 1,
      isActive: true,
    },
  }),
  adapter({
    key: "banks",
    label: "Banks",
    singular: "Bank",
    serverApiPath: "/banks",
    clientApiPath: "/api/banks",
    fields: [
      ...namedCatalogFields,
      field("countryCode", "Country", "lookup"),
      field("swiftCode", "SWIFT Code"),
      field("routingCode", "Routing Code"),
    ],
    lookupSources: { countryCode: "/api/lookups/countries" },
    permissions: {
      read: "employee-bank-accounts.read",
      create: "employee-bank-accounts.manage",
      update: "employee-bank-accounts.manage",
    },
    initialValues: { name: "", code: "", countryCode: "", isActive: true },
  }),
  adapter({
    key: "payroll-banks",
    label: "Banks",
    singular: "Bank",
    serverApiPath: "/banks",
    clientApiPath: "/api/banks",
    routeBase: "/settings/payroll/banking/banks",
    fields: [
      field("name", "Bank", "string", { isPrimaryName: true }),
      field("code", "Bank Code"),
      field("countryCode", "Country", "lookup"),
      field("swiftCode", "SWIFT Code"),
      field("routingCode", "Routing Code"),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formFields: [
      "name",
      "code",
      "countryCode",
      "swiftCode",
      "routingCode",
      "isActive",
    ],
    columns: [
      "name",
      "code",
      "countryCode",
      "swiftCode",
      "routingCode",
      "isActive",
    ],
    lookupSources: { countryCode: "/api/lookups/countries" },
    permissions: {
      read: "payroll.settings.read",
      create: "payroll.settings.update",
      update: "payroll.settings.update",
    },
    initialValues: { name: "", code: "", countryCode: "", isActive: true },
  }),
  adapter({
    key: "employer-bank-accounts",
    label: "Employer Bank Accounts",
    singular: "Employer Bank Account",
    serverApiPath: "/payroll/employer-bank-accounts",
    clientApiPath: "/api/payroll/employer-bank-accounts",
    routeBase: "/settings/payroll/banking/employer-bank-accounts",
    primaryName: "accountName",
    statusField: "isActive",
    fields: [
      field("accountName", "Account Name", "string", { isPrimaryName: true }),
      field("bankId", "Bank", "lookup"),
      field("bankName", "Bank", "string", { isReadOnly: true }),
      field("accountTitle", "Account Title"),
      field("accountNumber", "Account Number"),
      field("iban", "IBAN"),
      field("branch", "Branch"),
      field("currencyCode", "Currency", "lookup"),
      field("accountPurpose", "Account Purpose", "optionset", {
        options: choices("PAYROLL", "OPERATING", "TAX", "BENEFITS", "OTHER"),
      }),
      field("isDefaultPayrollAccount", "Default Payroll Account", "boolean"),
      field("paymentFileFormat", "Payment File Format", "optionset", {
        options: choices(
          "CSV",
          "EXCEL",
          "GENERIC_BANK_TRANSFER",
          "BANK_PORTAL",
        ),
      }),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isStatus: true }),
    ],
    formFields: [
      "accountName",
      "bankId",
      "accountTitle",
      "accountNumber",
      "iban",
      "branch",
      "currencyCode",
      "accountPurpose",
      "isDefaultPayrollAccount",
      "paymentFileFormat",
      "description",
    ],
    columns: [
      "accountName",
      "bankName",
      "accountTitle",
      "iban",
      "currencyCode",
      "accountPurpose",
      "isDefaultPayrollAccount",
      "isActive",
    ],
    lookupSources: {
      bankId: "/api/banks",
      currencyCode: "/api/configuration/currencies",
    },
    permissions: {
      read: "payroll.settings.read",
      create: "payroll.settings.update",
      update: "payroll.settings.update",
    },
    initialValues: {
      accountName: "",
      accountTitle: "",
      currencyCode: "",
      accountPurpose: "PAYROLL",
      isDefaultPayrollAccount: false,
      isActive: true,
    },
  }),
  adapter({
    key: "users",
    label: "Users",
    singular: "User",
    primaryId: "userId",
    primaryName: "fullName",
    serverApiPath: "/users",
    routeBase: "/settings/security-access/identities/users",
    ownerField: "ownerUserId",
    statusField: "status",
    subStatusField: "subStatus",
    fields: [
      field("fullName", "Full Name", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("firstName", "First Name", "string"),
      field("lastName", "Last Name", "string"),
      field("email", "Email", "email"),
      field("linkedEmployeeName", "Linked Employee", "string", {
        isReadOnly: true,
      }),
      field("businessUnitName", "Business Unit", "string", {
        isReadOnly: true,
      }),
      field("status", "User Status", "optionset", {
        options: [
          { value: "ACTIVE", label: "Active" },
          { value: "INVITED", label: "Invited" },
          { value: "DISABLED", label: "Disabled" },
        ],
        isStatus: true,
      }),
      field("subStatus", "Sub Status", "optionset", {
        options: [
          { value: "OPEN", label: "Open" },
          { value: "PENDING_INVITATION", label: "Pending Invitation" },
          { value: "DISABLED", label: "Disabled" },
        ],
      }),
      field("isServiceAccount", "Service Account", "boolean"),
      field("accountType", "User Type", "optionset", {
        options: [
          { value: "TENANT_OWNER", label: "Tenant Owner" },
          { value: "EMPLOYEE_USER", label: "Employee User" },
          { value: "ADMINISTRATOR", label: "Administrator" },
          { value: "EXTERNAL_USER", label: "External User" },
          { value: "SERVICE_ACCOUNT", label: "Service Account" },
          { value: "INTEGRATION_ACCOUNT", label: "Integration Account" },
        ],
      }),
      field("lastLoginAt", "Last Login", "datetime", { isReadOnly: true }),
      field("createdAt", "Created On", "datetime", { isReadOnly: true }),
      field("ownerUserId", "Record Owner", "lookup", {
        isOwner: true,
        isReadOnly: true,
      }),
      field("createdById", "Created By", "lookup", { isReadOnly: true }),
      field("timezone", "Timezone", "lookup"),
      field("roleId", "Role", "lookup", {
        lookupTargetEntityLogicalName: "settings_roles",
      }),
      field("teamId", "Access Team", "lookup", {
        lookupTargetEntityLogicalName: "settings_teams",
      }),
      field("language", "Language", "optionset", {
        options: [
          { value: "en", label: "English" },
          { value: "ar", label: "Arabic" },
          { value: "ur", label: "Urdu" },
        ],
      }),
      field("dateFormat", "Date Format", "optionset", {
        options: [
          { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
          { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
          { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
        ],
      }),
      field("timeFormat", "Time Format", "optionset", {
        options: [
          { value: "12h", label: "12 hour" },
          { value: "24h", label: "24 hour" },
        ],
      }),
    ],
    formSections: [
      formSection({
        id: "user-identity",
        label: "Identity",
        order: 10,
        columns: 2,
        fields: [
          { key: "firstName", required: true },
          { key: "lastName", required: true },
          { key: "email", required: true },
          { key: "accountType", readonly: true },
        ],
      }),
    ],
    columns: [
      "fullName",
      "email",
      "linkedEmployeeName",
      "businessUnitName",
      "accountType",
      "status",
      "lastLoginAt",
      "createdAt",
    ],
    lookupSources: {
      timezone: "/api/configuration/timezones",
      ownerUserId: "/api/users",
      createdById: "/api/users",
      roleId: "/api/roles",
      teamId: "/api/teams?teamType=ACCESS",
    },
    permissions: {
      read: "users.read",
      create: "users.create",
      update: "users.update",
    },
    initialValues: {
      email: "",
      firstName: "",
      lastName: "",
      status: "INVITED",
      subStatus: "PENDING_INVITATION",
      accountType: "EMPLOYEE_USER",
      isServiceAccount: false,
      timezone: "",
      language: "en",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "12h",
    },
    formatters: { lastLoginAt: "datetime", createdAt: "datetime" },
    transfer: { import: true, export: true, exportTemplate: true },
    widgets: [
      {
        id: "user-security",
        label: "Security",
        widgetType: "user_security",
        tabKey: "security",
        columnSpan: 3,
      },
      {
        id: "user-employee-link",
        label: "Employee Link",
        widgetType: "user_employee_link",
        tabKey: "employee-link",
        columnSpan: 3,
      },
      {
        id: "user-sessions",
        label: "Sessions",
        widgetType: "user_sessions",
        tabKey: "sessions",
        columnSpan: 3,
        dataSource: { apiPath: "/api/users/{recordId}/sessions" },
      },
      {
        id: "user-login-history",
        label: "Login History",
        widgetType: "user_login_history",
        tabKey: "login-history",
        columnSpan: 3,
        dataSource: { apiPath: "/api/users/{recordId}/login-history" },
      },
    ],
    relatedTabs: [
      {
        tabKey: "roles",
        label: "Roles",
        order: 30,
        relationshipName: "user_roles",
        relatedEntityLogicalName: "settings_user_roles",
        targetFieldLogicalName: "userId",
        columns: [
          "roleName",
          "roleDescription",
          "roleType",
          "accessLevel",
          "assignedOn",
        ],
        columnLabels: {
          roleName: "Role",
          roleDescription: "Description",
          roleType: "Role Type",
          accessLevel: "Access Level",
          assignedOn: "Assigned On",
        },
        pageSize: 5,
        listPath: "/api/users/{parentId}/roles",
        createPath: "/api/users/{parentId}/roles",
        deletePath: "/api/users/{parentId}/roles/{recordId}",
        assignment: {
          lookupFieldLogicalName: "roleId",
          optionsPath: "/api/roles",
          title: "Assign Roles",
          optionLabelField: "name",
          optionDescriptionField: "description",
          optionMetaFields: ["roleType", "accessLevel"],
          assignedValueField: "roleId",
        },
        permissions: {
          create: "users.assign-roles",
          delete: "users.assign-roles",
        },
      },
      {
        tabKey: "access-teams",
        label: "Access Teams",
        order: 40,
        relationshipName: "user_access_teams",
        relatedEntityLogicalName: "settings_user_access_teams",
        targetFieldLogicalName: "userId",
        columns: [
          "accessTeamName",
          "accessTeamDescription",
          "teamType",
          "isOwner",
          "joinedOn",
        ],
        columnLabels: {
          accessTeamName: "Access Team",
          accessTeamDescription: "Description",
          teamType: "Team Type",
          isOwner: "Team Owner",
          joinedOn: "Joined On",
        },
        pageSize: 5,
        listPath: "/api/users/{parentId}/access-teams",
        createPath: "/api/users/{parentId}/access-teams",
        deletePath: "/api/users/{parentId}/access-teams/{recordId}",
        assignment: {
          lookupFieldLogicalName: "teamId",
          optionsPath: "/api/teams?teamType=ACCESS",
          title: "Assign Access Teams",
          optionLabelField: "accessTeamName",
          optionDescriptionField: "description",
          optionMetaFields: ["teamType", "membersCount", "rolesCount"],
          assignedValueField: "teamId",
          extraBooleanField: {
            fieldLogicalName: "isOwner",
            label: "Team Owner",
            defaultValue: false,
          },
        },
        permissions: {
          create: "users.assign-roles",
          delete: "users.assign-roles",
        },
      },
    ],
  }),
  adapter({
    key: "roles",
    label: "Roles",
    serverApiPath: "/roles",
    routeBase: "/settings/security-access/authorization/roles",
    primaryName: "name",
    fields: [
      field("name", "Role", "string", { isPrimaryName: true }),
      field("key", "Role Key", "string"),
      field("roleType", "Role Type", "optionset", {
        options: choices("SYSTEM", "CUSTOM"),
        isReadOnly: true,
      }),
      field("accessLevel", "Access Level", "optionset", {
        options: choices("USER", "BUSINESS_UNIT", "ORGANIZATION", "TENANT"),
      }),
      field("userCount", "Assigned Users", "number", { isReadOnly: true }),
      field("accessSummary", "Access Summary", "string", { isReadOnly: true }),
      field("description", "Description", "multiline-string"),
      field("isSystem", "System Role", "boolean", { isReadOnly: true }),
      field("isActive", "Active", "boolean", { isStatus: true }),
    ],
    columns: [
      "name",
      "key",
      "roleType",
      "accessLevel",
      "userCount",
      "accessSummary",
      "isActive",
    ],
    formFields: ["name", "key", "accessLevel", "description"],
    permissions: {
      read: "roles.read",
      create: "roles.create",
      update: "roles.update",
      delete: "roles.delete",
    },
    initialValues: { name: "", key: "", description: "", isActive: true },
    softDelete: true,
  }),
  adapter({
    key: "permissions",
    label: "Permissions",
    serverApiPath: "/permissions",
    routeBase: "/settings/security-access/authorization/permissions",
    mode: "read-only",
    fields: [
      field("name", "Permission", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("key", "Key", "string", { isReadOnly: true }),
      field("description", "Description", "multiline-string", {
        isReadOnly: true,
      }),
    ],
    permissions: { read: "permissions.read" },
  }),
  adapter({
    key: "access-teams",
    label: "Access Teams",
    singular: "Access Team",
    serverApiPath: "/teams?teamType=ACCESS",
    clientApiPath: "/api/teams?teamType=ACCESS",
    routeBase: "/settings/security-access/authorization/access-teams",
    primaryId: "id",
    primaryName: "name",
    fields: [
      field("name", "Access Team Name", "string", { isPrimaryName: true }),
      field("key", "Key", "string"),
      field("description", "Description", "multiline-string"),
      field("membersCount", "Members Count", "number", { isReadOnly: true }),
      field("rolesCount", "Roles Count", "number", { isReadOnly: true }),
      field("isSystem", "System", "boolean", { isReadOnly: true }),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("teamType", "Team Type", "optionset", {
        options: [{ value: "ACCESS", label: "Access" }],
      }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "access-team-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          { key: "name", label: "Access Team Name", required: true },
          "key",
          "description",
          { key: "isSystem", readonly: true },
          "isActive",
        ],
      }),
    ],
    columns: [
      "name",
      "key",
      "description",
      "membersCount",
      "rolesCount",
      "isActive",
      "updatedAt",
    ],
    permissions: {
      read: "teams.read",
      create: "teams.create",
      update: "teams.update",
      delete: "teams.delete",
    },
    initialValues: {
      name: "",
      key: "",
      description: "",
      teamType: "ACCESS",
      isActive: true,
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    relatedTabs: [
      {
        tabKey: "members",
        label: "Members",
        order: 20,
        relationshipName: "access_team_members",
        relatedEntityLogicalName: "settings_team_members",
        targetFieldLogicalName: "teamId",
        columns: ["userName", "userEmail", "isOwner", "joinedOn"],
        listPath: "/api/teams/{parentId}/members",
        createPath: "/api/teams/{parentId}/members",
        updatePath: "/api/teams/{parentId}/members/{recordId}",
        deletePath: "/api/teams/{parentId}/members/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "userId",
            label: "User",
            dataType: "lookup",
            required: true,
          },
          {
            fieldLogicalName: "isOwner",
            label: "Team Owner",
            dataType: "boolean",
          },
        ],
        permissions: {
          create: "teams.members.manage",
          update: "teams.members.manage",
          delete: "teams.members.manage",
        },
      },
      {
        tabKey: "roles",
        label: "Roles",
        order: 30,
        relationshipName: "access_team_roles",
        relatedEntityLogicalName: "settings_team_roles",
        targetFieldLogicalName: "teamId",
        columns: ["roleName", "roleDescription", "accessLevel", "assignedOn"],
        listPath: "/api/teams/{parentId}/roles",
        createPath: "/api/teams/{parentId}/roles",
        deletePath: "/api/teams/{parentId}/roles/{recordId}",
        quickCreateFields: [
          {
            fieldLogicalName: "roleId",
            label: "Role",
            dataType: "lookup",
            required: true,
          },
        ],
        permissions: {
          create: "teams.members.manage",
          delete: "teams.members.manage",
        },
      },
    ],
  }),
  adapter({
    key: "organization-teams",
    label: "Teams",
    singular: "Team",
    serverApiPath: "/teams?teamType=ORGANIZATIONAL",
    clientApiPath: "/api/teams?teamType=ORGANIZATIONAL",
    routeBase: "/settings/general-setup/organization/teams",
    primaryId: "id",
    primaryName: "name",
    fields: [
      field("name", "Team Name", "string", { isPrimaryName: true }),
      field("departmentId", "Department", "lookup"),
      field("ownerUserId", "Team Lead / Owner", "lookup"),
      field("employeesCount", "Employees Count", "number", {
        isReadOnly: true,
      }),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("teamType", "Team Type", "optionset", {
        options: [{ value: "ORGANIZATIONAL", label: "Organizational" }],
      }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "organization-team-summary",
        label: "Summary",
        order: 10,
        columnSpan: 2,
        columns: 3,
        fields: [
          { key: "name", label: "Team Name", required: true },
          { key: "departmentId", required: true },
          "ownerUserId",
          { key: "description", columnSpan: 3 },
        ],
      }),
    ],
    lookupSources: {
      departmentId: "/api/departments",
      ownerUserId: "/api/users",
    },
    columns: [
      "name",
      "departmentId",
      "ownerUserId",
      "employeesCount",
      "isActive",
      "updatedAt",
    ],
    permissions: {
      read: "teams.read",
      create: "teams.create",
      update: "teams.update",
      delete: "teams.delete",
    },
    initialValues: {
      name: "",
      description: "",
      teamType: "ORGANIZATIONAL",
      isActive: true,
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    widgets: [
      {
        id: "organization-team-hierarchy",
        label: "Hierarchy",
        widgetType: "organization_hierarchy",
        tabKey: "hierarchy",
        columnSpan: 3,
      },
    ],
    relatedTabs: [
      {
        tabKey: "employees",
        label: "Employees",
        order: 20,
        relationshipName: "organization_team_employees",
        relatedEntityLogicalName: "employees",
        targetFieldLogicalName: "teamId",
        columns: [
          "employeeCode",
          "fullName",
          "email",
          "departmentName",
          "designationName",
          "employmentStatus",
        ],
        listPath: "/api/employees?teamId={parentId}",
        permissions: {
          create: "employees.update",
          update: "employees.update",
          delete: "employees.update",
        },
      },
    ],
  }),
  adapter({
    key: "teams",
    label: "Access Teams",
    serverApiPath: "/teams",
    mode: "specialized",
    blocker:
      "Teams edit related members and roles with business-unit ownership rules.",
    specializedHref: "/settings/access/teams",
    fields: [
      ...namedCatalogFields,
      field("teamType", "Team Type", "optionset"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("ownerUserId", "Owner", "lookup"),
      field("isSystem", "System Team", "boolean", { isReadOnly: true }),
    ],
    lookupSources: {
      businessUnitId: "/api/business-units",
      ownerUserId: "/api/users",
    },
    permissions: {
      read: "teams.read",
      create: "teams.create",
      update: "teams.update",
      delete: "teams.delete",
    },
    initialValues: {
      name: "",
      key: "",
      teamType: "ORGANIZATIONAL",
      isActive: true,
    },
    softDelete: true,
  }),
  adapter({
    key: "notification-email-templates",
    label: "Notification Templates",
    singular: "Notification Template",
    serverApiPath: "/notifications/email-templates",
    mode: "specialized",
    blocker:
      "Template editing includes token validation, preview, clone, activation, archive, and test-send commands.",
    specializedHref: "/settings/notifications/templates",
    collectionKey: "items",
    fields: [
      field("name", "Template", "string", { isPrimaryName: true }),
      field("code", "Event Key"),
      field("subject", "Subject"),
      field("body", "Body", "multiline-string"),
      field("status", "Status", "optionset", {
        options: statusOptions,
        isStatus: true,
      }),
    ],
    permissions: {
      read: "notification.templates.read",
      create: "notification.templates.manage",
      update: "notification.templates.manage",
    },
    initialValues: {
      name: "",
      code: "",
      subject: "",
      body: "",
      status: "ACTIVE",
    },
  }),
  adapter({
    key: "notification-email-providers",
    label: "Email Providers",
    singular: "Email Provider",
    serverApiPath: "/notifications/email-providers",
    mode: "specialized",
    blocker:
      "Provider configuration includes secret handling, validation, default selection, and disable commands.",
    specializedHref: "/settings/notifications/providers",
    collectionKey: "items",
    fields: [
      field("name", "Provider", "string", { isPrimaryName: true }),
      field("providerType", "Provider Type", "optionset"),
      field("fromName", "Sender Name"),
      field("fromEmail", "Sender Email", "email"),
      field("isDefault", "Default", "boolean"),
      field("isEnabled", "Enabled", "boolean"),
    ],
    permissions: {
      read: "notification.providers.read",
      create: "notification.providers.manage",
      update: "notification.providers.manage",
    },
    initialValues: {
      name: "",
      providerType: "SMTP",
      fromName: "",
      fromEmail: "",
      isDefault: false,
      isEnabled: true,
    },
  }),
  adapter({
    key: "notification-email-logs",
    label: "Delivery Logs",
    singular: "Delivery Log",
    serverApiPath: "/notifications/email-delivery-logs",
    collectionKey: "items",
    supportsServerPagination: true,
    mode: "read-only",
    primaryName: "subject",
    fields: [
      field("subject", "Subject", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("recipient", "Recipient", "email", { isReadOnly: true }),
      field("status", "Status", "optionset", {
        isReadOnly: true,
        isStatus: true,
      }),
      field("providerMessageId", "Provider ID", "string", { isReadOnly: true }),
      field("createdAt", "Created", "datetime", { isReadOnly: true }),
    ],
    permissions: { read: "notification.logs.read" },
    formatters: { createdAt: "datetime" },
  }),
  adapter({
    key: "audit-logs",
    label: "Audit Events",
    singular: "Audit Event",
    serverApiPath: "/audit-logs",
    collectionKey: "items",
    supportsServerPagination: true,
    mode: "read-only",
    primaryName: "action",
    /*
     * BUG-2046 - this column set no longer offers Result, Failure Reason, IP
     * Address, App Client or Session ID.
     *
     * `AuditLog` has no such columns. The API projects all five by scraping
     * `afterSnapshot` for well-known keys, a convention only the auth module
     * follows, so they were blank on every non-authentication row - which reads
     * as data that went missing rather than data never captured. They are kept
     * on the Login History adapter below, where every row is an auth event and
     * every one of them is populated.
     *
     * The alternative was promoting `result` to a real column: an
     * expand/backfill/contract migration on the largest table in the product,
     * backfilling null for every historical row, and still empty for every
     * non-auth writer, because only an authentication event has a result.
     *
     * `actionLabel` replaces the raw `action` as the primary column so both
     * naming conventions read the same. `action` stays available as a field, as
     * stored, because that is what an export and an alert are keyed on.
     */
    fields: [
      field("actionLabel", "Action", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("action", "Action Code", "string", { isReadOnly: true }),
      field("entityType", "Record Type", "string", { isReadOnly: true }),
      field("entityId", "Record ID", "string", { isReadOnly: true }),
      field("userDisplayName", "User", "string", { isReadOnly: true }),
      field("email", "Email", "email", { isReadOnly: true }),
      field("sourceModule", "Source Module", "string", { isReadOnly: true }),
      field("requestId", "Request ID", "string", { isReadOnly: true }),
      field("traceId", "Trace ID", "string", { isReadOnly: true }),
      field("createdAt", "Occurred At", "datetime", { isReadOnly: true }),
    ],
    columns: [
      "actionLabel",
      "entityType",
      "userDisplayName",
      "sourceModule",
      "createdAt",
    ],
    formSections: [
      formSection({
        id: "audit-event-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          "actionLabel",
          "action",
          "userDisplayName",
          "email",
          "createdAt",
          "sourceModule",
        ],
      }),
      formSection({
        id: "audit-event-record",
        label: "Record",
        order: 20,
        columns: 2,
        fields: ["entityType", "entityId", "requestId", "traceId"],
      }),
    ],
    permissions: { read: "audit.read" },
    formatters: { createdAt: "datetime" },
  }),
  adapter({
    key: "document-categories",
    label: "Document Categories",
    singular: "Document Category",
    serverApiPath: "/documents/categories",
    clientApiPath: "/api/documents/categories",
    primaryId: "id",
    primaryName: "name",
    fields: [
      field("name", "Category Name", "string", { isPrimaryName: true }),
      field("code", "Code", "string", { isReadOnly: true }),
      field("appliesTo", "Applies To", "multi-optionset", {
        options: choices(
          "EMPLOYEE",
          "CANDIDATE",
          "ONBOARDING",
          "PAYROLL",
          "CONTRACT",
          "GENERAL",
        ),
      }),
      field("description", "Description", "multiline-string"),
      field("expirable", "Expirable", "boolean"),
      field("requiresVerification", "Requires Verification", "boolean"),
      field("defaultRetentionMonths", "Default Retention Months", "number"),
      field(
        "allowedExtensionsOverride",
        "Allowed Extensions Override",
        "string",
      ),
      field(
        "maximumUploadSizeOverrideMb",
        "Maximum Upload Size Override MB",
        "number",
      ),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("documentsCount", "Usage", "number", { isReadOnly: true }),
      field("updatedAt", "Modified On", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "document-category-summary",
        label: "Summary",
        order: 10,
        fields: [
          { key: "name", label: "Category Name", required: true },
          "appliesTo",
          "description",
          "expirable",
          "requiresVerification",
          "defaultRetentionMonths",
          "allowedExtensionsOverride",
          "maximumUploadSizeOverrideMb",
        ],
      }),
    ],
    columns: [
      "name",
      "appliesTo",
      "expirable",
      "requiresVerification",
      "isActive",
      "updatedAt",
    ],
    permissions: {
      read: "documents.read",
      create: "documents.categories.manage",
      update: "documents.categories.manage",
      delete: "documents.categories.manage",
    },
    initialValues: {
      name: "",
      code: "",
      appliesTo: ["GENERAL"],
      description: "",
      expirable: false,
      requiresVerification: false,
      isActive: true,
    },
    softDelete: true,
    transfer: { import: true, export: true, exportTemplate: true },
    relatedTabs: [
      {
        tabKey: "usage",
        label: "Usage",
        order: 20,
        relationshipName: "document_category_documents",
        relatedEntityLogicalName: "documents",
        targetFieldLogicalName: "documentCategoryId",
        columns: ["originalFileName", "title", "mimeType", "createdAt"],
        listPath: "/api/documents?documentCategoryId={parentId}",
      },
    ],
  }),
  recordAdapter(
    "employee-settings",
    "Employee Settings",
    "employees",
    employeeSettingsSections,
  ),
  recordAdapter(
    "attendance",
    "Attendance Settings",
    "attendance",
    attendanceSettingsSections,
  ),
  recordAdapter(
    "timesheets",
    "Timesheet Settings",
    "timesheets",
    timesheetSettingsSections,
  ),
  recordAdapter(
    "documents",
    "Document Settings",
    "documents",
    documentSettingsSections,
  ),
  recordAdapter(
    "payroll-settings",
    "Payroll Settings",
    "payroll",
    payrollSettingsSections,
  ),
  recordAdapter(
    "notifications",
    "Notification Rules",
    "notifications",
    notificationSettingsSections,
  ),
  recordAdapter(
    "system-preferences",
    "System Preferences",
    "system",
    systemSettingsSections,
  ),
  recordAdapter(
    "recruitment",
    "Recruitment & Onboarding",
    "recruitment",
    recruitmentSettingsSections,
  ),
  adapter({
    key: "subscription",
    label: "Subscription",
    serverApiPath: "/billing/subscription",
    fields: [field("name", "Subscription", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Subscription combines plan features, checkout, portal, and invoice commands that are not record CRUD.",
    specializedHref: "/settings/subscription/overview",
  }),
  adapter({
    key: "desktop-agent",
    label: "Desktop Agent",
    serverApiPath: "/agent/settings",
    fields: [field("name", "Desktop Agent", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Desktop Agent includes heartbeat/privacy/update command behavior that is not represented by generic field metadata.",
    specializedHref: "/settings/desktop-agent",
  }),
  adapter({
    key: "features",
    label: "Feature Access",
    serverApiPath: "/tenant-settings/features",
    fields: [field("name", "Feature", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Feature Access combines subscription entitlements with nullable tenant overrides and bulk availability rules.",
    specializedHref: "/settings/subscription/plans",
  }),
  adapter({
    key: "data-management",
    label: "Import & Export",
    serverApiPath: "/data-management/modules",
    collectionKey: "items",
    fields: [field("label", "Module", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Data management is a multi-step import and export workspace with file upload, column mapping, and background jobs, which the generic record renderer cannot express.",
    specializedHref: "/settings/data-management",
  }),
  adapter({
    key: "branding",
    label: "Branding",
    serverApiPath: "/tenant-settings/branding",
    fields: [field("name", "Branding", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Branding requires asset upload, live root-theme preview, and favicon/title synchronization beyond the generic record renderer.",
    specializedHref: "/settings/branding",
  }),
  adapter({
    key: "tables",
    label: "Modules",
    serverApiPath: "/customization/tables",
    fields: [field("name", "Module", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Module customization is a metadata designer with package layering and dependency validation.",
    specializedHref: "/settings/customization/modules",
  }),
  adapter({
    key: "sidebar",
    label: "Sidebar Designer",
    serverApiPath: "/navigation/sidebar",
    fields: [field("name", "Sidebar Entry", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "The sidebar is a reorderable layout with per-entry audience rules, not a list of records.",
    specializedHref: "/settings/customization/sidebar",
  }),
  adapter({
    key: "packages",
    label: "Packages",
    serverApiPath: "/customization/packages",
    fields: [field("name", "Package", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Package Explorer is a hierarchical metadata designer rather than record CRUD.",
    specializedHref: "/settings/customization/packages",
  }),
  adapter({
    key: "publish-center",
    label: "Publish Center",
    serverApiPath: "/customization/publish",
    fields: [field("name", "Publish", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Publish Center executes dependency validation and atomic package publishing.",
    specializedHref: "/settings/customization/publish-center",
  }),
  adapter({
    key: "login-history",
    label: "Login History",
    serverApiPath: "/audit-logs?entityType=AUTH_LOGIN",
    clientApiPath: "/api/audit-logs?entityType=AUTH_LOGIN",
    collectionKey: "items",
    supportsServerPagination: true,
    mode: "read-only",
    primaryName: "userDisplayName",
    fields: [
      field("userDisplayName", "User", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("email", "Email", "email", { isReadOnly: true }),
      field("action", "Event", "string", { isReadOnly: true }),
      field("result", "Result", "string", { isReadOnly: true }),
      field("failureReason", "Failure Reason", "string", {
        isReadOnly: true,
      }),
      field("ipAddress", "IP Address", "string", { isReadOnly: true }),
      field("appClientId", "App Client", "string", { isReadOnly: true }),
      field("sourceModule", "Source Module", "string", { isReadOnly: true }),
      field("userAgent", "Browser / User Agent", "string", {
        isReadOnly: true,
      }),
      field("sessionId", "Session ID", "string", { isReadOnly: true }),
      field("mfaResult", "MFA Result", "string", { isReadOnly: true }),
      field("entityId", "Auth Entity ID", "string", { isReadOnly: true }),
      field("requestId", "Request ID", "string", { isReadOnly: true }),
      field("traceId", "Trace ID", "string", { isReadOnly: true }),
      field("eventTime", "Event Time", "datetime", { isReadOnly: true }),
    ],
    formSections: [
      formSection({
        id: "login-history-summary",
        label: "Summary",
        order: 10,
        columns: 2,
        fields: [
          "eventTime",
          "result",
          "userDisplayName",
          "email",
          "action",
          "failureReason",
        ],
      }),
      formSection({
        id: "login-history-client",
        label: "Client",
        order: 20,
        columns: 2,
        fields: [
          "ipAddress",
          "appClientId",
          "mfaResult",
          "sessionId",
          "sourceModule",
          "entityId",
        ],
      }),
      formSection({
        id: "login-history-trace",
        label: "Trace",
        order: 30,
        columns: 2,
        fields: ["requestId", "traceId", "userAgent"],
      }),
    ],
    columns: [
      "eventTime",
      "userDisplayName",
      "email",
      "action",
      "result",
      "failureReason",
      "ipAddress",
      "appClientId",
      "mfaResult",
      "sessionId",
      "traceId",
      "requestId",
      "sourceModule",
      "userAgent",
    ],
    permissions: { read: "audit.read" },
    formatters: { eventTime: "datetime" },
  }),
  adapter({
    key: "data-access-history",
    label: "Data Access History",
    serverApiPath: "/audit-logs?entityType=DATA_ACCESS",
    collectionKey: "items",
    supportsServerPagination: true,
    mode: "read-only",
    primaryName: "action",
    fields: [
      field("action", "Action", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("entityType", "Record Type", "string", { isReadOnly: true }),
      field("entityId", "Record ID", "string", { isReadOnly: true }),
      field("createdAt", "Occurred At", "datetime", { isReadOnly: true }),
    ],
    permissions: { read: "audit.read" },
    formatters: { createdAt: "datetime" },
  }),
  adapter({
    key: "work-schedules",
    label: "Work Schedules",
    serverApiPath: "/work-schedules",
    fields: [
      field("name", "Work Schedule", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("isActive", "Active", "boolean", { isStatus: true }),
      field("isDefault", "Default", "boolean"),
      field("holidayCalendarId", "Work Calendar", "lookup"),
      field("defaultShiftTemplateId", "Default Shift", "lookup"),
      field("timezone", "Timezone", "lookup"),
      field("workWeekModel", "Work Week Model", "optionset", {
        options: workWeekModelOptions,
      }),
      field("weeklyWorkDays", "Working Days", "multi-optionset", {
        options: weekdayOptions,
      }),
      field("standardStartTime", "Standard Start", "time"),
      field("standardEndTime", "Standard End", "time"),
      field("minHoursPerDay", "Minimum Hours / Day", "decimal"),
      field("standardHoursPerWeek", "Standard Hours / Week", "decimal"),
      field("graceMinutes", "Grace Minutes", "number"),
      field("flexibleHours", "Flexible Hours", "boolean"),
      field("shiftBased", "Shift Based", "boolean"),
      field("effectiveStartDate", "Effective From", "date"),
      field("effectiveEndDate", "Effective To", "date"),
    ],
    formSections: [
      formSection({
        id: "work-schedule-identity",
        label: "Schedule Identity",
        order: 10,
        column: 1,
        fields: [
          { key: "name", required: true },
          "code",
          "description",
          "isActive",
          "isDefault",
        ],
      }),
      formSection({
        id: "work-schedule-calendar",
        label: "Calendar & Scope",
        order: 20,
        column: 2,
        fields: [
          "holidayCalendarId",
          "timezone",
          "effectiveStartDate",
          "effectiveEndDate",
        ],
      }),
      formSection({
        id: "work-schedule-pattern",
        label: "Weekly Pattern",
        order: 30,
        column: 1,
        fields: [
          "workWeekModel",
          "weeklyWorkDays",
          "defaultShiftTemplateId",
          "shiftBased",
          "flexibleHours",
        ],
      }),
      formSection({
        id: "work-schedule-hours",
        label: "Standard Hours",
        order: 40,
        column: 2,
        fields: [
          "standardStartTime",
          "standardEndTime",
          "minHoursPerDay",
          "standardHoursPerWeek",
          "graceMinutes",
        ],
      }),
    ],
    lookupSources: {
      holidayCalendarId: "/api/holiday-calendars",
      defaultShiftTemplateId: "/api/shift-templates",
      timezone: "/api/configuration/timezones",
    },
    columns: [
      "name",
      "code",
      "holidayCalendarId",
      "workWeekModel",
      "weeklyWorkDays",
      "isDefault",
      "isActive",
    ],
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
      delete: "settings.update",
    },
    initialValues: {
      name: "",
      code: "",
      isActive: true,
      isDefault: false,
      timezone: "UTC",
      workWeekModel: "FIVE_DAY",
      weeklyWorkDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      standardStartTime: "09:00",
      standardEndTime: "17:00",
      minHoursPerDay: 8,
      standardHoursPerWeek: 40,
      graceMinutes: 0,
      flexibleHours: false,
      shiftBased: true,
    },
    softDelete: true,
    formatters: {
      effectiveStartDate: "date",
      effectiveEndDate: "date",
      isActive: "boolean",
      isDefault: "boolean",
    },
  }),
  adapter({
    key: "fields",
    label: "Fields",
    serverApiPath: "/customization/columns",
    fields: [field("name", "Field", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Field design is package-layered metadata with dependency validation.",
    specializedHref: "/settings/customization/modules",
  }),
  adapter({
    key: "forms",
    label: "Forms",
    serverApiPath: "/customization/forms",
    fields: [field("name", "Form", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Form design requires drag/drop sections, tabs, related lists, and Widget placement.",
    specializedHref: "/settings/customization/modules",
  }),
  adapter({
    key: "views",
    label: "Views",
    serverApiPath: "/customization/views",
    fields: [field("name", "View", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "View design requires column ordering, filtering, sorting, and package layering.",
    specializedHref: "/settings/customization/modules",
  }),
  adapter({
    key: "action-bars",
    label: "Action Bars",
    serverApiPath: "/customization/action-bars",
    fields: [field("name", "Action Bar", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Action Bars use package-layered metadata and are configured in module context.",
    specializedHref: "/settings/customization/modules",
  }),
  adapter({
    key: "widgets",
    label: "Widgets",
    serverApiPath: "/customization/widgets",
    fields: [field("name", "Widget", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker: "Registered executable Widgets are reviewed in module context.",
    specializedHref: "/settings/customization/modules",
  }),
  adapter({
    key: "rules",
    label: "Rules",
    serverApiPath: "/customization/rules",
    fields: [field("name", "Rule", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Normalized Rule storage and full designer CRUD are not available yet.",
  }),
  adapter({
    key: "compliance-exports",
    label: "Compliance Exports",
    serverApiPath: "/audit/compliance-exports",
    fields: [
      field("name", "Compliance Export", "string", { isPrimaryName: true }),
    ],
    mode: "specialized",
    blocker:
      "Signed compliance export packaging and retention-safe download storage are not available yet.",
  }),
];

const duplicateAdapterKeys = adapters
  .map((item) => item.key)
  .filter((key, index, keys) => keys.indexOf(key) !== index);
if (duplicateAdapterKeys.length) {
  throw new Error(
    `Duplicate Settings Runtime adapters: ${[...new Set(duplicateAdapterKeys)].join(", ")}`,
  );
}

const invalidAdapters = adapters.flatMap((item) => {
  const errors: string[] = [];
  const fieldNames = new Set(
    item.spec.fields.map((field) => field.logicalName),
  );
  if (!item.serverApiPath.startsWith("/")) errors.push("API path");
  if (!item.spec.permissions?.read) errors.push("read permission");
  if (item.spec.fields.length === 0) errors.push("field metadata");
  if (item.mode === "specialized" && !item.blocker && !item.specializedHref) {
    errors.push("blocker or specialized route");
  }
  for (const fieldName of item.spec.formFields ?? []) {
    if (!fieldNames.has(fieldName)) errors.push(`form field ${fieldName}`);
  }
  for (const fieldName of Object.keys(item.lookupSources)) {
    if (!fieldNames.has(fieldName)) errors.push(`lookup field ${fieldName}`);
  }
  for (const fieldName of fieldNames) {
    if (!item.validationMapping[fieldName])
      errors.push(`validation mapping ${fieldName}`);
  }
  return errors.length ? [`${item.key}: ${errors.join(", ")}`] : [];
});
if (invalidAdapters.length) {
  throw new Error(
    `Invalid Settings Runtime adapters: ${invalidAdapters.join("; ")}`,
  );
}

export const settingsAdapterRegistry = new Map(
  adapters.map((item) => [item.key, item]),
);

export function getSettingsAdapter(key: string) {
  return settingsAdapterRegistry.get(key) ?? null;
}

export function readSettingsRecords(
  value: unknown,
  collectionKey?: string,
  adapter?: SettingsRuntimeAdapter,
): Readonly<Record<string, unknown>>[] {
  if (Array.isArray(value))
    return value
      .filter(isRecord)
      .map((record) => normalizeSettingsRecord(record, adapter));
  if (!isRecord(value)) return [];
  if (collectionKey && Array.isArray(value[collectionKey]))
    return value[collectionKey]
      .filter(isRecord)
      .map((record) => normalizeSettingsRecord(record, adapter));
  for (const key of ["items", "records", "data", "results"]) {
    if (Array.isArray(value[key]))
      return value[key]
        .filter(isRecord)
        .map((record) => normalizeSettingsRecord(record, adapter));
  }
  return [];
}

/*
 * Builds the API path a settings list fetches.
 *
 * Lives here rather than in the page component so it can be tested. BUG-2043
 * was a wrong query string, and a wrong query string is exactly the kind of
 * defect `tsc` cannot see.
 */
export function settingsListApiPath(
  adapter: SettingsRuntimeAdapter,
  requestedPage?: { readonly page: number; readonly pageSize: number },
) {
  const wantsActiveOnly = shouldDefaultToActiveRecords(adapter);
  const wantsPagination = Boolean(
    requestedPage && adapter.supportsServerPagination,
  );
  if (!wantsActiveOnly && !wantsPagination) return adapter.serverApiPath;

  const [path, query = ""] = adapter.serverApiPath.split("?", 2);
  const params = new URLSearchParams(query);

  if (wantsActiveOnly) {
    if (!params.has("isActive") && !params.has("includeInactive")) {
      params.set("isActive", "true");
    }

    params.delete("includeInactive");
  }

  if (requestedPage && wantsPagination) {
    params.set("page", String(requestedPage.page));
    /*
     * The audit and delivery-log query DTOs both cap `pageSize` at 100, and an
     * over-cap value is a 400 rather than a clamp. The table only offers
     * 10/25/50/100, but the value arrives from the URL and a hand-typed one
     * must not take the screen down.
     */
    params.set("pageSize", String(Math.min(requestedPage.pageSize, 100)));
  }

  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function shouldDefaultToActiveRecords(adapter: SettingsRuntimeAdapter) {
  return (
    adapter.softDelete &&
    adapter.spec.fields.some((field) => field.logicalName === "isActive")
  );
}

/*
 * BUG-2043 - reads the server's pagination envelope off a list response.
 *
 * Two shapes are in use and both are answered here: the audit module nests the
 * counts under `meta`, the notifications module returns them flat beside
 * `items`. A response carrying neither returns null, and the caller then keeps
 * client pagination - which is the honest mode there, because the whole
 * collection really was loaded.
 */
export function readSettingsListPagination(value: unknown): {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
} | null {
  if (!isRecord(value)) return null;
  const envelope = isRecord(value.meta) ? value.meta : value;
  const total = envelope.total;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
    return null;
  }

  const page = positiveIntegerOr(envelope.page, 1);
  const pageSize = positiveIntegerOr(envelope.pageSize, 1);

  return {
    page,
    pageSize,
    total,
    totalPages: positiveIntegerOr(
      envelope.totalPages,
      Math.max(1, Math.ceil(total / pageSize)),
    ),
  };
}

function positiveIntegerOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

export function readSettingsRecord(
  value: unknown,
  adapter?: SettingsRuntimeAdapter,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return {};
  return normalizeSettingsRecord(
    isRecord(value.data) ? value.data : value,
    adapter,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSettingsRecord(
  record: Readonly<Record<string, unknown>>,
  adapter?: SettingsRuntimeAdapter,
) {
  if (adapter?.key === "roles") return normalizeRoleRecord(record);
  if (
    adapter?.key === "employee-levels" ||
    adapter?.key === "designations" ||
    adapter?.key === "employment-types" ||
    adapter?.key === "leave-policies" ||
    adapter?.key === "document-categories"
  ) {
    return normalizeMasterDataRecord(record, adapter.key);
  }

  return record;
}

function normalizeMasterDataRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const next = { ...record };
  const count = isRecord(next._count) ? next._count : {};
  if (
    key === "designations" &&
    typeof next.code !== "string" &&
    typeof next.level === "string"
  ) {
    next.code = next.level;
  }
  if (key === "designations") {
    next.employeesCount = numberOrZero(count.employees);
  }
  if (key === "employee-levels") {
    next.employeesCount = numberOrZero(count.employees);
    next.designationsCount = numberOrZero(count.designations);
  }
  if (key === "employment-types") {
    next.employeesCount = numberOrZero(count.employees);
  }
  if (key === "leave-policies") {
    next.rulesCount = numberOrZero(count.rules);
    next.assignedEmployeesCount =
      typeof next.assignedEmployeesCount === "number"
        ? next.assignedEmployeesCount
        : numberOrZero(count.assignments);
  }
  if (key === "document-categories") {
    next.documentsCount = numberOrZero(count.documents);
  }
  return next;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRoleRecord(record: Readonly<Record<string, unknown>>) {
  const rolePrivileges = Array.isArray(record.rolePrivileges)
    ? record.rolePrivileges
    : [];
  const rolePermissions = Array.isArray(record.rolePermissions)
    ? record.rolePermissions
    : [];
  const miscPermissions = Array.isArray(record.miscPermissions)
    ? record.miscPermissions
    : [];
  const userRoles = Array.isArray(record.userRoles) ? record.userRoles : [];
  const matrixPrivilegeCount = rolePrivileges.filter(
    (item) => isRecord(item) && item.accessLevel !== "NONE",
  ).length;
  const legacyPermissionCount = rolePermissions.length;
  const adminSwitchCount = miscPermissions.filter(
    (item) => isRecord(item) && item.enabled === true,
  ).length;
  const primaryAccessCount =
    matrixPrivilegeCount > 0 ? matrixPrivilegeCount : legacyPermissionCount;
  const accessLabel =
    matrixPrivilegeCount > 0
      ? `${matrixPrivilegeCount} matrix privileges`
      : `${legacyPermissionCount} permissions`;
  const switchLabel = `${adminSwitchCount} admin switch${
    adminSwitchCount === 1 ? "" : "es"
  }`;

  return {
    ...record,
    accessSummary: `${accessLabel} - ${switchLabel}`,
    userCount: userRoles.length,
    accessCount: primaryAccessCount + adminSwitchCount,
  };
}
