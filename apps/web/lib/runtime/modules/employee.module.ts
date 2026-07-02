import type {
  CommandDefinition,
  StatusGroupConfig,
} from "../command-runtime.types";
import type { ModuleConfig } from "../module-runtime.types";
import type { PermissionRequirement } from "../security-runtime.types";

export const EMPLOYEE_RUNTIME_MODULE_KEY = "employees";
export const EMPLOYEE_RUNTIME_ENTITY_LOGICAL_NAME = "employee";
export const EMPLOYEE_RUNTIME_ROUTE_BASE = "/employees";

export const employeeRuntimePermissions = {
  read: permission("employees.read", "read", "tenant"),
  create: permission("employees.create", "create", "tenant"),
  update: permission("employees.update", "update", "tenant"),
  delete: permission("employees.delete", "delete", "tenant"),
  assign: permission("employees.assign", "assign", "tenant"),
  import: permission("employees.import", "import", "tenant"),
  export: permission("employees.export", "export", "tenant"),
  share: permission("employees.share", "execute", "tenant"),
} as const;

export const employeeRuntimeModuleConfig: ModuleConfig = {
  key: EMPLOYEE_RUNTIME_MODULE_KEY,
  label: "Employees",
  description: "Employee master data and profile runtime shell.",
  entityLogicalName: EMPLOYEE_RUNTIME_ENTITY_LOGICAL_NAME,
  routeBase: EMPLOYEE_RUNTIME_ROUTE_BASE,
  defaultFormLogicalName: "employee.main.full",
  defaultViewLogicalName: "employees.all",
  iconName: "users",
  order: 10,
  capabilities: ["timeline", "reportingHierarchy"],
};

export const employeeRuntimeStatusGroupConfig: StatusGroupConfig = {
  ownerFieldLogicalName: "ownerId",
  statusFieldLogicalName: "status",
  subStatusFieldLogicalName: "subStatus",
  placement: "detail-status-group",
  ownerCommandKey: "record.assignOwner",
  statusCommandKey: "record.changeStatus",
  subStatusCommandKey: "record.changeSubStatus",
};

export const employeeRuntimeSafeCommands: readonly CommandDefinition[] = [
  {
    key: "system.back",
    label: "Back",
    scope: "system",
    placement: "detail-command-bar",
    executionMode: "navigation",
    handlerKey: "system.back",
    order: 10,
  },
  {
    key: "system.new",
    label: "New",
    scope: "system",
    placement: "list-command-bar",
    executionMode: "navigation",
    handlerKey: "system.new",
    permission: employeeRuntimePermissions.create,
    order: 20,
  },
  {
    key: "system.edit",
    label: "Edit",
    scope: "system",
    placement: "detail-command-bar",
    executionMode: "navigation",
    handlerKey: "system.edit",
    permission: employeeRuntimePermissions.update,
    order: 30,
  },
  {
    key: "system.refresh",
    label: "Refresh",
    scope: "system",
    placement: "list-command-bar",
    executionMode: "navigation",
    handlerKey: "system.refresh",
    order: 40,
  },
  {
    key: "system.export",
    label: "Export",
    scope: "system",
    placement: "list-command-bar",
    executionMode: "client",
    handlerKey: "system.export",
    permission: employeeRuntimePermissions.export,
    groupKey: "data-transfer",
    groupLabel: "Data Transfer",
    order: 45,
  },
  {
    key: "system.import",
    label: "Import",
    scope: "system",
    placement: "list-command-bar",
    executionMode: "navigation",
    handlerKey: "system.import",
    permission: employeeRuntimePermissions.import,
    groupKey: "data-transfer",
    groupLabel: "Data Transfer",
    order: 46,
  },
  {
    key: "system.exportTemplate",
    label: "Export Template",
    scope: "system",
    placement: "list-command-bar",
    executionMode: "client",
    handlerKey: "system.exportTemplate",
    permission: employeeRuntimePermissions.export,
    groupKey: "data-transfer",
    groupLabel: "Data Transfer",
    order: 47,
  },
  {
    key: "system.save",
    label: "Save",
    description: "Save the record through the module data adapter.",
    scope: "system",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "system.save",
    order: 50,
  },
  {
    key: "system.saveAndClose",
    label: "Save & Close",
    description:
      "Save the record through the module data adapter and return to the list.",
    scope: "system",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "system.saveAndClose",
    order: 60,
  },
];

export const employeeRuntimePreparedCommands: readonly CommandDefinition[] = [
  {
    key: "system.delete",
    label: "Delete",
    description: "Delete this Employee record.",
    scope: "system",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "system.delete",
    permission: employeeRuntimePermissions.delete,
    isDestructive: true,
    requiresConfirmation: true,
    confirmation: {
      title: "Delete this record?",
      description:
        "This will remove the record from active use. Data may be retained according to module policy.",
      confirmLabel: "Delete",
      destructive: true,
    },
    order: 90,
  },
  {
    key: "selection.delete",
    label: "Delete",
    description: "Delete selected Employee records.",
    scope: "selection",
    placement: "bulk-menu",
    executionMode: "client",
    handlerKey: "selection.delete",
    permission: employeeRuntimePermissions.delete,
    isDestructive: true,
    requiresConfirmation: true,
    confirmation: {
      title: "Delete selected records?",
      description:
        "This will remove {selectedCount} selected records from active use. Data may be retained according to module policy.",
      confirmLabel: "Delete",
      destructive: true,
    },
    visibilityRules: [{ operator: "record-selected" }],
    order: 91,
  },
  {
    key: "selection.assignOwner",
    label: "Assign",
    description: "Assign selected records to a new owner.",
    scope: "selection",
    placement: "bulk-menu",
    executionMode: "client",
    handlerKey: "selection.assignOwner",
    permission: employeeRuntimePermissions.assign,
    visibilityRules: [{ operator: "record-selected" }],
    order: 92,
  },
  {
    key: "record.assignOwner",
    label: "Assign",
    description: "Assign this record to a new owner.",
    scope: "record",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "record.assignOwner",
    permission: employeeRuntimePermissions.assign,
    dependencies: ["ownerId"],
    statusGroup: employeeRuntimeStatusGroupConfig,
    order: 100,
  },
  {
    key: "record.changeStatus",
    label: "Status",
    description:
      "Record status API is not available yet; status values save through the form adapter when backend support is added.",
    scope: "record",
    placement: "detail-status-group",
    executionMode: "client",
    handlerKey: "record.changeStatus",
    permission: employeeRuntimePermissions.update,
    isDisabled: true,
    disabledReason:
      "Dedicated Employee record status API is not available yet.",
    dependencies: ["status"],
    order: 110,
  },
  {
    key: "record.changeSubStatus",
    label: "Sub Status",
    description:
      "Record sub-status API is not available yet; sub-status values save through the form adapter when backend support is added.",
    scope: "record",
    placement: "detail-status-group",
    executionMode: "client",
    handlerKey: "record.changeSubStatus",
    permission: employeeRuntimePermissions.update,
    isDisabled: true,
    disabledReason:
      "Dedicated Employee record sub-status API is not available yet.",
    dependencies: ["subStatus"],
    order: 120,
  },
  {
    key: "record.share",
    label: "Share",
    description:
      "Prepared Employee share command; not active until sharing backend is confirmed.",
    scope: "record",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "record.share",
    permission: employeeRuntimePermissions.share,
    order: 130,
  },
  {
    key: "record.export",
    label: "Export",
    description: "Export this Employee record through the module data adapter.",
    scope: "record",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "record.export",
    permission: employeeRuntimePermissions.export,
    order: 140,
  },
];

export const employeeRuntimeCommands: readonly CommandDefinition[] = [
  ...employeeRuntimeSafeCommands,
  ...employeeRuntimePreparedCommands,
];

function permission(
  permissionKey: string,
  operation: NonNullable<PermissionRequirement["operation"]>,
  scope: NonNullable<PermissionRequirement["scope"]>,
): PermissionRequirement {
  return { permissionKey, operation, scope };
}
