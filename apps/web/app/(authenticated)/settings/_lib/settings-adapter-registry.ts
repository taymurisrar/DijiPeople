import { stableRuntimeMetadataId } from "@/lib/runtime/metadata-id";
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
  recruitmentSettingsSections,
  systemSettingsSections,
} from "./settings-page-config";
import { organizationSettingsSections } from "./organization-settings-config";

export type SettingsAdapterMode =
  | "crud"
  | "read-only"
  | "record"
  | "specialized";

type RuntimeSettingsSection = {
  readonly title: string;
  readonly fields: readonly {
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
  specializedHref?: string;
};

const statusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
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

function field(
  logicalName: string,
  displayName: string,
  dataType: StandardModuleFieldSpec["dataType"] = "string",
  extra: Partial<StandardModuleFieldSpec> = {},
): StandardModuleFieldSpec {
  return { logicalName, displayName, dataType, ...extra };
}

function formSection(input: {
  id: string;
  label: string;
  order: number;
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
      }
  )[];
}): FormSectionMetadata {
  return {
    id: input.id,
    tabKey: "general",
    label: input.label,
    order: input.order,
    layout: input.columns && input.columns > 1 ? "two-column" : "single-column",
    columns: input.columns ?? 1,
    column: input.column,
    columnSpan: input.columnSpan,
    fields: input.fields.map((item, index) => {
      const key = typeof item === "string" ? item : item.key;
      return {
        fieldLogicalName: key,
        label: typeof item === "string" ? undefined : item.label,
        order: (index + 1) * 10,
        isReadonly: typeof item === "string" ? undefined : item.readonly,
        requirementLevel:
          typeof item !== "string" && item.required ? "required" : undefined,
      };
    }),
  };
}

function adapter(input: {
  key: string;
  label: string;
  singular?: string;
  serverApiPath: string;
  clientApiPath?: string;
  primaryName?: string;
  primaryId?: string;
  fields: readonly StandardModuleFieldSpec[];
  formFields?: readonly string[];
  formSections?: readonly FormSectionMetadata[];
  columns?: readonly string[];
  lookupSources?: Readonly<Record<string, string>>;
  permissions?: StandardModuleRuntimeSpec["permissions"];
  initialValues?: Readonly<Record<string, unknown>>;
  collectionKey?: string;
  mode?: SettingsAdapterMode;
  softDelete?: boolean;
  timelineApiPath?: string;
  formatters?: SettingsRuntimeAdapter["displayFormatters"];
  transfer?: Partial<SettingsRuntimeAdapter["transfer"]>;
  blocker?: string;
  recordCategory?: string;
  specializedHref?: string;
}): SettingsRuntimeAdapter {
  const routeBase = `/settings-runtime/${input.key}`;
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
    singularLabel: input.singular ?? input.label.replace(/s$/, ""),
    routeBase,
    recordNavigation: mode !== "read-only",
    primaryIdField: input.primaryId,
    primaryNameField: input.primaryName ?? "name",
    fields: input.fields,
    formFields: input.formFields,
    formSections: input.formSections,
    lookupApiPaths: lookupSources,
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
      detail: mode === "crud" || mode === "record",
      create: mode === "crud" && Boolean(permissions.create),
      edit:
        (mode === "crud" || mode === "record") && Boolean(permissions.update),
    },
    timeline: Boolean(input.timelineApiPath),
    softDelete,
    blocker: input.blocker,
    recordCategory: input.recordCategory,
    specializedHref: input.specializedHref,
  };
}

function recordAdapter(
  key: string,
  label: string,
  recordCategory: string,
  sections: readonly RuntimeSettingsSection[],
): SettingsRuntimeAdapter {
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
    tabKey: "general",
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
    serverApiPath: `/tenant-settings/${recordCategory}`,
    clientApiPath: `/api/tenant-settings/${recordCategory}`,
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
  });
}

const tenantLookupPaths: Readonly<Record<string, string>> = {
  countries: "/api/lookups/countries",
  currencies: "/api/configuration/currencies",
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

function settingsFieldType(type: string): StandardModuleFieldSpec["dataType"] {
  if (type === "date") return "date";
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
  genericConfigurationAdapter("regions", "Regions"),
  genericConfigurationAdapter("fiscal-years", "Fiscal Years"),
  genericConfigurationAdapter("business-date-rules", "Business Date Rules"),
  genericConfigurationAdapter("field-security", "Field Security Rules"),
  genericConfigurationAdapter(
    "password-login-policies",
    "Password & Login Policies",
  ),
  genericConfigurationAdapter("salary-package-rules", "Salary Package Rules"),
  genericConfigurationAdapter("delegation-rules", "Delegation Rules"),
  genericConfigurationAdapter("escalation-rules", "Escalation Rules"),
  genericConfigurationAdapter("workflow-templates", "Workflow Templates"),
  genericConfigurationAdapter("retention-rules", "Retention Rules"),
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
    primaryId: "code",
    fields: [
      field("name", "Country", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("code", "ISO Code", "string", { isReadOnly: true }),
      field("phoneCode", "Calling Code", "string", { isReadOnly: true }),
      field("currencyCode", "Currency", "string", { isReadOnly: true }),
    ],
    permissions: { read: "settings.read" },
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
  }),
  adapter({
    key: "currencies",
    label: "Currencies",
    singular: "Currency",
    serverApiPath: "/configuration/currencies",
    clientApiPath: "/api/configuration/currencies",
    collectionKey: "items",
    mode: "read-only",
    primaryId: "code",
    fields: [
      field("name", "Currency", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("code", "ISO Code", "string", { isReadOnly: true }),
      field("symbol", "Symbol", "string", { isReadOnly: true }),
      field("decimalDigits", "Decimals", "number", { isReadOnly: true }),
    ],
    permissions: { read: "settings.read" },
  }),
  adapter({
    key: "organizations",
    label: "Organizations",
    serverApiPath: "/organizations",
    fields: [
      ...namedCatalogFields,
      field("parentOrganizationId", "Parent Organization", "lookup"),
    ],
    lookupSources: { parentOrganizationId: "/api/organizations" },
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
    },
    initialValues: { name: "", parentOrganizationId: null },
  }),
  adapter({
    key: "business-units",
    label: "Business Units",
    serverApiPath: "/business-units",
    fields: [
      ...namedCatalogFields,
      field("organizationId", "Organization", "lookup"),
      field("parentBusinessUnitId", "Parent Business Unit", "lookup"),
    ],
    lookupSources: {
      organizationId: "/api/organizations",
      parentBusinessUnitId: "/api/business-units",
    },
    permissions: {
      read: "settings.read",
      create: "settings.update",
      update: "settings.update",
    },
    initialValues: { name: "", organizationId: "", parentBusinessUnitId: null },
  }),
  adapter({
    key: "departments",
    label: "Departments",
    serverApiPath: "/departments",
    fields: [
      ...namedCatalogFields,
      field("defaultWorkScheduleId", "Default Work Schedule", "lookup"),
    ],
    lookupSources: { defaultWorkScheduleId: "/api/work-schedules" },
    permissions: {
      read: "departments.read",
      create: "departments.create",
      update: "departments.update",
      delete: "departments.update",
    },
    initialValues: {
      name: "",
      code: "",
      description: "",
      isActive: true,
      defaultWorkScheduleId: null,
    },
    softDelete: true,
  }),
  adapter({
    key: "designations",
    label: "Designations",
    serverApiPath: "/designations",
    fields: [
      ...namedCatalogFields,
      field("employeeLevelId", "Employee Level", "lookup"),
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
  }),
  adapter({
    key: "employee-levels",
    label: "Employee Levels",
    serverApiPath: "/employee-levels",
    fields: [...namedCatalogFields, field("rank", "Rank", "number")],
    permissions: {
      read: "employee-levels.read",
      create: "employee-levels.manage",
      update: "employee-levels.manage",
      delete: "employee-levels.manage",
    },
    initialValues: { name: "", code: "", rank: 0, isActive: true },
    softDelete: true,
  }),
  adapter({
    key: "locations",
    label: "Work Sites",
    singular: "Work Site",
    serverApiPath: "/locations",
    fields: [
      ...namedCatalogFields,
      field("addressLine1", "Address", "multiline-string"),
      field("city", "City"),
      field("state", "Region"),
      field("country", "Country", "lookup"),
      field("timezone", "Timezone", "lookup"),
      field("latitude", "Latitude", "decimal"),
      field("longitude", "Longitude", "decimal"),
      field("allowedRadiusMeters", "Allowed Radius (m)", "number"),
      field("defaultWorkScheduleId", "Default Work Schedule", "lookup"),
      field("holidayCalendarId", "Work Calendar", "lookup"),
    ],
    lookupSources: {
      country: "/api/lookups/countries",
      timezone: "/api/configuration/timezones",
      defaultWorkScheduleId: "/api/work-schedules",
      holidayCalendarId: "/api/holiday-calendars",
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
        fields: ["countryCode", "timezone", "weekendDays"],
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
      timezone: "/api/configuration/timezones",
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
    specializedHref: "/settings/holiday-calendars/manage",
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
      ...namedCatalogFields,
      field("category", "Category"),
      field("isPaid", "Paid", "boolean"),
      field("requiresApproval", "Requires Approval", "boolean"),
    ],
    permissions: {
      read: "leave-types.read",
      create: "leave-types.manage",
      update: "leave-types.manage",
    },
    initialValues: {
      name: "",
      code: "",
      category: "ANNUAL",
      isPaid: true,
      requiresApproval: true,
      isActive: true,
    },
  }),
  adapter({
    key: "leave-policies",
    label: "Leave Policies",
    serverApiPath: "/leave-policies",
    mode: "specialized",
    blocker:
      "Leave Policies include related rules and effective assignments that require generic related-list mutation support.",
    specializedHref: "/settings/leave-policies",
    fields: namedCatalogFields,
    permissions: {
      read: "leave-policies.read",
      create: "leave-policies.manage",
      update: "leave-policies.manage",
    },
    initialValues: { name: "", description: "", isActive: true },
  }),
  adapter({
    key: "approval-matrices",
    label: "Approval Matrices",
    serverApiPath: "/approval-matrices",
    mode: "specialized",
    blocker:
      "Approval Matrices edit ordered steps, conditions, assignments, and ANY_ONE/ALL behavior as one workflow designer.",
    specializedHref: "/settings/approval-matrices",
    fields: [
      field("name", "Matrix", "string", { isPrimaryName: true }),
      field("moduleKey", "Module", "optionset"),
      field("recordType", "Record Type"),
      field("sequence", "Sequence", "number"),
      field("approverType", "Approver Type", "optionset"),
      field("approverRoleId", "Approver Role", "lookup"),
      field("approverUserId", "Approver User", "lookup"),
      field("approvalMode", "Approval Mode", "optionset"),
      field("isActive", "Active", "boolean", { isStatus: true }),
    ],
    lookupSources: {
      approverRoleId: "/api/roles",
      approverUserId: "/api/users",
    },
    permissions: {
      read: "approval-matrices.read",
      create: "approval-matrices.manage",
      update: "approval-matrices.manage",
      delete: "approval-matrices.manage",
    },
    initialValues: {
      name: "",
      moduleKey: "",
      sequence: 1,
      approverType: "ROLE",
      approvalMode: "ANY_ONE",
      isActive: true,
    },
    softDelete: true,
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
      ...namedCatalogFields,
      field("componentType", "Type", "optionset", {
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
      field("displayOrder", "Display Order", "number"),
    ],
    permissions: {
      read: "pay-components.read",
      create: "pay-components.manage",
      update: "pay-components.manage",
    },
    initialValues: {
      name: "",
      code: "",
      componentType: "EARNING",
      calculationMethod: "FIXED",
      isTaxable: false,
      displayOnPayslip: true,
      isActive: true,
    },
  }),
  adapter({
    key: "claim-types",
    label: "Claim Types",
    serverApiPath: "/claims/types",
    mode: "specialized",
    blocker:
      "Claim Types own related subtypes, limits, and receipt rules that require generic related-list editing.",
    specializedHref: "/settings/claim-types",
    clientApiPath: "/api/claims/types",
    fields: [
      ...namedCatalogFields,
      field("currency", "Currency", "lookup"),
      field("maxAmount", "Maximum Amount", "currency"),
      field("receiptRequired", "Receipt Required", "boolean"),
    ],
    lookupSources: { currency: "/api/configuration/currencies" },
    permissions: {
      read: "claim-types.read",
      create: "claim-types.manage",
      update: "claim-types.manage",
    },
    initialValues: {
      name: "",
      code: "",
      currency: "",
      receiptRequired: true,
      isActive: true,
    },
    formatters: { maxAmount: "money", isActive: "boolean" },
  }),
  adapter({
    key: "overtime-policies",
    label: "Overtime Policies",
    serverApiPath: "/overtime-policies",
    fields: [
      ...namedCatalogFields,
      field("employeeLevelId", "Employee Level", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
      field("calculationPeriod", "Calculation Period", "optionset", {
        options: choices("DAILY", "WEEKLY", "MONTHLY"),
      }),
      field("thresholdHours", "Threshold Hours", "decimal"),
      field("rateMultiplier", "Rate Multiplier", "decimal"),
      field("requiresApproval", "Requires Approval", "boolean"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
    ],
    permissions: {
      read: "overtime-policies.read",
      create: "overtime-policies.manage",
      update: "overtime-policies.manage",
    },
    lookupSources: {
      employeeLevelId: "/api/employee-levels",
      businessUnitId: "/api/business-units",
    },
    initialValues: {
      name: "",
      code: "",
      calculationPeriod: "DAILY",
      thresholdHours: 8,
      rateMultiplier: 1.5,
      requiresApproval: true,
      effectiveFrom: "",
      isActive: true,
    },
  }),
  adapter({
    key: "travel-allowance-policies",
    label: "Travel Allowance Policies",
    serverApiPath: "/travel-allowance-policies",
    mode: "specialized",
    blocker:
      "Travel Allowance Policies own destination and allowance-type rules that require generic related-list editing.",
    specializedHref: "/settings/travel-allowance-policies",
    fields: [
      ...namedCatalogFields,
      field("currency", "Currency", "lookup"),
      field("dailyAllowance", "Daily Allowance", "currency"),
      field("accommodationAllowance", "Accommodation", "currency"),
    ],
    lookupSources: { currency: "/api/configuration/currencies" },
    permissions: {
      read: "tada-policies.read",
      create: "tada-policies.manage",
      update: "tada-policies.manage",
    },
    initialValues: { name: "", code: "", isActive: true },
  }),
  adapter({
    key: "time-payroll-policies",
    label: "Time Payroll Policies",
    serverApiPath: "/time-payroll-policies",
    fields: [
      ...namedCatalogFields,
      field("employeeLevelId", "Employee Level", "lookup"),
      field("businessUnitId", "Business Unit", "lookup"),
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
    permissions: {
      read: "time-payroll-policies.read",
      create: "time-payroll-policies.manage",
      update: "time-payroll-policies.manage",
    },
    lookupSources: {
      employeeLevelId: "/api/employee-levels",
      businessUnitId: "/api/business-units",
      countryCode: "/api/lookups/countries",
    },
    initialValues: {
      name: "",
      code: "",
      mode: "ATTENDANCE_AND_TIMESHEET_SEPARATE",
      standardHoursPerDay: 8,
      prorationBasis: "WORKING_DAYS",
      effectiveFrom: "",
      isActive: true,
    },
  }),
  adapter({
    key: "tax-rules",
    label: "Tax Regimes & Slabs",
    singular: "Tax Rule",
    serverApiPath: "/tax-rules",
    mode: "specialized",
    blocker:
      "Tax Rules own ordered brackets and pay-component relationships that require generic related-list editing.",
    specializedHref: "/settings/tax-rules",
    fields: [
      ...namedCatalogFields,
      field("countryCode", "Country", "lookup"),
      field("currency", "Currency", "lookup"),
      field("calculationType", "Calculation Type", "optionset"),
      field("rate", "Rate", "decimal"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
    ],
    lookupSources: {
      countryCode: "/api/lookups/countries",
      currency: "/api/configuration/currencies",
    },
    permissions: {
      read: "tax-rules.read",
      create: "tax-rules.manage",
      update: "tax-rules.manage",
    },
    initialValues: { name: "", code: "", isActive: true },
    formatters: {
      effectiveFrom: "date",
      effectiveTo: "date",
      isActive: "boolean",
    },
  }),
  adapter({
    key: "payroll-regions",
    label: "Payroll Regions",
    serverApiPath: "/payroll-regions",
    fields: [
      ...namedCatalogFields,
      field("countryCode", "Country", "lookup"),
      field("currency", "Currency", "lookup"),
      field("timezone", "Timezone", "lookup"),
    ],
    lookupSources: {
      countryCode: "/api/lookups/countries",
      currency: "/api/configuration/currencies",
      timezone: "/api/configuration/timezones",
    },
    permissions: {
      read: "payroll.settings.read",
      create: "payroll.settings.manage",
      update: "payroll.settings.manage",
    },
    initialValues: { name: "", code: "", isActive: true },
  }),
  adapter({
    key: "exchange-rates",
    label: "Exchange Rates",
    singular: "Exchange Rate",
    serverApiPath: "/exchange-rates",
    primaryName: "rateName",
    fields: [
      field("rateName", "Exchange Rate", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("fromCurrency", "From Currency", "lookup"),
      field("toCurrency", "To Currency", "lookup"),
      field("rate", "Rate", "decimal"),
      field("effectiveFrom", "Effective From", "date"),
      field("effectiveTo", "Effective To", "date"),
      field("isActive", "Active", "boolean", { isStatus: true }),
    ],
    lookupSources: {
      fromCurrency: "/api/configuration/currencies",
      toCurrency: "/api/configuration/currencies",
    },
    permissions: {
      read: "payroll.settings.read",
      create: "payroll.settings.manage",
      update: "payroll.settings.manage",
    },
    initialValues: {
      fromCurrency: "",
      toCurrency: "",
      rate: 1,
      effectiveFrom: "",
      isActive: true,
    },
    formatters: {
      effectiveFrom: "date",
      effectiveTo: "date",
      isActive: "boolean",
    },
  }),
  adapter({
    key: "gl-accounts",
    label: "GL Accounts",
    singular: "GL Account",
    serverApiPath: "/payroll/gl-accounts",
    fields: [
      ...namedCatalogFields,
      field("accountType", "Account Type", "optionset", {
        options: choices("ASSET", "LIABILITY", "EXPENSE", "EQUITY", "REVENUE"),
      }),
    ],
    permissions: {
      read: "payroll-gl.read",
      create: "payroll-gl.manage",
      update: "payroll-gl.manage",
    },
    initialValues: {
      name: "",
      code: "",
      accountType: "EXPENSE",
      isActive: true,
    },
  }),
  adapter({
    key: "posting-rules",
    label: "Posting Rules",
    serverApiPath: "/payroll/posting-rules",
    fields: [
      field("name", "Posting Rule", "string", { isPrimaryName: true }),
      field("lineItemCategory", "Line Category", "optionset", {
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
      field("taxRuleId", "Tax Rule", "lookup"),
      field("debitAccountId", "Debit Account", "lookup"),
      field("creditAccountId", "Credit Account", "lookup"),
      field("isActive", "Active", "boolean", { isStatus: true }),
    ],
    lookupSources: {
      payComponentId: "/api/pay-components",
      taxRuleId: "/api/tax-rules",
      debitAccountId: "/api/payroll/gl-accounts",
      creditAccountId: "/api/payroll/gl-accounts",
    },
    permissions: {
      read: "payroll-gl.read",
      create: "payroll-gl.manage",
      update: "payroll-gl.manage",
    },
    initialValues: { name: "", isActive: true },
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
    label: "Benefit Policies",
    singular: "Benefit Policy",
    serverApiPath: "/benefits/policies",
    clientApiPath: "/api/benefits/policies",
    fields: [
      field("name", "Benefit Policy", "string", { isPrimaryName: true }),
      field("code", "Code"),
      field("description", "Description", "multiline-string"),
      field("status", "Status", "optionset", {
        options: activeStatusOptions,
        isStatus: true,
      }),
      field("benefitType", "Benefit Type", "optionset", {
        options: [
          { value: "ALLOWANCE", label: "Allowance" },
          { value: "REIMBURSEMENT", label: "Reimbursement" },
          { value: "EMPLOYER_PAID", label: "Employer Paid" },
          { value: "PERK", label: "Perk" },
          { value: "EARNING", label: "Payroll Earning" },
          { value: "DEDUCTION", label: "Payroll Deduction" },
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
    ],
    lookupSources: {
      currencyCode: "/api/configuration/currencies",
      organizationId: "/api/organizations",
      businessUnitId: "/api/business-units",
      departmentId: "/api/departments",
      locationId: "/api/locations",
      employeeLevelId: "/api/employee-levels",
    },
    permissions: {
      read: "benefits.read",
      create: "benefits.manage",
      update: "benefits.manage",
    },
    initialValues: {
      name: "",
      code: "",
      benefitType: "ALLOWANCE",
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
    },
    formatters: { effectiveFrom: "date", effectiveTo: "date" },
  }),
  adapter({
    key: "loan-policies",
    label: "Loan Policies",
    singular: "Loan Policy",
    serverApiPath: "/loan-policies",
    clientApiPath: "/api/loan-policies",
    fields: [
      ...namedCatalogFields,
      field("currencyCode", "Currency", "lookup"),
      field("minimumAmount", "Minimum Amount", "currency"),
      field("maximumAmount", "Maximum Amount", "currency"),
      field("maximumInstallments", "Maximum Installments", "number"),
      field("interestRatePercent", "Interest Rate %", "decimal"),
      field("allowEarlySettlement", "Early Settlement", "boolean"),
    ],
    lookupSources: { currencyCode: "/api/configuration/currencies" },
    permissions: {
      read: "loans.read-all",
      create: "loans.manage-policies",
      update: "loans.manage-policies",
    },
    initialValues: {
      name: "",
      code: "",
      interestRatePercent: 0,
      allowEarlySettlement: true,
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
    key: "users",
    label: "Users",
    primaryId: "userId",
    primaryName: "email",
    serverApiPath: "/users",
    mode: "specialized",
    blocker:
      "User administration includes Employee linking, role/team membership, lifecycle commands, field security, and security timeline.",
    specializedHref: "/settings/security-access/users",
    fields: [
      field("email", "Email", "email", { isPrimaryName: true }),
      field("firstName", "First Name"),
      field("lastName", "Last Name"),
      field("status", "Status", "optionset", {
        options: statusOptions,
        isStatus: true,
      }),
      field("businessUnitId", "Business Unit", "lookup"),
      field("lastLoginAt", "Last Login", "datetime", { isReadOnly: true }),
    ],
    lookupSources: { businessUnitId: "/api/business-units" },
    permissions: {
      read: "users.read",
      create: "users.create",
      update: "users.update",
    },
    initialValues: { email: "", firstName: "", lastName: "", status: "ACTIVE" },
    formatters: { lastLoginAt: "datetime" },
    timelineApiPath: "/api/audit?entityType=User&entityId={recordId}",
  }),
  adapter({
    key: "roles",
    label: "Roles",
    serverApiPath: "/roles",
    mode: "specialized",
    blocker:
      "Role Designer edits privilege matrices, miscellaneous permissions, cloning, and reset commands atomically.",
    specializedHref: "/settings/access/roles",
    fields: [
      ...namedCatalogFields,
      field("isSystem", "System Role", "boolean", { isReadOnly: true }),
    ],
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
    key: "teams",
    label: "Teams",
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
    initialValues: { name: "", key: "", teamType: "OWNER", isActive: true },
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
    mode: "read-only",
    primaryName: "action",
    fields: [
      field("action", "Action", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("entityType", "Record Type", "string", { isReadOnly: true }),
      field("entityId", "Record ID", "string", { isReadOnly: true }),
      field("actorName", "Actor", "string", { isReadOnly: true }),
      field("createdAt", "Occurred At", "datetime", { isReadOnly: true }),
    ],
    permissions: { read: "audit.read" },
    formatters: { createdAt: "datetime" },
  }),
  recordAdapter(
    "employee-settings",
    "Employee Defaults",
    "employees",
    employeeSettingsSections,
  ),
  recordAdapter(
    "attendance",
    "Attendance Rules",
    "attendance",
    attendanceSettingsSections,
  ),
  recordAdapter(
    "documents",
    "Document Rules",
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
    key: "billing",
    label: "Billing",
    serverApiPath: "/billing/subscription",
    fields: [field("name", "Billing", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Billing combines subscription, checkout, portal, and invoice commands that are not record CRUD.",
    specializedHref: "/settings/billing",
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
    specializedHref: "/settings/features",
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
    serverApiPath: "/auth/activity",
    clientApiPath: "/api/auth/activity",
    collectionKey: "items",
    mode: "read-only",
    primaryName: "action",
    fields: [
      field("action", "Action", "string", {
        isPrimaryName: true,
        isReadOnly: true,
      }),
      field("email", "User", "email", { isReadOnly: true }),
      field("status", "Status", "string", { isReadOnly: true }),
      field("createdAt", "Occurred At", "datetime", { isReadOnly: true }),
    ],
    permissions: { read: "audit.read" },
    formatters: { createdAt: "datetime" },
  }),
  adapter({
    key: "data-access-history",
    label: "Data Access History",
    serverApiPath: "/audit-logs?entityType=DATA_ACCESS",
    collectionKey: "items",
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
    specializedHref: "/settings/customization/columns",
  }),
  adapter({
    key: "forms",
    label: "Forms",
    serverApiPath: "/customization/forms",
    fields: [field("name", "Form", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Form design requires drag/drop sections, tabs, related lists, and Widget placement.",
    specializedHref: "/settings/customization/forms",
  }),
  adapter({
    key: "views",
    label: "Views",
    serverApiPath: "/customization/views",
    fields: [field("name", "View", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "View design requires column ordering, filtering, sorting, and package layering.",
    specializedHref: "/settings/customization/views",
  }),
  adapter({
    key: "action-bars",
    label: "Action Bars",
    serverApiPath: "/customization/action-bars",
    fields: [field("name", "Action Bar", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "Normalized Action Bar component storage and designer persistence are not available yet.",
  }),
  adapter({
    key: "widgets",
    label: "Widgets",
    serverApiPath: "/customization/widgets",
    fields: [field("name", "Widget", "string", { isPrimaryName: true })],
    mode: "specialized",
    blocker:
      "System Widgets are package components; Custom Widget execution remains intentionally disabled.",
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
  if (adapter?.key !== "designations") return record;

  const next = { ...record };
  if (typeof next.code !== "string" && typeof next.level === "string") {
    next.code = next.level;
  }
  return next;
}
