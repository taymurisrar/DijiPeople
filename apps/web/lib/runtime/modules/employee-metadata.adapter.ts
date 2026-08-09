import type { CommandVisibilityRule } from "../command-runtime.types";
import type { RuntimeCustomizationForm } from "../../customization-forms";
import type { RuntimeCustomizationView } from "../../customization-views";
import type {
  EntityMetadata,
  FieldDataType,
  FieldMetadata,
  FormComponentMetadata,
  FormMetadata,
  FormSectionMetadata,
  OptionSetValueMetadata,
  ViewColumnMetadata,
  ViewMetadata,
} from "../metadata-runtime.types";
import { stableRuntimeMetadataId } from "../metadata-id";
import { createSystemWidgetComponent } from "../system-widget-metadata";
import type { ModuleMetadataBundle } from "../module-runtime.types";
import type { ModuleRuntimeContext } from "../module-runtime.types";
import type { RuntimePrincipal } from "../security-runtime.types";
import type { FieldSecurityRule } from "../security-runtime.types";
import type { TenantRuntimeConfig } from "../tenant-runtime.types";
import {
  employeeRuntimeCommands,
  employeeRuntimeModuleConfig,
  employeeRuntimePermissions,
} from "./employee.module";

const EMPLOYEE_STATUS_OPTIONS: readonly OptionSetValueMetadata[] = [
  { value: "ACTIVE", label: "Active", isDefault: true },
  { value: "INACTIVE", label: "Inactive" },
  { value: "PROBATION", label: "Probation" },
  { value: "NOTICE", label: "Notice" },
  { value: "TERMINATED", label: "Terminated" },
];

const EMPLOYEE_TYPE_OPTIONS: readonly OptionSetValueMetadata[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
  { value: "CONSULTANT", label: "Consultant" },
];

const WORK_MODE_OPTIONS: readonly OptionSetValueMetadata[] = [
  { value: "OFFICE", label: "Office" },
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
];

const CONTRACT_TYPE_OPTIONS: readonly OptionSetValueMetadata[] = [
  { value: "PERMANENT", label: "Permanent" },
  { value: "FIXED_TERM", label: "Fixed term" },
  { value: "FREELANCE", label: "Freelance" },
  { value: "TEMPORARY", label: "Temporary" },
];

const GENDER_OPTIONS: readonly OptionSetValueMetadata[] = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "NON_BINARY", label: "Non-binary" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];

const MARITAL_STATUS_OPTIONS: readonly OptionSetValueMetadata[] = [
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED", label: "Married" },
  { value: "DIVORCED", label: "Divorced" },
  { value: "WIDOWED", label: "Widowed" },
  { value: "SEPARATED", label: "Separated" },
];

const BLOOD_GROUP_OPTIONS: readonly OptionSetValueMetadata[] = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
];

const RECORD_STATUS_OPTIONS: readonly OptionSetValueMetadata[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active", isDefault: true },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
];

const RECORD_SUB_STATUS_OPTIONS: readonly OptionSetValueMetadata[] = [
  {
    value: "DATA_COLLECTION",
    label: "Data Collection",
    parentValue: "DRAFT",
    isDefault: true,
  },
  { value: "ONBOARDING", label: "Onboarding", parentValue: "DRAFT" },
  {
    value: "READY_FOR_ACTIVATION",
    label: "Ready for Activation",
    parentValue: "DRAFT",
  },
  { value: "PENDING_REVIEW", label: "Pending Review", parentValue: "DRAFT" },
  { value: "OPEN", label: "Open", parentValue: "ACTIVE", isDefault: true },
  { value: "IN_PROGRESS", label: "In Progress", parentValue: "ACTIVE" },
  { value: "COMPLETED", label: "Completed", parentValue: "ACTIVE" },
  { value: "INACTIVE", label: "Inactive", parentValue: "INACTIVE" },
  { value: "SUSPENDED", label: "Suspended", parentValue: "INACTIVE" },
  { value: "ARCHIVED", label: "Archived", parentValue: "ARCHIVED" },
  { value: "RETIRED", label: "Retired", parentValue: "ARCHIVED" },
];

type EmployeeRuntimeFieldValue =
  | string
  | number
  | boolean
  | readonly string[]
  | null
  | undefined;

export type EmployeeRuntimeFormValues = Record<
  string,
  EmployeeRuntimeFieldValue
>;

export type EmployeeRuntimeSettings = {
  readonly autoGenerateEmployeeId?: boolean;
  readonly requirePersonalEmail?: boolean;
  readonly requireEmergencyContact?: boolean;
  readonly requireJoiningDate?: boolean;
  readonly requireDepartment?: boolean;
  readonly requireDesignation?: boolean;
  readonly requireReportingManager?: boolean;
  readonly requireWorkLocation?: boolean;
  readonly allowEmployeeWithoutManager?: boolean;
};

type EmployeeFieldDefinition = {
  readonly logicalName: string;
  readonly displayName: string;
  readonly dataType: FieldDataType;
  readonly lookupEntity?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
};

const EMPLOYEE_FIELD_DEFINITIONS: readonly EmployeeFieldDefinition[] = [
  { logicalName: "id", displayName: "Record ID", dataType: "string" },
  {
    logicalName: "employeeCode",
    displayName: "Employee Code",
    dataType: "string",
    maxLength: 40,
  },
  {
    logicalName: "firstName",
    displayName: "First Name",
    dataType: "string",
    minLength: 1,
    maxLength: 60,
  },
  {
    logicalName: "middleName",
    displayName: "Middle Name",
    dataType: "string",
    maxLength: 60,
  },
  {
    logicalName: "lastName",
    displayName: "Last Name",
    dataType: "string",
    minLength: 1,
    maxLength: 60,
  },
  {
    logicalName: "preferredName",
    displayName: "Preferred Name",
    dataType: "string",
    maxLength: 60,
  },
  { logicalName: "fullName", displayName: "Full Name", dataType: "string" },
  { logicalName: "workEmail", displayName: "Work Email", dataType: "email" },
  {
    logicalName: "personalEmail",
    displayName: "Personal Email",
    dataType: "email",
  },
  {
    logicalName: "phone",
    displayName: "Phone",
    dataType: "phone",
    minLength: 7,
    maxLength: 30,
  },
  {
    logicalName: "alternatePhone",
    displayName: "Alternate Phone",
    dataType: "phone",
    maxLength: 30,
  },
  {
    logicalName: "dateOfBirth",
    displayName: "Date of Birth",
    dataType: "date",
  },
  { logicalName: "gender", displayName: "Gender", dataType: "optionset" },
  {
    logicalName: "maritalStatus",
    displayName: "Marital Status",
    dataType: "optionset",
  },
  {
    logicalName: "nationalityCountryId",
    displayName: "Nationality Country",
    dataType: "lookup",
    lookupEntity: "country",
  },
  {
    logicalName: "nationality",
    displayName: "Nationality",
    dataType: "string",
    maxLength: 100,
  },
  {
    logicalName: "cnic",
    displayName: "CNIC",
    dataType: "string",
    maxLength: 32,
  },
  {
    logicalName: "bloodGroup",
    displayName: "Blood Group",
    dataType: "optionset",
    maxLength: 10,
  },
  { logicalName: "hireDate", displayName: "Hire Date", dataType: "date" },
  { logicalName: "status", displayName: "Status", dataType: "optionset" },
  {
    logicalName: "subStatus",
    displayName: "Sub Status",
    dataType: "optionset",
  },
  {
    logicalName: "confirmationDate",
    displayName: "Confirmation Date",
    dataType: "date",
  },
  {
    logicalName: "probationEndDate",
    displayName: "Probation End Date",
    dataType: "date",
  },
  {
    logicalName: "terminationDate",
    displayName: "Termination Date",
    dataType: "date",
  },
  {
    logicalName: "ownerId",
    displayName: "Owner",
    dataType: "lookup",
    lookupEntity: "user",
  },
  {
    logicalName: "employmentStatus",
    displayName: "Employment Status",
    dataType: "optionset",
  },
  {
    logicalName: "reportingManagerEmployeeId",
    displayName: "Reporting Manager",
    dataType: "lookup",
    lookupEntity: "employee",
  },
  {
    logicalName: "organizationId",
    displayName: "Organization",
    dataType: "lookup",
    lookupEntity: "organization",
  },
  {
    logicalName: "businessUnitId",
    displayName: "Business Unit",
    dataType: "lookup",
    lookupEntity: "businessUnit",
  },
  {
    logicalName: "departmentId",
    displayName: "Department",
    dataType: "lookup",
    lookupEntity: "department",
  },
  {
    logicalName: "teamId",
    displayName: "Team",
    dataType: "lookup",
    lookupEntity: "team",
  },
  {
    logicalName: "designationId",
    displayName: "Designation",
    dataType: "lookup",
    lookupEntity: "designation",
  },
  {
    logicalName: "locationId",
    displayName: "Location",
    dataType: "lookup",
    lookupEntity: "location",
  },
  {
    logicalName: "officialJoiningLocationId",
    displayName: "Official Joining Location",
    dataType: "lookup",
    lookupEntity: "location",
  },
  {
    logicalName: "defaultWorkScheduleId",
    displayName: "Default Work Schedule",
    dataType: "lookup",
    lookupEntity: "workSchedule",
  },
  {
    logicalName: "employeeLevelId",
    displayName: "Employee Level",
    dataType: "lookup",
    lookupEntity: "employeeLevel",
  },
  {
    logicalName: "employeeType",
    displayName: "Employee Type",
    dataType: "optionset",
  },
  { logicalName: "workMode", displayName: "Work Mode", dataType: "optionset" },
  {
    logicalName: "contractType",
    displayName: "Contract Type",
    dataType: "optionset",
  },
  {
    logicalName: "userId",
    displayName: "System User",
    dataType: "lookup",
    lookupEntity: "user",
  },
  {
    logicalName: "noticePeriodDays",
    displayName: "Notice Period Days",
    dataType: "number",
  },
  {
    logicalName: "taxIdentifier",
    displayName: "Tax Identifier",
    dataType: "string",
    maxLength: 64,
  },
  {
    logicalName: "addressLine1",
    displayName: "Address Line 1",
    dataType: "string",
    maxLength: 255,
  },
  {
    logicalName: "addressLine2",
    displayName: "Address Line 2",
    dataType: "string",
    maxLength: 255,
  },
  {
    logicalName: "countryId",
    displayName: "Country",
    dataType: "lookup",
    lookupEntity: "country",
  },
  {
    logicalName: "stateProvinceId",
    displayName: "State / Province",
    dataType: "lookup",
    lookupEntity: "stateProvince",
  },
  {
    logicalName: "cityId",
    displayName: "City",
    dataType: "lookup",
    lookupEntity: "city",
  },
  {
    logicalName: "postalCode",
    displayName: "Postal Code",
    dataType: "string",
    maxLength: 30,
  },
  {
    logicalName: "emergencyContactName",
    displayName: "Emergency Contact Name",
    dataType: "string",
    maxLength: 120,
  },
  {
    logicalName: "emergencyContactRelation",
    displayName: "Emergency Contact Relation",
    dataType: "string",
    maxLength: 120,
  },
  {
    logicalName: "emergencyContactRelationTypeId",
    displayName: "Emergency Contact Relation Type",
    dataType: "lookup",
    lookupEntity: "relationType",
  },
  {
    logicalName: "emergencyContactPhone",
    displayName: "Emergency Contact Phone",
    dataType: "phone",
    maxLength: 30,
  },
  {
    logicalName: "emergencyContactAlternatePhone",
    displayName: "Emergency Contact Alternate Phone",
    dataType: "phone",
    maxLength: 30,
  },
  {
    logicalName: "provisionSystemAccess",
    displayName: "Provision System Access",
    dataType: "boolean",
  },
  {
    logicalName: "sendInvitationNow",
    displayName: "Send Invitation Now",
    dataType: "boolean",
  },
  {
    logicalName: "initialRoleIds",
    displayName: "Initial Roles",
    dataType: "multi-optionset",
  },
];

export interface EmployeeMetadataAdapterInput {
  readonly forms?: readonly RuntimeCustomizationForm[];
  readonly views?: readonly RuntimeCustomizationView[];
  readonly employeeSettings?: EmployeeRuntimeSettings | null;
}

export interface EmployeeRuntimeContextInput extends EmployeeMetadataAdapterInput {
  readonly tenant: TenantRuntimeConfig;
  readonly principal: RuntimePrincipal;
  readonly recordId?: string;
  readonly fieldSecurityRules?: readonly FieldSecurityRule[];
}

export function buildEmployeeMetadataBundle(
  input: EmployeeMetadataAdapterInput = {},
): ModuleMetadataBundle {
  const requiredFields = resolveRequiredEmployeeFields(input.employeeSettings);
  const entity = buildEmployeeEntityMetadata(
    requiredFields,
    input.employeeSettings,
  );

  return {
    entity,
    forms: mapEmployeeForms(input.forms ?? [], requiredFields),
    views: mapEmployeeViews(input.views ?? []),
    commands: employeeRuntimeCommands,
  };
}

export function buildEmployeeRuntimeContext(
  input: EmployeeRuntimeContextInput,
): ModuleRuntimeContext {
  return {
    tenant: input.tenant,
    security: {
      principal: input.principal,
      fieldSecurityRules: input.fieldSecurityRules ?? [],
      dataAccessRules: [],
    },
    module: employeeRuntimeModuleConfig,
    metadata: buildEmployeeMetadataBundle(input),
    recordId: input.recordId,
    cacheKeys: [
      input.tenant.cachePartitionKey,
      `module:${employeeRuntimeModuleConfig.key}`,
      "entity:employee",
    ],
  };
}

export function buildEmployeeEntityMetadata(
  requiredFields: ReadonlySet<string> = requiredEmployeeFields,
  settings?: EmployeeRuntimeSettings | null,
): EntityMetadata {
  return {
    id: "employee",
    logicalName: "employee",
    displayName: "Employee",
    description: "Employee master profile metadata bridge.",
    version: "0.5.0",
    lifecycleState: "published",
    layer: "system",
    collectionName: "employees",
    primaryIdField: "id",
    primaryNameField: "fullName",
    ownerField: "ownerId",
    statusField: "status",
    subStatusField: "subStatus",
    routeBase: employeeRuntimeModuleConfig.routeBase,
    defaultFormLogicalName: employeeRuntimeModuleConfig.defaultFormLogicalName,
    defaultViewLogicalName: employeeRuntimeModuleConfig.defaultViewLogicalName,
    permissions: {
      read: employeeRuntimePermissions.read,
      create: employeeRuntimePermissions.create,
      update: employeeRuntimePermissions.update,
      delete: employeeRuntimePermissions.delete,
    },
    fields: EMPLOYEE_FIELD_DEFINITIONS.map((definition) =>
      buildEmployeeField(definition, requiredFields, settings),
    ),
    relationships: employeeRelationships(),
    relatedTabs: employeeRelatedTabs(),
  };
}

export function mapEmployeeForms(
  forms: readonly RuntimeCustomizationForm[],
  requiredFields: ReadonlySet<string> = requiredEmployeeFields,
): readonly FormMetadata[] {
  if (forms.length === 0) {
    return systemEmployeeForms(requiredFields).map(ensureDefaultSystemWidgets);
  }

  return ensureSystemForms(
    forms.map((form) => ({
      id: form.id,
      logicalName: `employees.${form.formKey}`,
      displayName: form.name,
      description: `Bridge for customization form ${form.formKey}.`,
      version: "0.5.0",
      lifecycleState: "published",
      layer: "unmanaged",
      entityLogicalName: "employee",
      columns: form.layoutJson.columns ?? 3,
      formType:
        form.type === "quick"
          ? "quickCreate"
          : form.formKey.toLowerCase().includes("minimal")
            ? "minimal"
            : "main",
      mode:
        form.type === "create"
          ? "create"
          : form.type === "quick"
            ? "read"
            : "edit",
      tabs: form.layoutJson.tabs.map((tab, tabIndex) => ({
        id: tab.id,
        tabKey: tab.id,
        label: tab.label,
        order: tab.sequence ?? tabIndex * 10,
        type: "fields",
        columns: tab.columns ?? form.layoutJson.columns ?? 3,
        /* Carried through so a rule saved in the designer reaches the renderer. */
        ...(tab.visibilityRules?.length
          ? { visibilityRules: tab.visibilityRules }
          : {}),
        sectionIds: tab.sections.map((section) => section.id),
      })),
      sections: form.layoutJson.tabs.flatMap((tab, tabIndex) =>
        tab.sections.map((section, sectionIndex) => {
          const hasExplicitComponents = Object.prototype.hasOwnProperty.call(
            section,
            "components",
          );
          return {
            id: section.id,
            tabKey: tab.id,
            label: section.label,
            order: section.sequence ?? tabIndex * 100 + sectionIndex,
            layout:
              section.columns === 1
                ? "single-column"
                : section.columns === 3
                  ? "three-column"
                  : "two-column",
            columns: normalizeFormColumnCount(
              section.columns ?? tab.columns ?? form.layoutJson.columns ?? 3,
            ),
            ...(section.visibilityRules?.length
              ? { visibilityRules: section.visibilityRules }
              : {}),
            fields: section.fields.map((field, fieldIndex) => {
              const fieldLogicalName = normalizeEmployeeFieldName(
                field.columnKey,
              );

              return {
                fieldLogicalName,
                label: field.label,
                order: field.sequence ?? fieldIndex,
                isVisible: field.isVisible,
                isReadonly: field.readOnly,
                requirementLevel: employeeFormRequirementLevel(
                  fieldLogicalName,
                  Boolean(field.required),
                  requiredFields,
                ),
              };
            }),
            ...(hasExplicitComponents
              ? {
                  components: (section.components ?? []).map(
                    (component, componentIndex) => ({
                      id: component.id,
                      type: "widget" as const,
                      widgetId: component.widgetId,
                      widgetType: component.widgetType,
                      label: component.label,
                      order: component.sequence ?? (componentIndex + 1) * 10,
                      columnSpan: normalizeFormColumnCount(
                        component.columnSpan ?? 1,
                      ),
                      height: component.height,
                      isInitiallyCollapsed: component.isInitiallyCollapsed,
                      placementConfig: component.placementConfig,
                      lifecycleState: "published" as const,
                    }),
                  ),
                }
              : {}),
          };
        }),
      ),
    })),
  ).map(ensureDefaultSystemWidgets);
}

export function mapEmployeeViews(
  views: readonly RuntimeCustomizationView[],
): readonly ViewMetadata[] {
  if (views.length === 0) {
    return fallbackEmployeeViews();
  }

  return ensureDefaultView(
    views.map((view) => ({
      id: view.id,
      logicalName: `employees.${view.viewKey}`,
      viewKey: `employees.${view.viewKey}`,
      viewId: view.id,
      displayName: view.name,
      description: view.description,
      version: "0.5.0",
      lifecycleState: "published",
      layer: view.type === "system" ? "system" : "unmanaged",
      entityLogicalName: "employee",
      type: "main",
      isDefault: view.isDefault,
      isSystem: view.type === "system",
      isCustom: view.type !== "system",
      isPublished: true,
      columns: extractViewColumns(view.columnsJson),
      defaultSort: [{ fieldLogicalName: "fullName", direction: "asc" }],
    })),
  );
}

function normalizeFormColumnCount(value: number): 1 | 2 | 3 | 4 {
  if (value <= 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 4;
}

function fallbackEmployeeForm(
  requiredFields: ReadonlySet<string> = requiredEmployeeFields,
): FormMetadata {
  return {
    id: stableRuntimeMetadataId("form:employee.main.full"),
    logicalName: "employee.main.full",
    displayName: " Main",
    version: "0.5.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: "employee",
    mode: "edit",
    formType: "main",
    columns: 3,
    tabs: [
      /*
       * Listed in reading order for clarity, but the rendered sequence comes
       * from each section's own `order` value below - changing this array
       * alone moves nothing.
       *
       * The order is: who they are, how to reach them, what they do, where
       * they sit, personal detail, then the administrative footer.
       */
      formFieldTab("summary", "Summary", 10, [
        // Identity
        "profile-image",
        "basic-information",
        "contact-information",
        // Role and placement
        "employment-information",
        "organization-reporting",
        // Personal detail
        "personal-information",
        "address-information",
        "emergency-contact",
        "documents-identification",
        // Administrative footer
        "system-information",
        "timeline",
        "reporting-hierarchy",
      ]),
      formRelatedTab(
        "payroll-compensation",
        "Compensation",
        60,
        "employee_compensation",
        PAY_DATA_ROLES,
      ),
      formRelatedTab(
        "banking-details",
        "Banking Details",
        70,
        "employee_bank_accounts",
        PAY_DATA_ROLES,
      ),
      formRelatedTab("payslips", "Payslips", 80, "employee_payslips"),
      formRelatedTab(
        "project-allocations",
        "Project Allocations",
        90,
        "employee_project_allocations",
      ),
      formRelatedTab(
        "previous-employment",
        "Previous Employment",
        100,
        "employee_previous_employments",
      ),
      formRelatedTab(
        "leave-history",
        "Leave History",
        30,
        "employee_leave_history",
      ),
      formRelatedTab("attendance", "Attendance", 20, "employee_attendance"),
      formRelatedTab("timesheets", "Timesheets", 40, "employee_timesheets"),
      formRelatedTab(
        "employee-history",
        "Employee History",
        110,
        "employee_history",
      ),
      formRelatedTab("documents", "Documents", 50, "employee_documents"),
      formRelatedTab("education", "Education", 120, "employee_education"),
      formFieldTab("agent", "Agent", 130, ["agent-desktop"]),
    ],
    sections: [
      {
        id: "profile-image",
        tabKey: "summary",
        label: "Profile Image",
        order: 10,
        layout: "single-column",
        columns: 1,
        fields: [],
        components: [
          createSystemWidgetComponent({
            widgetKey: "employee.profilePhoto",
            idSeed: "employee.main.full.profile",
            order: 10,
            columnSpan: 1,
          }),
        ],
      },
      {
        id: "basic-information",
        tabKey: "summary",
        label: "Basic Information",
        order: 20,
        layout: "single-column",
        fields: [
          requiredFormField("employeeCode", 10, requiredFields),
          requiredFormField("firstName", 20, requiredFields),
          { fieldLogicalName: "middleName", order: 30 },
          requiredFormField("lastName", 40, requiredFields),
          { fieldLogicalName: "preferredName", order: 50 },
        ],
      },
      {
        id: "employment-information",
        tabKey: "summary",
        label: "Employment Information",
        order: 40,
        layout: "single-column",
        fields: [
          requiredFormField("employmentStatus", 10, requiredFields),
          { fieldLogicalName: "employeeType", order: 20 },
          { fieldLogicalName: "workMode", order: 30 },
          { fieldLogicalName: "contractType", order: 40 },
          requiredFormField("hireDate", 50, requiredFields),
          { fieldLogicalName: "confirmationDate", order: 60 },
          { fieldLogicalName: "probationEndDate", order: 70 },
          { fieldLogicalName: "terminationDate", order: 80 },
          { fieldLogicalName: "noticePeriodDays", order: 90 },
          { fieldLogicalName: "taxIdentifier", order: 100 },
        ],
      },
      {
        id: "organization-reporting",
        tabKey: "summary",
        label: "Organization",
        order: 50,
        layout: "single-column",
        fields: [
          requiredFormField("departmentId", 15, requiredFields),
          { fieldLogicalName: "teamId", order: 20 },
          requiredFormField("designationId", 25, requiredFields),
          { fieldLogicalName: "employeeLevelId", order: 30 },
          requiredFormField("locationId", 40, requiredFields),
          { fieldLogicalName: "officialJoiningLocationId", order: 50 },
          { fieldLogicalName: "defaultWorkScheduleId", order: 60 },
          requiredFormField("reportingManagerEmployeeId", 70, requiredFields),
        ],
      },
      {
        id: "contact-information",
        tabKey: "summary",
        label: "Contact Information",
        order: 30,
        layout: "single-column",
        fields: [
          { fieldLogicalName: "workEmail", order: 10 },
          requiredFormField("personalEmail", 20, requiredFields),
          requiredFormField("phone", 30, requiredFields),
          { fieldLogicalName: "alternatePhone", order: 40 },
        ],
      },
      {
        id: "address-information",
        tabKey: "summary",
        label: "Address Information",
        order: 80,
        layout: "single-column",
        fields: [
          { fieldLogicalName: "addressLine1", order: 10 },
          { fieldLogicalName: "addressLine2", order: 20 },
          { fieldLogicalName: "countryId", order: 30 },
          { fieldLogicalName: "stateProvinceId", order: 40 },
          { fieldLogicalName: "cityId", order: 50 },
          { fieldLogicalName: "postalCode", order: 60 },
        ],
      },
      {
        id: "personal-information",
        tabKey: "summary",
        label: "Personal Information",
        order: 70,
        layout: "single-column",
        fields: [
          { fieldLogicalName: "dateOfBirth", order: 10 },
          { fieldLogicalName: "gender", order: 20 },
          { fieldLogicalName: "maritalStatus", order: 30 },
          { fieldLogicalName: "nationalityCountryId", order: 40 },
          { fieldLogicalName: "nationality", order: 50 },
          { fieldLogicalName: "bloodGroup", order: 60 },
        ],
      },
      {
        id: "documents-identification",
        tabKey: "summary",
        label: "Documents / Identification",
        order: 100,
        layout: "single-column",
        fields: [{ fieldLogicalName: "cnic", order: 10 }],
      },
      {
        id: "emergency-contact",
        tabKey: "summary",
        label: "Emergency Contact",
        order: 90,
        layout: "single-column",
        fields: [
          requiredFormField("emergencyContactName", 10, requiredFields),
          requiredFormField(
            "emergencyContactRelationTypeId",
            20,
            requiredFields,
          ),
          requiredFormField("emergencyContactPhone", 30, requiredFields),
          { fieldLogicalName: "emergencyContactAlternatePhone", order: 40 },
        ],
      },
      {
        id: "system-information",
        tabKey: "summary",
        label: "System Information",
        order: 110,
        layout: "single-column",
        fields: [
          { fieldLogicalName: "userId", order: 10 },
          { fieldLogicalName: "provisionSystemAccess", order: 20 },
          { fieldLogicalName: "sendInvitationNow", order: 30 },
          { fieldLogicalName: "initialRoleIds", order: 40, isVisible: false },
        ],
      },
      {
        id: "timeline",
        tabKey: "summary",
        label: "Timeline",
        order: 120,
        layout: "single-column",
        columns: 1,
        fields: [],
        components: [
          createSystemWidgetComponent({
            widgetKey: "system.timeline",
            idSeed: "employee.main.full.timeline",
            order: 10,
            columnSpan: 1,
          }),
        ],
      },
      {
        id: "reporting-hierarchy",
        tabKey: "summary",
        label: "Reporting Hierarchy",
        order: 130,
        layout: "single-column",
        columns: 1,
        columnSpan: 3,
        fields: [],
        components: [
          createSystemWidgetComponent({
            widgetKey: "system.reportingHierarchy",
            idSeed: "employee.main.full.reporting",
            order: 10,
            columnSpan: 1,
          }),
        ],
      },
      {
        id: "agent-desktop",
        tabKey: "agent",
        label: "Agent Desktop",
        order: 110,
        layout: "single-column",
        columns: 1,
        fields: [],
        components: [
          {
            id: "system.agentDesktop",
            type: "widget",
            widgetId: "system.agentDesktop",
            widgetType: "agent_desktop",
            label: "Agent Desktop",
            order: 10,
            columnSpan: 3,
            lifecycleState: "published",
          },
        ],
      },
    ],
  };
}

function minimalEmployeeForm(
  requiredFields: ReadonlySet<string> = requiredEmployeeFields,
): FormMetadata {
  return {
    ...fallbackEmployeeForm(requiredFields),
    id: stableRuntimeMetadataId("form:employee.main.minimal"),
    logicalName: "employee.main.minimal",
    displayName: "Quick form",
    formType: "minimal",
    tabs: [
      formFieldTab("essential-information", "Essential Information", 10, [
        "minimal",
      ]),
    ],
    sections: [
      {
        id: "minimal",
        tabKey: "essential-information",
        label: "Essential Information",
        order: 10,
        layout: "two-column",
        fields: [
          requiredFormField("employeeCode", 10, requiredFields),
          { fieldLogicalName: "workEmail", order: 20 },
          requiredFormField("employmentStatus", 30, requiredFields),
          requiredFormField("reportingManagerEmployeeId", 40, requiredFields),
          requiredFormField("hireDate", 50, requiredFields),
        ],
      },
    ],
  };
}

function systemEmployeeForms(
  requiredFields: ReadonlySet<string> = requiredEmployeeFields,
) {
  return [
    fallbackEmployeeForm(requiredFields),
    minimalEmployeeForm(requiredFields),
  ].map(normalizeRuntimeFormLayout);
}

function ensureDefaultSystemWidgets(form: FormMetadata): FormMetadata {
  if (
    form.layer !== "system" &&
    form.sections.some((section) =>
      Object.prototype.hasOwnProperty.call(section, "components"),
    )
  ) {
    return form;
  }

  const existingWidgetKeys = new Set(
    form.sections.flatMap(
      (section) =>
        section.components
          ?.filter((component) => component.type === "widget")
          .flatMap((component) => [
            component.widgetId ?? "",
            component.widgetType ?? "",
          ]) ?? [],
    ),
  );

  const fieldTab = form.tabs?.find((tab) => tab.type === "fields");
  const targetSection =
    form.sections.find((section) => section.tabKey === fieldTab?.tabKey) ??
    form.sections[0];
  if (!targetSection) return form;
  const additions: FormComponentMetadata[] = [];
  if (
    form.formType === "main" &&
    !existingWidgetKeys.has("employee.profilePhoto") &&
    !existingWidgetKeys.has("profile_photo")
  ) {
    additions.push(
      createSystemWidgetComponent({
        widgetKey: "employee.profilePhoto",
        idSeed: form.id,
        order: 9990,
        columnSpan: 1,
      }),
    );
  }
  if (
    !existingWidgetKeys.has("system.timeline") &&
    !existingWidgetKeys.has("timeline")
  ) {
    additions.push(
      createSystemWidgetComponent({
        widgetKey: "system.timeline",
        idSeed: form.id,
        order: 10000,
        columnSpan: targetSection.columns ?? 2,
      }),
    );
  }
  if (
    form.formType === "main" &&
    !existingWidgetKeys.has("system.reportingHierarchy") &&
    !existingWidgetKeys.has("reporting_hierarchy")
  ) {
    additions.push(
      createSystemWidgetComponent({
        widgetKey: "system.reportingHierarchy",
        idSeed: form.id,
        order: 10010,
        columnSpan: targetSection.columns ?? 2,
      }),
    );
  }
  if (!additions.length) return form;

  return {
    ...form,
    sections: form.sections.map((section) =>
      section.id === targetSection.id
        ? {
            ...section,
            components: [...(section.components ?? []), ...additions],
          }
        : section,
    ),
  };
}

function formFieldTab(
  tabKey: string,
  label: string,
  order: number,
  sectionIds: readonly string[],
  visibilityRules?: readonly CommandVisibilityRule[],
) {
  return {
    id: `employee-form-tab-${tabKey}`,
    tabKey,
    label,
    order,
    type: "fields" as const,
    columns: 3 as const,
    sectionIds,
    ...(visibilityRules ? { visibilityRules } : {}),
  };
}

function formRelatedTab(
  tabKey: string,
  label: string,
  order: number,
  relationshipName: string,
  visibilityRules?: readonly CommandVisibilityRule[],
) {
  return {
    id: `employee-form-tab-${tabKey}`,
    tabKey,
    label,
    order,
    type: "related_module" as const,
    relatedTabKey: tabKey,
    subgrid: relatedSubgrid(tabKey, label, relationshipName),
    ...(visibilityRules ? { visibilityRules } : {}),
  };
}

/*
 * Pay data on a colleague's record is not an employee's business. The API still
 * enforces this independently - hiding a tab is presentation, never the control
 * that protects the data.
 */
const PAY_DATA_ROLES: readonly CommandVisibilityRule[] = [
  {
    operator: "has-any-role",
    roleKeys: ["global-admin", "system-admin", "hr", "payroll-manager"],
  },
];

export function resolveEmployeeRuntimeForm(
  forms: readonly FormMetadata[],
  selectedFormId?: string | null,
): FormMetadata | null {
  const publishedForms = forms.filter(
    (form) =>
      form.lifecycleState === "published" ||
      form.lifecycleState === "deprecated",
  );
  const defaultForm =
    publishedForms.find(
      (form) =>
        form.logicalName === employeeRuntimeModuleConfig.defaultFormLogicalName,
    ) ??
    publishedForms[0] ??
    null;

  if (!selectedFormId) return defaultForm;

  return (
    publishedForms.find((form) => form.id === selectedFormId) ?? defaultForm
  );
}

export function resolveEmployeeRuntimeView(
  views: readonly ViewMetadata[],
  selectedViewKey?: string | null,
): ViewMetadata | null {
  const defaultView =
    views.find(
      (view) =>
        view.logicalName === employeeRuntimeModuleConfig.defaultViewLogicalName,
    ) ??
    views[0] ??
    null;

  if (!selectedViewKey) return defaultView;

  const candidates = new Set([selectedViewKey, `employees.${selectedViewKey}`]);

  return (
    views.find(
      (view) =>
        candidates.has(view.logicalName) ||
        view.id === selectedViewKey ||
        view.viewId === selectedViewKey,
    ) ?? defaultView
  );
}

export function buildEmptyEmployeeRuntimeValues(
  input: {
    readonly defaultEmployeeStatus?: string | null;
    readonly defaultEmploymentType?: string | null;
    readonly defaultWorkMode?: string | null;
    readonly hireDate?: string | null;
  } = {},
): EmployeeRuntimeFormValues {
  return {
    employeeCode: "",
    firstName: "",
    middleName: "",
    lastName: "",
    preferredName: "",
    fullName: "",
    workEmail: "",
    personalEmail: "",
    phone: "",
    alternatePhone: "",
    dateOfBirth: "",
    gender: "",
    maritalStatus: "",
    nationalityCountryId: "",
    nationality: "",
    cnic: "",
    bloodGroup: "",
    employmentStatus: input.defaultEmployeeStatus || "ACTIVE",
    status: "ACTIVE",
    subStatus: "OPEN",
    employeeType: input.defaultEmploymentType || "",
    workMode: input.defaultWorkMode || "",
    contractType: "",
    hireDate: input.hireDate || new Date().toISOString().slice(0, 10),
    confirmationDate: "",
    probationEndDate: "",
    terminationDate: "",
    ownerId: "",
    reportingManagerEmployeeId: "",
    organizationId: "",
    businessUnitId: "",
    departmentId: "",
    teamId: "",
    designationId: "",
    employeeLevelId: "",
    locationId: "",
    officialJoiningLocationId: "",
    defaultWorkScheduleId: "",
    userId: "",
    noticePeriodDays: null,
    taxIdentifier: "",
    addressLine1: "",
    addressLine2: "",
    countryId: "",
    stateProvinceId: "",
    cityId: "",
    postalCode: "",
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactRelationTypeId: "",
    emergencyContactPhone: "",
    emergencyContactAlternatePhone: "",
    provisionSystemAccess: false,
    sendInvitationNow: true,
    initialRoleIds: [],
  };
}

export function mapEmployeeRecordToRuntimeValues(
  employee: Readonly<Record<string, unknown>>,
): EmployeeRuntimeFormValues {
  return {
    ...buildEmptyEmployeeRuntimeValues({ hireDate: "" }),
    id: stringValue(employee.id),
    employeeCode: stringValue(employee.employeeCode),
    firstName: stringValue(employee.firstName),
    middleName: stringValue(employee.middleName),
    lastName: stringValue(employee.lastName),
    preferredName: stringValue(employee.preferredName),
    fullName: stringValue(employee.fullName),
    workEmail: stringValue(employee.workEmail ?? employee.email),
    personalEmail: stringValue(employee.personalEmail),
    phone: stringValue(employee.phone),
    alternatePhone: stringValue(employee.alternatePhone),
    dateOfBirth: dateValue(employee.dateOfBirth),
    gender: stringValue(employee.gender),
    maritalStatus: stringValue(employee.maritalStatus),
    nationalityCountryId: stringValue(employee.nationalityCountryId),
    nationality: stringValue(employee.nationality),
    cnic: stringValue(employee.cnic),
    bloodGroup: stringValue(employee.bloodGroup),
    employmentStatus: stringValue(employee.employmentStatus || "ACTIVE"),
    status: stringValue(employee.status || "ACTIVE"),
    subStatus: stringValue(employee.subStatus || "OPEN"),
    employeeType: stringValue(employee.employeeType),
    workMode: stringValue(employee.workMode),
    contractType: stringValue(employee.contractType),
    hireDate: dateValue(employee.hireDate),
    confirmationDate: dateValue(employee.confirmationDate),
    probationEndDate: dateValue(employee.probationEndDate),
    terminationDate: dateValue(employee.terminationDate),
    ownerId: stringValue(employee.ownerUserId),
    ownerDisplayName: readNestedName(employee.ownerUser, ["fullName", "email"]),
    ownerEmail: readNestedName(employee.ownerUser, ["email"]),
    reportingManagerEmployeeId: stringValue(
      employee.reportingManagerEmployeeId ?? employee.managerEmployeeId,
    ),
    organizationId: stringValue(employee.organizationId),
    businessUnitId: stringValue(employee.businessUnitId),
    departmentId: stringValue(employee.departmentId),
    teamId: stringValue(employee.teamId),
    designationId: stringValue(employee.designationId),
    employeeLevelId: stringValue(employee.employeeLevelId),
    locationId: stringValue(employee.locationId),
    officialJoiningLocationId: stringValue(employee.officialJoiningLocationId),
    defaultWorkScheduleId: stringValue(employee.defaultWorkScheduleId),
    userId: stringValue(employee.userId),
    noticePeriodDays: numberValue(employee.noticePeriodDays),
    taxIdentifier: stringValue(employee.taxIdentifier),
    addressLine1: stringValue(employee.addressLine1),
    addressLine2: stringValue(employee.addressLine2),
    countryId: stringValue(employee.countryId),
    stateProvinceId: stringValue(employee.stateProvinceId),
    cityId: stringValue(employee.cityId),
    postalCode: stringValue(employee.postalCode),
    emergencyContactName: stringValue(employee.emergencyContactName),
    emergencyContactRelation: stringValue(employee.emergencyContactRelation),
    emergencyContactRelationTypeId: stringValue(
      employee.emergencyContactRelationTypeId,
    ),
    emergencyContactPhone: stringValue(employee.emergencyContactPhone),
    emergencyContactAlternatePhone: stringValue(
      employee.emergencyContactAlternatePhone,
    ),
    provisionSystemAccess: Boolean(employee.userId),
    sendInvitationNow: false,
    initialRoleIds: readUserRoleIds(employee.user),
  };
}

export function mapEmployeeRuntimeValuesToUpdatePayload(
  values: EmployeeRuntimeFormValues,
) {
  return {
    employeeCode: emptyToNull(values.employeeCode),
    firstName: emptyToNull(values.firstName),
    middleName: emptyToNull(values.middleName),
    lastName: emptyToNull(values.lastName),
    preferredName: emptyToNull(values.preferredName),
    workEmail: emptyToNull(values.workEmail),
    personalEmail: emptyToNull(values.personalEmail),
    phone: emptyToNull(values.phone),
    alternatePhone: emptyToNull(values.alternatePhone),
    dateOfBirth: emptyToNull(values.dateOfBirth),
    gender: emptyToNull(values.gender),
    maritalStatus: emptyToNull(values.maritalStatus),
    nationalityCountryId: emptyToNull(values.nationalityCountryId),
    nationality: emptyToNull(values.nationality),
    cnic: emptyToNull(values.cnic),
    bloodGroup: emptyToNull(values.bloodGroup),
    employmentStatus: emptyToNull(values.employmentStatus),
    ownerUserId: emptyToNull(values.ownerId),
    status: emptyToNull(values.status),
    subStatus: emptyToNull(values.subStatus),
    employeeType: emptyToNull(values.employeeType),
    workMode: emptyToNull(values.workMode),
    contractType: emptyToNull(values.contractType),
    hireDate: emptyToNull(values.hireDate),
    confirmationDate: emptyToNull(values.confirmationDate),
    probationEndDate: emptyToNull(values.probationEndDate),
    terminationDate: emptyToNull(values.terminationDate),
    organizationId: emptyToNull(values.organizationId),
    businessUnitId: emptyToNull(values.businessUnitId),
    departmentId: emptyToNull(values.departmentId),
    teamId: emptyToNull(values.teamId),
    designationId: emptyToNull(values.designationId),
    employeeLevelId: emptyToNull(values.employeeLevelId),
    locationId: emptyToNull(values.locationId),
    officialJoiningLocationId: emptyToNull(values.officialJoiningLocationId),
    defaultWorkScheduleId: emptyToNull(values.defaultWorkScheduleId),
    reportingManagerEmployeeId: emptyToNull(values.reportingManagerEmployeeId),
    userId: emptyToNull(values.userId),
    noticePeriodDays:
      typeof values.noticePeriodDays === "number"
        ? values.noticePeriodDays
        : null,
    taxIdentifier: emptyToNull(values.taxIdentifier),
    addressLine1: emptyToNull(values.addressLine1),
    addressLine2: emptyToNull(values.addressLine2),
    countryId: emptyToNull(values.countryId),
    stateProvinceId: emptyToNull(values.stateProvinceId),
    cityId: emptyToNull(values.cityId),
    postalCode: emptyToNull(values.postalCode),
    emergencyContactName: emptyToNull(values.emergencyContactName),
    emergencyContactRelation: emptyToNull(values.emergencyContactRelation),
    emergencyContactRelationTypeId: emptyToNull(
      values.emergencyContactRelationTypeId,
    ),
    emergencyContactPhone: emptyToNull(values.emergencyContactPhone),
    emergencyContactAlternatePhone: emptyToNull(
      values.emergencyContactAlternatePhone,
    ),
  };
}

export function mapEmployeeLookupDisplayValues(
  employee: Readonly<Record<string, unknown>>,
): Record<string, string> {
  return {
    ownerId: readNestedName(employee.ownerUser, ["fullName", "email"]),
    reportingManagerEmployeeId: readNestedName(employee.reportingManager, [
      "fullName",
    ]),
    departmentId: readLookupPrimaryName(employee.department),
    organizationId: readLookupPrimaryName(employee.organization),
    businessUnitId: readLookupPrimaryName(employee.businessUnit),
    teamId: readLookupPrimaryName(employee.team),
    designationId: readLookupPrimaryName(employee.designation),
    employeeLevelId: readLookupPrimaryName(employee.employeeLevel),
    locationId: readNestedName(employee.location, ["name"]),
    officialJoiningLocationId: readNestedName(
      employee.officialJoiningLocation,
      ["name"],
    ),
    defaultWorkScheduleId: readNestedName(employee.defaultWorkSchedule, [
      "name",
      "code",
    ]),
    userId: readNestedName(employee.user, ["email", "firstName", "lastName"]),
    countryId: stringValue(employee.country),
    stateProvinceId: stringValue(employee.stateProvince),
    cityId: stringValue(employee.city),
    nationalityCountryId: stringValue(employee.nationality),
    emergencyContactRelationTypeId: readNestedName(
      employee.emergencyContactRelationType,
      ["name", "key"],
    ),
  };
}

export function mapEmployeeLookupOptions(input: {
  readonly employee?: Readonly<Record<string, unknown>> | null;
  readonly managers?: readonly Readonly<Record<string, unknown>>[];
}): Record<
  string,
  readonly {
    id: string;
    name: string;
    subtitle?: string | null;
    code?: string | null;
  }[]
> {
  const managerOptions = (input.managers ?? [])
    .map((manager) => ({
      id: stringValue(manager.id),
      name: readNestedName(manager, ["fullName", "employeeCode"]),
      subtitle: stringValue(manager.workEmail ?? manager.email),
      code: stringValue(manager.employeeCode),
    }))
    .filter((option) => option.id && option.name);

  const employee = input.employee;

  return {
    reportingManagerEmployeeId: managerOptions,
    ownerId: compactLookupOptions([
      employee
        ? {
            id: stringValue(employee.ownerUserId),
            name: readNestedName(employee.ownerUser, ["fullName", "email"]),
            subtitle: readNestedName(employee.ownerUser, ["email"]),
          }
        : null,
    ]),
    organizationId: compactLookupOptions([
      lookupOptionFromRecord(employee?.organization),
    ]),
    businessUnitId: compactLookupOptions([
      lookupOptionFromRecord(employee?.businessUnit),
    ]),
    departmentId: compactLookupOptions([
      lookupOptionFromRecord(employee?.department),
    ]),
    teamId: compactLookupOptions([lookupOptionFromRecord(employee?.team)]),
    designationId: compactLookupOptions([
      lookupOptionFromRecord(employee?.designation),
    ]),
    employeeLevelId: compactLookupOptions([
      lookupOptionFromRecord(employee?.employeeLevel),
    ]),
    locationId: compactLookupOptions([
      lookupOptionFromRecord(employee?.location),
    ]),
    officialJoiningLocationId: compactLookupOptions([
      lookupOptionFromRecord(employee?.officialJoiningLocation),
    ]),
    defaultWorkScheduleId: compactLookupOptions([
      lookupOptionFromRecord(employee?.defaultWorkSchedule),
    ]),
    emergencyContactRelationTypeId: compactLookupOptions([
      lookupOptionFromRecord(employee?.emergencyContactRelationType),
    ]),
    userId: compactLookupOptions([
      employee
        ? {
            id: stringValue(employee.userId),
            name: readNestedName(employee.user, [
              "email",
              "firstName",
              "lastName",
            ]),
          }
        : null,
    ]),
  };
}

function fallbackEmployeeView(): ViewMetadata {
  return employeeSystemView({
    id: "10000000-0000-4000-8000-000000000001",
    logicalName: "employees.all",
    displayName: "All Employees",
    isDefault: true,
    columns: [
      "fullName",
      "employeeCode",
      "employmentStatus",
      "reportingManagerEmployeeId",
      "hireDate",
      "workEmail",
    ],
  });
}

function employeeSystemView(input: {
  readonly id: string;
  readonly logicalName: string;
  readonly displayName: string;
  readonly columns: readonly string[];
  readonly filters?: ViewMetadata["filters"];
  readonly isDefault?: boolean;
}): ViewMetadata {
  return {
    id: input.id,
    logicalName: input.logicalName,
    displayName: input.displayName,
    version: "0.5.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: "employee",
    type: "main",
    viewKey: input.logicalName,
    viewId: input.id,
    isDefault: input.isDefault,
    isSystem: true,
    isCustom: false,
    isPublished: true,
    columns: input.columns.map((fieldLogicalName, index) => ({
      fieldLogicalName,
      order: (index + 1) * 10,
    })),
    defaultSort: [{ fieldLogicalName: "fullName", direction: "asc" }],
    filters: input.filters,
  };
}

function employeeRelationships() {
  return [
    relationship(
      "employee_previous_employments",
      "one-to-many",
      "employee",
      "employeePreviousEmployment",
      "id",
      "employeeId",
      "companyName",
    ),
    relationship(
      "employee_leave_history",
      "one-to-many",
      "employee",
      "leaveRequest",
      "id",
      "employeeId",
      "leaveType",
    ),
    relationship(
      "employee_attendance",
      "one-to-many",
      "employee",
      "attendance",
      "id",
      "employeeId",
      "attendanceDate",
    ),
    relationship(
      "employee_timesheets",
      "one-to-many",
      "employee",
      "timesheet",
      "id",
      "employeeId",
      "periodStart",
    ),
    relationship(
      "employee_history",
      "one-to-many",
      "employee",
      "employeeHistory",
      "id",
      "employeeId",
      "title",
    ),
    relationship(
      "employee_documents",
      "one-to-many",
      "employee",
      "employeeDocument",
      "id",
      "employeeId",
      "fileName",
    ),
    relationship(
      "employee_education",
      "one-to-many",
      "employee",
      "employeeEducation",
      "id",
      "employeeId",
      "degreeTitle",
    ),
    relationship(
      "employee_compensation",
      "one-to-many",
      "employee",
      "employeeCompensation",
      "id",
      "employeeId",
      "effectiveDate",
    ),
    relationship(
      "employee_bank_accounts",
      "one-to-many",
      "employee",
      "employeeBankAccount",
      "id",
      "employeeId",
      "accountTitle",
    ),
    relationship(
      "employee_payslips",
      "one-to-many",
      "employee",
      "payslip",
      "id",
      "employeeId",
      "payslipNumber",
    ),
    relationship(
      "employee_project_allocations",
      "one-to-many",
      "employee",
      "projectAssignment",
      "id",
      "employeeId",
      "projectName",
    ),
  ] as const;
}

function employeeRelatedTabs() {
  return [
    relatedTab(
      "payroll-compensation",
      "Compensation",
      60,
      "subgrid",
      "employee_compensation",
    ),
    relatedTab(
      "banking-details",
      "Banking Details",
      65,
      "subgrid",
      "employee_bank_accounts",
    ),
    relatedTab("payslips", "Payslips", 66, "subgrid", "employee_payslips"),
    relatedTab(
      "project-allocations",
      "Project Allocations",
      67,
      "subgrid",
      "employee_project_allocations",
    ),
    relatedTab(
      "previous-employment",
      "Previous Employment",
      70,
      "subgrid",
      "employee_previous_employments",
    ),
    relatedTab(
      "leave-history",
      "Leave History",
      100,
      "subgrid",
      "employee_leave_history",
    ),
    relatedTab(
      "attendance",
      "Attendance",
      110,
      "subgrid",
      "employee_attendance",
    ),
    relatedTab(
      "timesheets",
      "Timesheets",
      120,
      "subgrid",
      "employee_timesheets",
    ),
    relatedTab(
      "employee-history",
      "Employee History",
      130,
      "subgrid",
      "employee_history",
    ),
    relatedTab("documents", "Documents", 140, "subgrid", "employee_documents"),
    relatedTab("education", "Education", 150, "subgrid", "employee_education"),
  ] as const;
}

function fallbackEmployeeViews(): readonly ViewMetadata[] {
  return [
    fallbackEmployeeView(),
    employeeSystemView({
      id: "10000000-0000-4000-8000-000000000002",
      logicalName: "employees.active",
      displayName: "Active Employees",
      columns: [
        "fullName",
        "employeeCode",
        "employmentStatus",
        "departmentId",
        "designationId",
        "hireDate",
        "reportingManagerEmployeeId",
      ],
      filters: [
        {
          fieldLogicalName: "employmentStatus",
          operator: "eq",
          value: "ACTIVE",
        },
      ],
    }),
    employeeSystemView({
      id: "10000000-0000-4000-8000-000000000003",
      logicalName: "employees.probation",
      displayName: "Employees on Probation",
      columns: [
        "fullName",
        "employeeCode",
        "employmentStatus",
        "hireDate",
        "probationEndDate",
        "reportingManagerEmployeeId",
      ],
      filters: [
        {
          fieldLogicalName: "employmentStatus",
          operator: "eq",
          value: "PROBATION",
        },
      ],
    }),
    employeeSystemView({
      id: "10000000-0000-4000-8000-000000000004",
      logicalName: "employees.notice",
      displayName: "Employees on Notice",
      columns: [
        "fullName",
        "employeeCode",
        "employmentStatus",
        "noticePeriodDays",
        "terminationDate",
        "reportingManagerEmployeeId",
      ],
      filters: [
        {
          fieldLogicalName: "employmentStatus",
          operator: "eq",
          value: "NOTICE",
        },
      ],
    }),
    employeeSystemView({
      id: "10000000-0000-4000-8000-000000000005",
      logicalName: "employees.terminated",
      displayName: "Terminated Employees",
      columns: [
        "fullName",
        "employeeCode",
        "employmentStatus",
        "terminationDate",
        "departmentId",
        "designationId",
      ],
      filters: [
        {
          fieldLogicalName: "employmentStatus",
          operator: "eq",
          value: "TERMINATED",
        },
      ],
    }),
  ];
}

function relationship(
  relationshipName: string,
  type: "one-to-many" | "many-to-one" | "many-to-many",
  sourceEntityLogicalName: string,
  targetEntityLogicalName: string,
  sourceFieldLogicalName?: string,
  targetFieldLogicalName?: string,
  displayFieldLogicalName?: string,
) {
  return {
    id: relationshipName,
    logicalName: relationshipName,
    relationshipName,
    displayName: relationshipName,
    version: "0.5.0",
    lifecycleState: "published" as const,
    layer: "system" as const,
    type,
    sourceEntityLogicalName,
    targetEntityLogicalName,
    parentEntityLogicalName: sourceEntityLogicalName,
    relatedEntityLogicalName: targetEntityLogicalName,
    sourceFieldLogicalName,
    targetFieldLogicalName,
    lookupFieldLogicalName: targetFieldLogicalName,
    displayFieldLogicalName,
    columns: relatedColumnsForRelationship(relationshipName),
    cascadeDelete: "restrict" as const,
  };
}

function relatedTab(
  tabKey: string,
  label: string,
  order: number,
  layout: "subgrid" | "form-section" | "timeline" | "custom-slot",
  relationshipName?: string,
) {
  return {
    id: `employee-tab-${tabKey}`,
    tabKey,
    label,
    order,
    layout,
    relationshipName,
    subgrid: relationshipName
      ? relatedSubgrid(tabKey, label, relationshipName)
      : undefined,
  };
}

function relatedSubgrid(
  tabKey: string,
  title: string,
  relationshipName: string,
) {
  return {
    id: `employee-subgrid-${tabKey}`,
    relationshipName,
    entityLogicalName: "employee",
    relatedEntityLogicalName:
      employeeRelationships().find(
        (relationship) => relationship.relationshipName === relationshipName,
      )?.targetEntityLogicalName ?? relationshipName,
    title,
    columns: relatedColumnsForRelationship(relationshipName),
    routeBase:
      relationshipName === "employee_bank_accounts"
        ? "/employee-bank-accounts"
        : relationshipName === "employee_payslips"
          ? "/payroll/payslips"
          : undefined,
    quickCreateFields:
      relatedQuickCreateFieldsForRelationship(relationshipName),
    emptyStateTitle: `No ${title}`,
    emptyStateDescription:
      "No related records are available for this employee yet.",
    api: employeeRelatedApi(relationshipName),
  };
}

function employeeRelatedApi(relationshipName: string) {
  const childPathByRelationship: Record<string, string> = {
    employee_previous_employments: "previous-employments",
    employee_education: "education",
    employee_compensation: "compensation-history",
    employee_bank_accounts: "bank-accounts",
    employee_payslips: "payslips",
    employee_project_allocations: "project-allocations",
    employee_leave_history: "leave-history",
    employee_history: "history",
    employee_attendance: "attendance-history",
    employee_timesheets: "timesheet-history",
    employee_documents: "documents",
  };
  const childPath = childPathByRelationship[relationshipName];
  if (!childPath) return undefined;
  const listPath = `/api/employees/{parentId}/${childPath}`;
  const fullCrud = new Set([
    "employee_previous_employments",
    "employee_education",
    "employee_documents",
  ]).has(relationshipName);
  const updateOnly = relationshipName === "employee_compensation";
  const createOnlyRelationships = new Set([
    "employee_history",
    "employee_bank_accounts",
  ]);
  const createOnly = createOnlyRelationships.has(relationshipName);
  return {
    listPath,
    createPath:
      relationshipName === "employee_documents"
        ? `${listPath}/upload`
        : fullCrud || createOnly || updateOnly
          ? listPath
          : undefined,
    updatePath: fullCrud || updateOnly ? `${listPath}/{recordId}` : undefined,
    deletePath: fullCrud ? `${listPath}/{recordId}` : undefined,
    permissions: relatedPermissionsForRelationship(relationshipName),
  };
}

function relatedPermissionsForRelationship(relationshipName: string) {
  if (relationshipName === "employee_education") {
    return {
      create: ["employees.education.create", "employees.education.create.self"],
      update: ["employees.education.update", "employees.education.update.self"],
      delete: ["employees.education.delete", "employees.education.delete.self"],
    };
  }

  if (relationshipName === "employee_previous_employments") {
    return {
      create: ["employees.update", "employees.update.self"],
      update: ["employees.update", "employees.update.self"],
      delete: ["employees.update", "employees.update.self"],
    };
  }

  if (relationshipName === "employee_documents") {
    return {
      create: ["employees.documents.upload", "employees.documents.upload.self"],
      update: ["employees.documents.upload", "employees.documents.upload.self"],
      delete: ["employees.documents.delete", "employees.documents.delete.self"],
    };
  }

  if (relationshipName === "employee_bank_accounts") {
    return {
      create: "employee-bank-accounts.manage",
      update: "employee-bank-accounts.manage",
      delete: "employee-bank-accounts.manage",
    };
  }

  return undefined;
}

function relatedColumnsForRelationship(relationshipName: string) {
  const columnsByRelationship: Record<string, readonly string[]> = {
    employee_previous_employments: [
      "companyName",
      "jobTitle",
      "startDate",
      "endDate",
    ],
    employee_leave_history: ["leaveType", "startDate", "endDate", "status"],
    employee_attendance: [
      "attendanceDate",
      "attendanceStatus",
      "checkInAt",
      "checkOutAt",
    ],
    employee_timesheets: ["periodStart", "periodEnd", "status", "totalHours"],
    employee_history: ["eventDate", "title", "eventType", "changedByUserId"],
    employee_documents: ["fileName", "documentType", "version", "uploadedAt"],
    employee_education: [
      "degreeTitle",
      "institutionName",
      "startDate",
      "endDate",
    ],
    employee_compensation: [
      "effectiveFrom",
      "effectiveTo",
      "salaryPackageRuleId",
      "currencyCode",
      "grossEarnings",
      "status",
      "changeReason",
      "approvedById",
      "updatedAt",
    ],
    employee_bank_accounts: [
      "bankName",
      "accountTitle",
      "accountNumber",
      "iban",
      "branchName",
      "currencyCode",
      "isPrimaryPayroll",
      "verificationStatus",
      "isActive",
      "effectiveFrom",
      "effectiveTo",
      "updatedAt",
    ],
    employee_payslips: [
      "periodName",
      "payslipNumber",
      "status",
      "grossEarnings",
      "totalDeductions",
      "totalTaxes",
      "netPay",
      "currencyCode",
      "publishedAt",
    ],
    employee_project_allocations: [
      "projectName",
      "customerName",
      "allocationType",
      "allocationValue",
      "billable",
      "effectiveFrom",
      "effectiveTo",
      "status",
    ],
  };

  const labelsByField: Record<string, string> = {
    accountNumber: "Account Number",
    accountTitle: "Account Title",
    bankName: "Bank",
    branchName: "Branch",
    currencyCode: "Currency",
    effectiveFrom: "Effective From",
    effectiveTo: "Effective To",
    iban: "IBAN",
    isActive: "Active",
    isPrimaryPayroll: "Primary Payroll",
    updatedAt: "Updated At",
    verificationStatus: "Verification",
    grossEarnings: "Gross Earnings",
    netPay: "Net Pay",
    payslipNumber: "Payslip",
    periodName: "Period",
    publishedAt: "Published At",
    status: "Status",
    totalDeductions: "Deductions",
    totalTaxes: "Taxes",
  };

  return (columnsByRelationship[relationshipName] ?? ["id"]).map(
    (fieldLogicalName, index) => ({
      fieldLogicalName,
      label: labelsByField[fieldLogicalName],
      order: (index + 1) * 10,
    }),
  );
}

function relatedQuickCreateFieldsForRelationship(relationshipName: string) {
  const fieldsByRelationship: Record<
    string,
    readonly {
      readonly fieldLogicalName: string;
      readonly label?: string;
      readonly dataType: FieldDataType;
      readonly required?: boolean;
      readonly maxLength?: number;
    }[]
  > = {
    employee_previous_employments: [
      {
        fieldLogicalName: "companyName",
        label: "Company name",
        dataType: "string",
        required: true,
        maxLength: 160,
      },
      {
        fieldLogicalName: "jobTitle",
        label: "Job title",
        dataType: "string",
        required: true,
        maxLength: 160,
      },
      {
        fieldLogicalName: "department",
        label: "Department",
        dataType: "string",
        maxLength: 120,
      },
      {
        fieldLogicalName: "employmentType",
        label: "Employment type",
        dataType: "string",
        maxLength: 80,
      },
      { fieldLogicalName: "startDate", label: "Start date", dataType: "date" },
      { fieldLogicalName: "endDate", label: "End date", dataType: "date" },
      {
        fieldLogicalName: "finalSalary",
        label: "Final salary",
        dataType: "decimal",
      },
      {
        fieldLogicalName: "reasonForLeaving",
        label: "Reason for leaving",
        dataType: "string",
        maxLength: 240,
      },
      {
        fieldLogicalName: "referenceName",
        label: "Reference name",
        dataType: "string",
        maxLength: 160,
      },
      {
        fieldLogicalName: "referenceContact",
        label: "Reference contact",
        dataType: "string",
        maxLength: 160,
      },
      {
        fieldLogicalName: "notes",
        label: "Notes",
        dataType: "multiline-string",
      },
    ],
    employee_education: [
      {
        fieldLogicalName: "institutionName",
        label: "Institution",
        dataType: "string",
        required: true,
        maxLength: 160,
      },
      {
        fieldLogicalName: "degreeTitle",
        label: "Degree",
        dataType: "string",
        required: true,
        maxLength: 160,
      },
      {
        fieldLogicalName: "fieldOfStudy",
        label: "Field of study",
        dataType: "string",
        maxLength: 160,
      },
      { fieldLogicalName: "startDate", label: "Start date", dataType: "date" },
      { fieldLogicalName: "endDate", label: "End date", dataType: "date" },
      {
        fieldLogicalName: "gradeOrCgpa",
        label: "Grade / CGPA",
        dataType: "string",
        maxLength: 80,
      },
      {
        fieldLogicalName: "description",
        label: "Description",
        dataType: "multiline-string",
      },
    ],
    employee_bank_accounts: [
      {
        fieldLogicalName: "bankId",
        label: "Bank",
        dataType: "lookup",
      },
      {
        fieldLogicalName: "accountTitle",
        label: "Account title",
        dataType: "string",
        required: true,
        maxLength: 160,
      },
      {
        fieldLogicalName: "accountNumber",
        label: "Account number",
        dataType: "string",
        maxLength: 80,
      },
      {
        fieldLogicalName: "iban",
        label: "IBAN",
        dataType: "string",
        maxLength: 80,
      },
      {
        fieldLogicalName: "swiftOrRoutingCode",
        label: "SWIFT / Routing code",
        dataType: "string",
        maxLength: 80,
      },
      {
        fieldLogicalName: "branchName",
        label: "Branch",
        dataType: "string",
        maxLength: 120,
      },
      {
        fieldLogicalName: "branchCode",
        label: "Branch code",
        dataType: "string",
        maxLength: 40,
      },
      {
        fieldLogicalName: "countryCode",
        label: "Country",
        dataType: "lookup",
        required: true,
        maxLength: 2,
      },
      {
        fieldLogicalName: "currencyCode",
        label: "Currency",
        dataType: "lookup",
        required: true,
        maxLength: 3,
      },
      {
        fieldLogicalName: "isPrimaryPayroll",
        label: "Primary payroll account",
        dataType: "boolean",
      },
      {
        fieldLogicalName: "effectiveFrom",
        label: "Effective from",
        dataType: "date",
        required: true,
      },
      {
        fieldLogicalName: "effectiveTo",
        label: "Effective to",
        dataType: "date",
      },
      {
        fieldLogicalName: "employeeNotes",
        label: "Notes",
        dataType: "multiline-string",
      },
    ],
  };

  return fieldsByRelationship[relationshipName];
}

function buildEmployeeField(
  definition: EmployeeFieldDefinition,
  requiredFields: ReadonlySet<string> = requiredEmployeeFields,
  settings?: EmployeeRuntimeSettings | null,
): FieldMetadata {
  const generatedMetadata =
    definition.logicalName === "employeeCode" &&
    settings?.autoGenerateEmployeeId !== false
      ? {
          autoGenerated: true,
          formatSource: "settings" as const,
          settingsKey: "employee.employeeCodeFormat",
          lockedByDefault: true,
          unlockableByCustomization: true,
        }
      : {};
  const dependencyMetadata = employeeLookupDependencyMetadata(
    definition.logicalName,
  );

  return {
    id: `employee.${definition.logicalName}`,
    logicalName: definition.logicalName,
    displayName: definition.displayName,
    version: "0.5.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: "employee",
    dataType: definition.dataType,
    requirementLevel: requiredFields.has(definition.logicalName)
      ? "required"
      : "none",
    behavior: "normal",
    isPrimaryName: definition.logicalName === "fullName",
    isOwner: definition.logicalName === "ownerId",
    isStatus: definition.logicalName === "status",
    isSubStatus: definition.logicalName === "subStatus",
    minLength: definition.minLength,
    maxLength: definition.maxLength,
    backendFieldName:
      definition.logicalName === "ownerId" ? "ownerUserId" : undefined,
    ...generatedMetadata,
    ...dependencyMetadata,
    options: employeeOptionSets[definition.logicalName],
    lookupTargets: definition.lookupEntity
      ? [{ entityLogicalName: definition.lookupEntity }]
      : undefined,
  };
}

function employeeLookupDependencyMetadata(logicalName: string) {
  if (logicalName === "stateProvinceId") {
    return {
      dependsOnFieldId: "countryId",
      dependencyFilterKey: "countryId",
      resetOnParentChange: true,
    };
  }

  if (logicalName === "cityId") {
    return {
      dependsOnFieldId: "stateProvinceId",
      dependencyFilterKey: "stateProvinceId",
      resetOnParentChange: true,
    };
  }

  if (logicalName === "teamId") {
    return {
      dependsOnFieldId: "departmentId",
      dependencyFilterKey: "departmentId",
      resetOnParentChange: true,
    };
  }

  if (logicalName === "departmentId") {
    return {
      dependsOnFieldId: "businessUnitId",
      dependencyFilterKey: "businessUnitId",
      resetOnParentChange: true,
    };
  }

  if (logicalName === "businessUnitId") {
    return {
      dependsOnFieldId: "organizationId",
      dependencyFilterKey: "organizationId",
      resetOnParentChange: true,
    };
  }

  if (logicalName === "subStatus") {
    return {
      dependsOnFieldId: "status",
      dependencyFilterKey: "status",
      resetOnParentChange: true,
    };
  }

  return {};
}

function extractViewColumns(
  columnsJson: unknown,
): readonly ViewColumnMetadata[] {
  const fallback = fallbackEmployeeView().columns;

  if (!columnsJson || typeof columnsJson !== "object") {
    return fallback;
  }

  const columns = (columnsJson as { columns?: unknown }).columns;

  if (!Array.isArray(columns)) {
    return fallback;
  }

  const mapped = columns
    .map((column, index): ViewColumnMetadata | null => {
      const columnKey =
        typeof column === "string"
          ? column
          : column && typeof column === "object"
            ? (column as { columnKey?: unknown }).columnKey
            : null;

      return typeof columnKey === "string"
        ? {
            fieldLogicalName: normalizeEmployeeFieldName(columnKey),
            order: index,
          }
        : null;
    })
    .filter((column): column is ViewColumnMetadata => Boolean(column));

  return mapped.length ? mapped : fallback;
}

function normalizeEmployeeFieldName(fieldName: string) {
  const fieldMap: Record<string, string> = {
    email: "workEmail",
    managerEmployeeId: "reportingManagerEmployeeId",
  };

  return fieldMap[fieldName] ?? fieldName;
}

const requiredEmployeeFields = new Set([
  "employeeCode",
  "firstName",
  "lastName",
  "phone",
  "employmentStatus",
  "hireDate",
]);

function resolveRequiredEmployeeFields(
  settings?: EmployeeRuntimeSettings | null,
) {
  const fields = new Set(requiredEmployeeFields);

  if (!settings) {
    return fields;
  }

  setRequiredField(fields, "employeeCode", !settings.autoGenerateEmployeeId, {
    allowRemovingSystemRequired: true,
  });
  setRequiredField(fields, "personalEmail", settings.requirePersonalEmail);
  setRequiredField(fields, "hireDate", settings.requireJoiningDate, {
    allowRemovingSystemRequired: true,
  });
  setRequiredField(fields, "departmentId", settings.requireDepartment);
  setRequiredField(fields, "designationId", settings.requireDesignation);
  setRequiredField(fields, "locationId", settings.requireWorkLocation);

  const requiresManager =
    settings.requireReportingManager ||
    settings.allowEmployeeWithoutManager === false;
  setRequiredField(fields, "reportingManagerEmployeeId", requiresManager);

  if (settings.requireEmergencyContact) {
    fields.add("emergencyContactName");
    fields.add("emergencyContactRelationTypeId");
    fields.add("emergencyContactPhone");
  }

  return fields;
}

function setRequiredField(
  fields: Set<string>,
  fieldLogicalName: string,
  required?: boolean,
  options: { readonly allowRemovingSystemRequired?: boolean } = {},
) {
  if (required === true) {
    fields.add(fieldLogicalName);
  } else if (
    required === false &&
    (options.allowRemovingSystemRequired ||
      !requiredEmployeeFields.has(fieldLogicalName))
  ) {
    fields.delete(fieldLogicalName);
  }
}

function requiredFormField(
  fieldLogicalName: string,
  order: number,
  requiredFields: ReadonlySet<string>,
) {
  return {
    fieldLogicalName,
    order,
    requirementLevel: requiredFields.has(fieldLogicalName)
      ? ("required" as const)
      : ("none" as const),
  };
}

function employeeFormRequirementLevel(
  fieldLogicalName: string,
  isExplicitlyRequired: boolean,
  requiredFields: ReadonlySet<string>,
) {
  if (fieldLogicalName === "teamId") {
    return "none" as const;
  }

  return isExplicitlyRequired || requiredFields.has(fieldLogicalName)
    ? ("required" as const)
    : ("none" as const);
}

const employeeOptionSets: Record<string, readonly OptionSetValueMetadata[]> = {
  employmentStatus: EMPLOYEE_STATUS_OPTIONS,
  employeeType: EMPLOYEE_TYPE_OPTIONS,
  workMode: WORK_MODE_OPTIONS,
  contractType: CONTRACT_TYPE_OPTIONS,
  gender: GENDER_OPTIONS,
  maritalStatus: MARITAL_STATUS_OPTIONS,
  bloodGroup: BLOOD_GROUP_OPTIONS,
  status: RECORD_STATUS_OPTIONS,
  subStatus: RECORD_SUB_STATUS_OPTIONS,
};

function ensureSystemForms(forms: readonly FormMetadata[]) {
  const byLogicalName = new Map<string, FormMetadata>();

  for (const form of [...systemEmployeeForms(), ...forms]) {
    byLogicalName.set(form.logicalName, ensureSystemRelatedTabs(form));
  }

  return Array.from(byLogicalName.values()).map(normalizeRuntimeFormLayout);
}

function ensureSystemRelatedTabs(form: FormMetadata): FormMetadata {
  if (form.formType !== "main") return form;

  const existingKeys = new Set(form.tabs?.map((tab) => tab.tabKey) ?? []);
  const existingRelationships = new Set(
    form.tabs
      ?.map((tab) => tab.subgrid?.relationshipName)
      .filter((value): value is string => Boolean(value)) ?? [],
  );
  const additions = [
    formRelatedTab("payslips", "Payslips", 66, "employee_payslips"),
  ].filter(
    (tab) =>
      !existingKeys.has(tab.tabKey) &&
      !existingRelationships.has(tab.subgrid.relationshipName),
  );

  if (!additions.length) return form;

  return {
    ...form,
    tabs: [...(form.tabs ?? []), ...additions].sort(
      (left, right) => left.order - right.order,
    ),
  };
}

function normalizeRuntimeFormLayout(form: FormMetadata): FormMetadata {
  return {
    ...form,
    columns: normalizeFormColumnCount(form.columns ?? 3),
    sections: form.sections.map((section) => ({
      ...section,
      columns: normalizeFormColumnCount(
        section.columns ?? columnsFromSectionLayoutValue(section.layout),
      ),
      layout: normalizeSectionLayout(
        section.layout,
        section.columns ?? columnsFromSectionLayoutValue(section.layout),
      ),
    })),
  };
}

function columnsFromSectionLayoutValue(
  layout: FormSectionMetadata["layout"] | undefined,
) {
  if (layout === "three-column") return 3;
  if (layout === "two-column") return 2;
  return 1;
}

function normalizeSectionLayout(
  layout: FormSectionMetadata["layout"] | undefined,
  columns: unknown,
): FormSectionMetadata["layout"] {
  if (layout === "three-column" || layout === "two-column") return layout;
  const normalizedColumns = normalizeFormColumnCount(Number(columns));
  if (normalizedColumns === 3) return "three-column";
  if (normalizedColumns === 2) return "two-column";
  return "single-column";
}

function ensureDefaultView(views: readonly ViewMetadata[]) {
  const byLogicalName = new Map<string, ViewMetadata>();

  for (const view of [...fallbackEmployeeViews(), ...views]) {
    byLogicalName.set(view.logicalName, view);
  }

  /*
   * Two sources can describe the same view under different keys, which shows
   * the user the same entry twice. The later definition wins, so a published
   * view replaces the built-in one it duplicates.
   */
  const byDisplayName = new Map<string, ViewMetadata>();

  for (const view of byLogicalName.values()) {
    byDisplayName.set(view.displayName.trim().toLowerCase(), view);
  }

  return Array.from(byDisplayName.values());
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateValue(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function readUserRoleIds(user: unknown): readonly string[] {
  if (!user || typeof user !== "object") return [];
  const roles = (user as { roles?: unknown }).roles;
  if (!Array.isArray(roles)) return [];

  return roles
    .map((role) =>
      role && typeof role === "object" ? (role as { id?: unknown }).id : null,
    )
    .filter((id): id is string => typeof id === "string");
}

function readNestedName(value: unknown, fields: readonly string[]) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const values = fields
    .map((field) => record[field])
    .filter(
      (fieldValue): fieldValue is string =>
        typeof fieldValue === "string" && fieldValue.trim().length > 0,
    );

  return values.join(" ").trim();
}

function readLookupPrimaryName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return (
    stringValue(record.name) ||
    stringValue(record.fullName) ||
    stringValue(record.displayName) ||
    stringValue(record.label)
  );
}

function lookupOptionFromRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = stringValue(record.id);
  const name = readLookupPrimaryName(record);

  return id && name
    ? {
        id,
        name,
        code: stringValue(record.code),
        employeeLevelId: stringValue(record.employeeLevelId),
      }
    : null;
}

function compactLookupOptions(
  options: readonly ({
    readonly id: string;
    readonly name: string;
    readonly subtitle?: string | null;
    readonly code?: string | null;
  } | null)[],
) {
  return options.filter(
    (
      option,
    ): option is {
      id: string;
      name: string;
      subtitle?: string | null;
      code?: string | null;
    } => Boolean(option?.id && option.name),
  );
}

function emptyToNull(value: EmployeeRuntimeFieldValue) {
  if (typeof value === "string") return value.trim() || null;
  return value ?? null;
}
