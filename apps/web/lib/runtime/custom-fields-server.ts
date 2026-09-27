/* Server-only: server-api reaches next/headers, so no client bundle may import this. */
import { apiRequestJson } from "@/lib/server-api";
import { withCustomFields, type CustomFieldDefinition } from "./custom-fields";
import type { ModuleRuntimeContext } from "./module-runtime.types";

/*
 * Which customization table each generic record page edits — TASK-0035,
 * ADR-0024. The runtime specs name modules by route (`payroll-cycles`,
 * `settings-departments`), the customization registry by table
 * (`payrollCycles`, `departments`), and the API binds values by table. Only
 * modules whose routes carry `@CustomFields` are listed, so no other page pays
 * for a request.
 */
const MODULE_TABLE_KEYS: Readonly<Record<string, string>> = {
  leaves: "leaveRequests",
  attendance: "attendanceEntries",
  "payroll-cycles": "payrollCycles",
  "payroll-periods": "payrollPeriods",
  "payroll-runs": "payrollRuns",
  projects: "projects",
  recruitmentCandidates: "candidates",
  recruitmentTalentPool: "candidates",
  recruitmentJobs: "jobOpenings",
  recruitmentApplications: "applications",
  "settings-employee-levels": "employeeLevels",
  "settings-business-units": "businessUnits",
  "settings-organizations": "organizations",
  "settings-departments": "departments",
  "settings-designations": "designations",
  "settings-locations": "locations",
  "settings-access-teams": "teams",
  "settings-organization-teams": "teams",
  "settings-users": "users",
  "settings-roles": "roles",
  "settings-leave-types": "leaveTypes",
  "settings-leave-policies": "leavePolicies",
  "settings-work-calendars": "holidayCalendars",
  "settings-work-schedules": "workSchedules",
};

export function customFieldsTableKey(moduleKey: string) {
  return MODULE_TABLE_KEYS[moduleKey] ?? null;
}

/*
 * A failure leaves the page as it was before custom fields existed rather than
 * failing it: nothing built into the module depends on them.
 */
export function loadCustomFieldDefinitions(tableKey: string) {
  return apiRequestJson<readonly CustomFieldDefinition[]>(
    `/custom-fields/${encodeURIComponent(tableKey)}`,
  ).catch((): readonly CustomFieldDefinition[] => []);
}

/** A generic record page's runtime, with its tenant's custom fields merged in. */
export async function withRouteCustomFields(
  runtime: ModuleRuntimeContext,
): Promise<ModuleRuntimeContext> {
  /* The runtime's module key is its spec's. */
  const tableKey = customFieldsTableKey(runtime.module.key);
  if (!tableKey) return runtime;
  const definitions = await loadCustomFieldDefinitions(tableKey);
  if (!definitions.length) return runtime;
  return {
    ...runtime,
    metadata: withCustomFields(runtime.metadata, definitions),
  };
}
