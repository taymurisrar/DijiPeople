"use strict";

const SYSTEM_WIDGET_REGISTRY = Object.freeze({
  "system.timeline": Object.freeze({
    widgetKey: "system.timeline",
    aliases: Object.freeze(["timeline"]),
    displayName: "Timeline",
    widgetType: "system",
    supportedModuleCapabilities: Object.freeze(["timeline"]),
    supportedFormComponentTypes: Object.freeze(["widget"]),
    requiredDataAdapterMethods: Object.freeze(["getTimelineEntries"]),
    requiredPermissions: Object.freeze(["timeline.read"]),
    allowedRoles: Object.freeze([]),
    savedRecordRequired: true,
    emptyState: "No Timeline activity yet.",
    unsavedRecordMessage:
      "Timeline will be available after this record is saved.",
    missingAdapterDiagnostic:
      "Timeline is supported by this Module, but its data adapter does not implement getTimelineEntries.",
  }),
  "system.reportingHierarchy": Object.freeze({
    widgetKey: "system.reportingHierarchy",
    aliases: Object.freeze(["reporting_hierarchy"]),
    displayName: "Reporting Hierarchy",
    widgetType: "system",
    supportedModules: Object.freeze(["employees"]),
    supportedModuleCapabilities: Object.freeze(["reportingHierarchy"]),
    supportedFormComponentTypes: Object.freeze(["widget"]),
    requiredDataAdapterMethods: Object.freeze(["getWidgetData"]),
    requiredPermissions: Object.freeze(["hierarchy.read"]),
    allowedRoles: Object.freeze([]),
    savedRecordRequired: true,
    emptyState: "No reporting relationships are available for this Employee.",
    unsavedRecordMessage:
      "Reporting Hierarchy will be available after this record is saved.",
    missingAdapterDiagnostic:
      "Reporting Hierarchy is supported by Employees, but its data adapter does not implement getWidgetData.",
  }),
  "employee.profilePhoto": Object.freeze({
    widgetKey: "employee.profilePhoto",
    aliases: Object.freeze(["profile_photo"]),
    displayName: "Profile Photo",
    widgetType: "system",
    supportedModules: Object.freeze(["employees"]),
    supportedModuleCapabilities: Object.freeze([]),
    supportedFormComponentTypes: Object.freeze(["widget"]),
    requiredDataAdapterMethods: Object.freeze(["getWidgetData"]),
    requiredPermissions: Object.freeze(["employees.read"]),
    allowedRoles: Object.freeze([]),
    savedRecordRequired: true,
    emptyState: "No profile photo has been uploaded.",
    unsavedRecordMessage:
      "Profile Photo will be available after this Employee is saved.",
    missingAdapterDiagnostic:
      "Profile Photo is supported by Employees, but its data adapter does not implement getWidgetData.",
  }),
  "system.approvalTracker": Object.freeze({
    widgetKey: "system.approvalTracker",
    aliases: Object.freeze(["approval_tracker"]),
    displayName: "Approval Tracker",
    widgetType: "system",
    supportedModuleCapabilities: Object.freeze(["approvalTracking"]),
    supportedFormComponentTypes: Object.freeze(["widget"]),
    requiredDataAdapterMethods: Object.freeze(["getWidgetData"]),
    requiredPermissions: Object.freeze([
      "approvals.read",
      "approvals.readOwn",
      "approvals.readAssigned",
      "approvals.readTeam",
      "approvals.manage",
    ]),
    allowedRoles: Object.freeze([]),
    savedRecordRequired: true,
    emptyState: "No approval activity is available for this Record.",
    unsavedRecordMessage:
      "Approval Tracker will be available after this record is saved.",
    missingAdapterDiagnostic:
      "Approval Tracker is supported by this Module, but its data adapter does not implement getWidgetData.",
  }),
  "system.documents": Object.freeze({
    widgetKey: "system.documents",
    aliases: Object.freeze(["documents"]),
    displayName: "Documents",
    widgetType: "system",
    supportedModuleCapabilities: Object.freeze(["documents"]),
    supportedFormComponentTypes: Object.freeze(["widget"]),
    requiredDataAdapterMethods: Object.freeze([]),
    requiredPermissions: Object.freeze(["documents.read"]),
    allowedRoles: Object.freeze([]),
    savedRecordRequired: true,
    emptyState: "No documents have been uploaded for this record.",
    unsavedRecordMessage:
      "Documents will be available after this record is saved.",
    missingAdapterDiagnostic:
      "Documents are supported by this Module, but the document widget is not available.",
  }),
});

const SYSTEM_MODULE_CAPABILITIES = Object.freeze({
  employees: Object.freeze(["timeline", "reportingHierarchy"]),
  leaves: Object.freeze(["timeline", "approvalTracking"]),
  attendance: Object.freeze(["timeline"]),
  timesheets: Object.freeze(["timeline", "approvalTracking"]),
  projects: Object.freeze(["timeline", "documents"]),
});

function listSupportedSystemWidgets(moduleKey) {
  const capabilities = SYSTEM_MODULE_CAPABILITIES[moduleKey] || [];
  return Object.values(SYSTEM_WIDGET_REGISTRY).filter((definition) => {
    const supportsModule =
      !definition.supportedModules ||
      definition.supportedModules.includes(moduleKey);
    return (
      supportsModule &&
      definition.supportedModuleCapabilities.every((capability) =>
        capabilities.includes(capability),
      )
    );
  });
}

const SYSTEM_WIDGET_ALIASES = Object.freeze(
  Object.values(SYSTEM_WIDGET_REGISTRY).reduce((aliases, definition) => {
    aliases[definition.widgetKey] = definition.widgetKey;
    for (const alias of definition.aliases) {
      aliases[alias] = definition.widgetKey;
    }
    return aliases;
  }, {}),
);

function resolveSystemWidgetDefinition(widgetKeyOrType) {
  const key = SYSTEM_WIDGET_ALIASES[widgetKeyOrType];
  return key ? SYSTEM_WIDGET_REGISTRY[key] : null;
}

function resolveSystemWidgetAvailability(input) {
  const definition =
    resolveSystemWidgetDefinition(input.widgetKey) ||
    resolveSystemWidgetDefinition(input.widgetType);

  if (!definition) {
    return {
      status:
        input.widgetType === "custom" ||
        (typeof input.widgetKey === "string" &&
          !input.widgetKey.startsWith("system."))
          ? "custom-widget-disabled"
          : "unregistered",
      definition: null,
      message:
        input.widgetType === "custom"
          ? "Custom Widget execution is disabled until plugin or code-activity registration is available."
          : "This Widget is not registered in the System Widget Registry.",
    };
  }

  if (input.lifecycleState && input.lifecycleState !== "published") {
    return {
      status: "unpublished-placement",
      definition,
      message: "Draft Widget placement is not available in runtime.",
    };
  }

  if (
    input.formComponentType &&
    !definition.supportedFormComponentTypes.includes(input.formComponentType)
  ) {
    return {
      status: "unsupported-component",
      definition,
      message: `${definition.displayName} cannot render as a ${input.formComponentType} component.`,
    };
  }

  const moduleCapabilities = new Set(input.moduleCapabilities || []);
  const moduleSupported =
    (!definition.supportedModules ||
      definition.supportedModules.includes(input.moduleKey)) &&
    definition.supportedModuleCapabilities.every((capability) =>
      moduleCapabilities.has(capability),
    );
  if (!moduleSupported) {
    return {
      status: "unsupported-module",
      definition,
      message: `${definition.displayName} is not supported by this Module.`,
    };
  }

  const permissionKeys = new Set(input.permissionKeys || []);
  if (
    definition.requiredPermissions.length > 0 &&
    !definition.requiredPermissions.some((permission) =>
      permissionKeys.has(permission),
    )
  ) {
    return {
      status: "permission-denied",
      definition,
      message: `You do not have permission to view ${definition.displayName}.`,
    };
  }

  if (
    definition.allowedRoles.length > 0 &&
    !hasAllowedRole(input.roleKeys || [], definition.allowedRoles)
  ) {
    return {
      status: "role-denied",
      definition,
      message: `Your role cannot view ${definition.displayName}.`,
    };
  }

  if (definition.savedRecordRequired && !input.recordId) {
    return {
      status: "unsaved-record",
      definition,
      message: definition.unsavedRecordMessage,
    };
  }

  const adapterMethods = new Set(input.adapterMethods || []);
  const missingMethods = definition.requiredDataAdapterMethods.filter(
    (method) => !adapterMethods.has(method),
  );
  if (missingMethods.length > 0) {
    return {
      status: "missing-adapter",
      definition,
      missingAdapterMethods: missingMethods,
      message: definition.missingAdapterDiagnostic,
    };
  }

  return {
    status: "available",
    definition,
    message: "",
  };
}

function hasAllowedRole(actualRoles, allowedRoles) {
  const actual = new Set(actualRoles.map(normalizeRole));
  return allowedRoles.some((role) => actual.has(normalizeRole(role)));
}

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/administrator/g, "admin")
    .replace(/[\s_-]+/g, "");
}

module.exports = {
  SYSTEM_MODULE_CAPABILITIES,
  SYSTEM_WIDGET_REGISTRY,
  listSupportedSystemWidgets,
  resolveSystemWidgetAvailability,
  resolveSystemWidgetDefinition,
};
