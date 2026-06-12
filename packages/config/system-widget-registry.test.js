"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SYSTEM_WIDGET_REGISTRY,
  listSupportedSystemWidgets,
  resolveSystemWidgetAvailability,
  resolveSystemWidgetDefinition,
} = require("./system-widget-registry");

const ADMIN_PERMISSIONS = [
  "timeline.read",
  "hierarchy.read",
  "approvals.read",
];

function availability(overrides = {}) {
  return resolveSystemWidgetAvailability({
    widgetKey: "system.timeline",
    widgetType: "timeline",
    lifecycleState: "published",
    formComponentType: "widget",
    moduleKey: "employees",
    moduleCapabilities: ["timeline", "reportingHierarchy"],
    recordId: "record-1",
    adapterMethods: ["getTimelineEntries", "getWidgetData"],
    permissionKeys: ADMIN_PERMISSIONS,
    roleKeys: ["Global Administrator"],
    ...overrides,
  });
}

test("registers the built-in System Widgets", () => {
  assert.deepEqual(Object.keys(SYSTEM_WIDGET_REGISTRY), [
    "system.timeline",
    "system.reportingHierarchy",
    "employee.profilePhoto",
    "system.approvalTracker",
  ]);
  assert.equal(
    resolveSystemWidgetDefinition("reporting_hierarchy").widgetKey,
    "system.reportingHierarchy",
  );
});

test("allows supported Module capabilities and excludes unsupported Modules", () => {
  assert.equal(availability().status, "available");
  assert.equal(
    availability({
      widgetKey: "system.reportingHierarchy",
      widgetType: "reporting_hierarchy",
      moduleKey: "leaves",
      moduleCapabilities: ["reportingHierarchy"],
    }).status,
    "unsupported-module",
  );
  assert.equal(
    availability({
      widgetKey: "system.approvalTracker",
      widgetType: "approval_tracker",
      moduleKey: "attendance",
      moduleCapabilities: ["timeline"],
    }).status,
    "unsupported-module",
  );
});

test("enforces permissions for seeded role-style permission sets", () => {
  for (const role of [
    "Global Administrator",
    "System Administrator",
    "HR",
  ]) {
    assert.equal(availability({ roleKeys: [role] }).status, "available");
  }
  assert.equal(
    availability({
      roleKeys: ["Employee Self Service"],
      permissionKeys: [],
    }).status,
    "permission-denied",
  );
  assert.equal(
    availability({
      roleKeys: ["Employee Self Service"],
      permissionKeys: ["timeline.read"],
    }).status,
    "available",
  );
});

test("isolates draft placements from published runtime", () => {
  assert.equal(
    availability({ lifecycleState: "draft" }).status,
    "unpublished-placement",
  );
  assert.equal(
    availability({ lifecycleState: "published" }).status,
    "available",
  );
});

test("reports missing adapters and unsaved Records honestly", () => {
  assert.equal(
    availability({ adapterMethods: [] }).status,
    "missing-adapter",
  );
  assert.match(
    availability({ adapterMethods: [] }).message,
    /getTimelineEntries/,
  );
  assert.equal(availability({ recordId: undefined }).status, "unsaved-record");
});

test("declares rendering contracts for Timeline, hierarchy, and approvals", () => {
  assert.deepEqual(
    SYSTEM_WIDGET_REGISTRY["employee.profilePhoto"].requiredDataAdapterMethods,
    ["getWidgetData"],
  );
  assert.deepEqual(
    SYSTEM_WIDGET_REGISTRY["system.timeline"].requiredDataAdapterMethods,
    ["getTimelineEntries"],
  );
  assert.deepEqual(
    SYSTEM_WIDGET_REGISTRY["system.reportingHierarchy"]
      .requiredDataAdapterMethods,
    ["getWidgetData"],
  );
  assert.deepEqual(
    SYSTEM_WIDGET_REGISTRY["system.approvalTracker"]
      .requiredDataAdapterMethods,
    ["getWidgetData"],
  );
});

test("keeps Custom Widget execution disabled", () => {
  assert.equal(
    availability({
      widgetKey: "custom.dashboardCard",
      widgetType: "custom",
    }).status,
    "custom-widget-disabled",
  );
});

test("covers target Module widget capability matrix", () => {
  const matrix = {
    employees: ["timeline", "reportingHierarchy"],
    leaves: ["timeline", "approvalTracking"],
    attendance: ["timeline"],
    timesheets: ["timeline", "approvalTracking"],
    projects: ["timeline"],
  };

  for (const [moduleKey, capabilities] of Object.entries(matrix)) {
    const timeline = availability({
      moduleKey,
      moduleCapabilities: capabilities,
    });
    assert.equal(timeline.status, "available", `${moduleKey} Timeline`);

    const hierarchy = availability({
      widgetKey: "system.reportingHierarchy",
      widgetType: "reporting_hierarchy",
      moduleKey,
      moduleCapabilities: capabilities,
    });
    assert.equal(
      hierarchy.status,
      moduleKey === "employees" ? "available" : "unsupported-module",
      `${moduleKey} hierarchy`,
    );

    const approval = availability({
      widgetKey: "system.approvalTracker",
      widgetType: "approval_tracker",
      moduleKey,
      moduleCapabilities: capabilities,
    });
    assert.equal(
      approval.status,
      ["leaves", "timesheets"].includes(moduleKey)
        ? "available"
        : "unsupported-module",
      `${moduleKey} approval`,
    );
  }
});

test("filters the Form Designer palette by Module capability", () => {
  assert.deepEqual(
    listSupportedSystemWidgets("employees").map((widget) => widget.widgetKey),
    ["system.timeline", "system.reportingHierarchy", "employee.profilePhoto"],
  );
  assert.deepEqual(
    listSupportedSystemWidgets("leaves").map((widget) => widget.widgetKey),
    ["system.timeline", "system.approvalTracker"],
  );
  assert.deepEqual(
    listSupportedSystemWidgets("attendance").map(
      (widget) => widget.widgetKey,
    ),
    ["system.timeline"],
  );
  assert.deepEqual(
    listSupportedSystemWidgets("timesheets").map(
      (widget) => widget.widgetKey,
    ),
    ["system.timeline", "system.approvalTracker"],
  );
  assert.deepEqual(
    listSupportedSystemWidgets("projects").map((widget) => widget.widgetKey),
    ["system.timeline"],
  );
});
