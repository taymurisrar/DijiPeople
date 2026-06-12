"use client";

import type { CommandDefinition } from "../../../../lib/runtime/command-runtime.types";
import type {
  EntityMetadata,
  FieldMetadata,
  FormMetadata,
  ViewMetadata,
} from "../../../../lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "../../../../lib/runtime/module-runtime.types";
import { groupCommands } from "../../../../lib/runtime/command-runtime.resolver";
import { resolveDetailStatusGroupConfig } from "../../../../lib/runtime/command-runtime.resolver";
import {
  ModuleDetailShell,
  ModuleListShell,
  ModuleRuntimeProvider,
} from "../index";

const employeeFields: readonly FieldMetadata[] = [
  metadataField("employeeId", "Employee ID", "string", { isPrimaryName: true }),
  metadataField("ownerId", "Owner", "lookup", { isOwner: true }),
  metadataField("status", "Status", "optionset", {
    isStatus: true,
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  }),
  metadataField("subStatus", "Sub-status", "optionset", {
    isSubStatus: true,
    options: [
      { value: "probation", label: "Probation" },
      { value: "confirmed", label: "Confirmed" },
    ],
  }),
];

const employeeEntity: EntityMetadata = {
  id: "example-employee-entity",
  logicalName: "sampleEmployee",
  displayName: "Employee",
  version: "0.0.0-example",
  lifecycleState: "published",
  layer: "unmanaged",
  collectionName: "sampleEmployees",
  primaryIdField: "id",
  primaryNameField: "employeeId",
  ownerField: "ownerId",
  statusField: "status",
  subStatusField: "subStatus",
  fields: employeeFields,
  defaultFormLogicalName: "sampleEmployee.main",
  defaultViewLogicalName: "sampleEmployee.active",
};

const employeeForms: readonly FormMetadata[] = [
  {
    id: "example-employee-form",
    logicalName: "sampleEmployee.main",
    displayName: "Employee main form",
    version: "0.0.0-example",
    lifecycleState: "published",
    layer: "unmanaged",
    entityLogicalName: employeeEntity.logicalName,
    mode: "edit",
    sections: [
      {
        id: "summary",
        label: "Summary",
        order: 10,
        layout: "two-column",
        fields: [
          { fieldLogicalName: "employeeId", order: 10 },
          { fieldLogicalName: "ownerId", order: 20 },
          { fieldLogicalName: "status", order: 30 },
          { fieldLogicalName: "subStatus", order: 40 },
        ],
      },
    ],
  },
];

const employeeViews: readonly ViewMetadata[] = [
  {
    id: "example-employee-view",
    logicalName: "sampleEmployee.active",
    displayName: "Active employees",
    version: "0.0.0-example",
    lifecycleState: "published",
    layer: "unmanaged",
    entityLogicalName: employeeEntity.logicalName,
    type: "main",
    columns: [
      { fieldLogicalName: "employeeId", order: 10 },
      { fieldLogicalName: "status", order: 20 },
      { fieldLogicalName: "subStatus", order: 30 },
    ],
  },
];

const employeeCommands: readonly CommandDefinition[] = [
  command("system.back", "Back", "navigation", "detail-command-bar"),
  command("system.edit", "Edit", "navigation", "detail-command-bar"),
  command("system.refresh", "Refresh", "navigation", "list-command-bar"),
  command("system.delete", "Delete", "api", "detail-command-bar", {
    isDestructive: true,
    requiresConfirmation: true,
  }),
  command("record.assignOwner", "Owner", "api", "detail-status-group", {
    dependencies: ["ownerId"],
  }),
  command("record.changeStatus", "Status", "api", "detail-status-group", {
    dependencies: ["status"],
  }),
  command(
    "record.changeSubStatus",
    "Sub-status",
    "api",
    "detail-status-group",
    {
      dependencies: ["subStatus"],
    },
  ),
];

const employeeRuntime: ModuleRuntimeContext = {
  tenant: {
    tenantId: "example-tenant",
    tenantSlug: "example",
    displayName: "Example tenant",
    locale: "en-US",
    timezone: "Asia/Riyadh",
    dateFormat: "yyyy-MM-dd",
    timeFormat: "HH:mm",
    dateTimeFormat: "yyyy-MM-dd HH:mm",
    textDirection: "ltr",
    cachePartitionKey: "tenant:example",
    branding: {
      appTitle: "DijiPeople",
      brandName: "DijiPeople",
      primaryColor: "#2563eb",
      secondaryColor: "#0f172a",
      fontFamilyKey: "INTER",
      fontStack: "Inter, ui-sans-serif, system-ui, sans-serif",
      bodyFontFamilyKey: "INTER",
      bodyFontStack: "Inter, ui-sans-serif, system-ui, sans-serif",
      headingFontFamilyKey: "INTER",
      headingFontStack: "Inter, ui-sans-serif, system-ui, sans-serif",
      themeMode: "light",
      density: "comfortable",
      borderRadius: "large",
    },
  },
  security: {
    principal: {
      userId: "example-user",
      tenantId: "example-tenant",
      roleKeys: ["System Customizer"],
      permissionKeys: ["employees.read", "employees.update"],
    },
    fieldSecurityRules: [],
    dataAccessRules: [],
  },
  module: {
    key: "sampleEmployees",
    label: "Employees",
    entityLogicalName: employeeEntity.logicalName,
    routeBase: "/employees",
  },
  metadata: {
    entity: employeeEntity,
    forms: employeeForms,
    views: employeeViews,
    commands: employeeCommands,
  },
  recordId: "example-employee-1",
};

const employeeRecord = {
  id: "example-employee-1",
  employeeId: "EMP-0001",
  ownerId: "People Operations",
  status: "active",
  subStatus: "confirmed",
};

export function EmployeeRuntimeExample() {
  const commandGroups = groupCommands(employeeCommands);
  const statusGroup = resolveDetailStatusGroupConfig(
    employeeEntity,
    employeeCommands,
  );

  return (
    <ModuleRuntimeProvider
      activeForm={employeeForms[0]}
      activeView={employeeViews[0]}
      record={employeeRecord}
      runtime={employeeRuntime}
    >
      <div className="grid gap-8">
        <ModuleListShell
          activeViewId={employeeViews[0]?.viewId ?? employeeViews[0]?.id}
          commands={commandGroups}
          onCommand={() => undefined}
          onViewChange={() => undefined}
          runtime={employeeRuntime}
          tableSlot={
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
              Table slot placeholder
            </div>
          }
        />
        <ModuleDetailShell
          activeFormId={employeeForms[0]?.id}
          commands={commandGroups}
          onCommand={() => undefined}
          onFormChange={() => undefined}
          record={employeeRecord}
          runtime={employeeRuntime}
          statusGroupConfig={
            statusGroup
              ? {
                  ...statusGroup,
                  enabled: true,
                  ownerField: employeeFields[1],
                  statusField: employeeFields[2],
                  subStatusField: employeeFields[3],
                }
              : null
          }
        >
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            Form slot placeholder
          </div>
        </ModuleDetailShell>
      </div>
    </ModuleRuntimeProvider>
  );
}

function metadataField(
  logicalName: string,
  displayName: string,
  dataType: FieldMetadata["dataType"],
  overrides: Partial<FieldMetadata> = {},
): FieldMetadata {
  return {
    id: `example-${logicalName}`,
    logicalName,
    displayName,
    version: "0.0.0-example",
    lifecycleState: "published",
    layer: "unmanaged",
    entityLogicalName: "sampleEmployee",
    dataType,
    requirementLevel: "none",
    behavior: "normal",
    ...overrides,
  };
}

function command(
  key: string,
  label: string,
  executionMode: CommandDefinition["executionMode"],
  placement: CommandDefinition["placement"],
  overrides: Partial<CommandDefinition> = {},
): CommandDefinition {
  return {
    key,
    label,
    scope: key.startsWith("system.") ? "system" : "record",
    placement,
    executionMode,
    handlerKey: key,
    ...overrides,
  };
}
