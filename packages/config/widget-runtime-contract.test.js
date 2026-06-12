"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "../..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("all five target Modules expose a real Timeline adapter path", () => {
  const employeeAdapter = source(
    "apps/web/lib/runtime/modules/employee-data.adapter.ts",
  );
  assert.match(employeeAdapter, /async getTimelineEntries/);
  assert.match(employeeAdapter, /\/history/);

  const specs = source(
    "apps/web/lib/runtime/modules/standard-module-specs.ts",
  );
  for (const path of [
    "/api/leave-requests/{recordId}/timeline",
    "/api/attendance/{recordId}/timeline",
    "/api/timesheets/{recordId}/timeline",
    "/api/projects/{recordId}/timeline",
  ]) {
    assert.ok(specs.includes(path), path);
  }
  const adapter = source(
    "apps/web/lib/runtime/modules/standard-module-data.adapter.ts",
  );
  assert.match(adapter, /async getTimelineEntries/);
  assert.match(adapter, /readTimelineEntries/);
});

test("Timeline endpoints authorize the Record before reading audit data", () => {
  const contracts = [
    [
      "services/api/src/modules/leave/leave-requests.controller.ts",
      "getLeaveRequest",
    ],
    [
      "services/api/src/modules/attendance/attendance.controller.ts",
      "getAttendanceEntry",
    ],
    [
      "services/api/src/modules/timesheets/timesheets.controller.ts",
      "getTimesheetById",
    ],
    [
      "services/api/src/modules/projects/projects.controller.ts",
      "findById",
    ],
  ];
  for (const [path, accessMethod] of contracts) {
    const content = source(path);
    assert.ok(content.includes(accessMethod), path);
    assert.ok(content.includes("listRecordTimeline"), path);
    assert.ok(content.includes("'timeline.read'"), path);
  }
});

test("Timesheet record and Timeline reads preserve Employee Self Service scope", () => {
  const controller = source(
    "services/api/src/modules/timesheets/timesheets.controller.ts",
  );
  const service = source(
    "services/api/src/modules/timesheets/timesheets.service.ts",
  );
  const page = source(
    "apps/web/app/(authenticated)/timesheets/[timesheetId]/page.tsx",
  );

  assert.match(controller, /@Get\(':timesheetId'\)/);
  assert.match(controller, /getTimesheetById\(user, timesheetId\)/);
  assert.match(service, /allowOwn = true/);
  assert.match(
    service,
    /timesheet\.employee\.userId === currentUser\.userId/,
  );
  assert.doesNotMatch(page, /\/timesheets\/team\//);
});

test("Widget package persistence and designer placement are storage-backed", () => {
  const schema = source("services/api/prisma/schema.prisma");
  assert.match(
    schema,
    /enum CustomizationSolutionComponentType[\s\S]*\bwidget\b/,
  );
  const service = source(
    "services/api/src/modules/customization/customization.service.ts",
  );
  assert.match(service, /componentType: 'widget'/);
  assert.match(service, /listSupportedSystemWidgets/);
  assert.match(service, /source: 'system-widget-registry'/);

  const explorer = source(
    "apps/web/app/(authenticated)/settings/customization/_components/package-detail-shell.tsx",
  );
  assert.match(
    explorer,
    /\{ value: "widget", label: "Widgets", storageBacked: true \}/,
  );
  const designer = source(
    "apps/web/app/(authenticated)/settings/customization/_components/form-designer-workspace.tsx",
  );
  assert.match(designer, /listSupportedSystemWidgets/);
  assert.match(designer, /Custom Widget \(future\)/);
  assert.match(designer, /components: \[\.\.\.\(section\.components/);
});

test("standard record routes consume published-only Widget placement", () => {
  const helper = source(
    "apps/web/lib/runtime/modules/standard-module-route-helpers.ts",
  );
  assert.match(helper, /getTableForms/);
  assert.match(helper, /hasExplicitWidgetPlacement/);
  assert.match(helper, /lifecycleState: "published"/);
  assert.match(helper, /Object\.prototype\.hasOwnProperty/);

  for (const path of [
    "apps/web/app/(authenticated)/leaves/[id]/page.tsx",
    "apps/web/app/(authenticated)/attendance/[entryId]/page.tsx",
    "apps/web/app/(authenticated)/timesheets/[timesheetId]/page.tsx",
    "apps/web/app/(authenticated)/projects/[projectId]/page.tsx",
  ]) {
    assert.match(source(path), /buildPublishedStandardRouteRuntime/);
  }
});

test("Employee system Forms declare Widget-capable Form types", () => {
  const adapter = source(
    "apps/web/lib/runtime/modules/employee-metadata.adapter.ts",
  );
  assert.match(adapter, /function fallbackEmployeeForm[\s\S]*formType: "main"/);
  assert.match(
    adapter,
    /function minimalEmployeeForm[\s\S]*formType: "minimal"/,
  );
});
