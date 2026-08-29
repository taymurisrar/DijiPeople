import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/formatting-context";
import { hasPermission } from "@/lib/permissions";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
} from "@/lib/runtime/modules/standard-module-runtime";
import { timesheetRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import type { EmployeeListResponse } from "../employees/types";
import type { ProjectListResponse } from "../projects/types";
import type { TenantResolvedSettingsResponse } from "../settings/types";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import { getCurrentEmployee } from "../_lib/current-employee";
import type { TimesheetListResponse } from "./types";
import type { TimesheetExportLookupOption } from "./_components/timesheet-export-panel";
import { TimesheetListWorkspace } from "./_components/timesheet-list-workspace";

type NamedLookupRecord = {
  id: string;
  name: string;
  code?: string | null;
};

type TimesheetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimesheetsPage({
  searchParams,
}: TimesheetsPageProps) {
  const [businessUnitAccess, user, currentEmployeeContext] = await Promise.all([
    getBusinessUnitAccessSummary(),
    getSessionUser(),
    getCurrentEmployee(),
  ]);
  const canReadAllTimesheets = hasPermission(
    user?.permissionKeys,
    "timesheets.read.all",
  );
  const canReadTeamTimesheets = hasPermission(
    user?.permissionKeys,
    "timesheets.read.team",
  );

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <div className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include timesheet records."
          title="Timesheets are unavailable for your current business unit access."
        />
      </div>
    );
  }

  if (!currentEmployeeContext.employee && !canReadAllTimesheets) {
    return (
      <div className="grid gap-6">
        <EmployeeLinkRequiredState />
      </div>
    );
  }

  const params = await searchParams;
  const visibleSpec = resolveVisibleTimesheetSpec({
    canReadAllTimesheets,
    canReadTeamTimesheets,
    hasEmployeeLink: Boolean(currentEmployeeContext.employee),
  });
  const runtime = buildStandardModuleRuntimeContext({
    pageKind: "list",
    principal: buildStandardRuntimePrincipal({
      userId: user?.userId,
      tenantId: user?.tenantId,
      roleKeys: user?.roleKeys,
      roles: user?.roles,
      permissionKeys: user?.permissionKeys,
    }),
    spec: visibleSpec,
  });
  const activeView = resolveActiveView(runtime, getSearchParam(params.viewId));
  const endpoint = resolveTimesheetEndpoint({
    activeViewLogicalName: activeView?.logicalName,
    canReadAllTimesheets,
    canReadTeamTimesheets,
    hasEmployeeLink: Boolean(currentEmployeeContext.employee),
  });
  const [
    response,
    resolvedSettings,
    employeeResponse,
    organizations,
    businessUnits,
    departments,
    projectResponse,
  ] = await Promise.all([
    apiRequestJson<TimesheetListResponse>(
      `/timesheets/${endpoint}?${buildTimesheetQuery(params, endpoint)}`,
    ),
    apiRequestJson<TenantResolvedSettingsResponse>(
      "/tenant-settings/resolved",
    ).catch(() => null),
    apiRequestJson<EmployeeListResponse>("/employees?pageSize=100").catch(
      () => null,
    ),
    apiRequestJson<NamedLookupRecord[]>(
      "/organizations?isActive=true&pageSize=100",
    ).catch(() => []),
    apiRequestJson<NamedLookupRecord[]>("/business-units?isActive=true").catch(
      () => [],
    ),
    apiRequestJson<NamedLookupRecord[]>("/departments?isActive=true").catch(
      () => [],
    ),
    apiRequestJson<ProjectListResponse>(
      "/projects?pageSize=100&status=ACTIVE",
    ).catch(() => null),
  ]);
  const formatting = {
    dateFormat:
      resolvedSettings?.system.dateFormat ||
      resolvedSettings?.organization.dateFormat ||
      "MM/dd/yyyy",
    locale: resolvedSettings?.system.locale || "en-US",
    timezone:
      resolvedSettings?.system.defaultTimezone ||
      resolvedSettings?.organization.timezone ||
      "UTC",
  };
  const records = response.items.map((timesheet) => ({
    ...timesheet,
    timesheetName: `${timesheet.employee.fullName} ${timesheet.year}-${String(timesheet.month).padStart(2, "0")}`,
    employeeName: timesheet.employee.fullName,
    period: `${formatDate(timesheet.periodStart, formatting)} - ${formatDate(
      timesheet.periodEnd,
      formatting,
    )}`,
  }));

  return (
    <div className="grid gap-6">
      <TimesheetListWorkspace
        activeView={activeView}
        exportOptions={{
          businessUnits: namedLookupOptions(businessUnits),
          currentEmployeeId: currentEmployeeContext.employee?.id,
          departments: namedLookupOptions(departments),
          employees: mergeLookupOptions(
            (employeeResponse?.items ?? []).map((employee) => ({
              id: employee.id,
              label: `${employee.fullName} (${employee.employeeCode})`,
            })),
            response.items.map((item) => ({
              id: item.employee.id,
              label: item.employee.fullName,
            })),
          ),
          filters: {
            year: numberParam(params.year),
            month: numberParam(params.month),
            status: getSearchParam(params.status) || undefined,
            employeeIds: compactStringArray(
              getSearchParam(params.employeeId),
            ),
            businessUnitId:
              getSearchParam(params.businessUnitId) || undefined,
            departmentId: getSearchParam(params.departmentId) || undefined,
          },
          organizations: namedLookupOptions(organizations),
          projects: (projectResponse?.items ?? []).map((project) => ({
            id: project.id,
            label: project.code
              ? `${project.name} (${project.code})`
              : project.name,
          })),
          timezone: formatting.timezone,
        }}
        formatting={{
          dateFormat: formatting.dateFormat,
          locale: formatting.locale,
          timezone: formatting.timezone,
        }}
        pagination={{
          page: response.meta.page,
          pageSize: response.meta.pageSize,
          totalItems: response.meta.total,
          pathname: timesheetRuntimeSpec.routeBase,
          searchParams: {
            viewId: activeView?.viewId ?? activeView?.id,
          },
        }}
        records={records}
        runtime={runtime}
        title="Timesheets"
      />
    </div>
  );
}

function compactStringArray(value: string) {
  return value ? [value] : undefined;
}

function buildTimesheetQuery(
  params: Record<string, string | string[] | undefined>,
  endpoint: "mine" | "team",
) {
  const query = new URLSearchParams();

  const keys = ["year", "month", "status", "page", "pageSize"];

  if (endpoint === "team") {
    keys.push(
      "employeeId",
      "managerEmployeeId",
      "departmentId",
      "businessUnitId",
    );
  }

  for (const key of keys) {
    const value = getSearchParam(params[key]);
    if (value) query.set(key, value);
  }

  if (!query.has("page")) query.set("page", "1");
  if (!query.has("pageSize")) query.set("pageSize", "20");

  return query.toString();
}

function resolveTimesheetEndpoint({
  activeViewLogicalName,
  canReadAllTimesheets,
  canReadTeamTimesheets,
  hasEmployeeLink,
}: {
  activeViewLogicalName?: string;
  canReadAllTimesheets: boolean;
  canReadTeamTimesheets: boolean;
  hasEmployeeLink: boolean;
}): "mine" | "team" {
  if (
    activeViewLogicalName === "timesheets.all" ||
    (!hasEmployeeLink && canReadAllTimesheets)
  ) {
    return canReadAllTimesheets || canReadTeamTimesheets ? "team" : "mine";
  }

  return "mine";
}

function resolveVisibleTimesheetSpec({
  canReadAllTimesheets,
  canReadTeamTimesheets,
  hasEmployeeLink,
}: {
  canReadAllTimesheets: boolean;
  canReadTeamTimesheets: boolean;
  hasEmployeeLink: boolean;
}) {
  if (!hasEmployeeLink && canReadAllTimesheets) {
    return {
      ...timesheetRuntimeSpec,
      views: timesheetRuntimeSpec.views.filter(
        (view) => view.logicalName === "timesheets.all",
      ),
    };
  }

  if (!canReadAllTimesheets && !canReadTeamTimesheets) {
    return {
      ...timesheetRuntimeSpec,
      views: timesheetRuntimeSpec.views.filter(
        (view) => view.logicalName === "timesheets.my",
      ),
    };
  }

  return timesheetRuntimeSpec;
}

function EmployeeLinkRequiredState() {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-8 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Employee profile required
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-foreground">
        Your user account is not linked to an employee profile.
      </h2>
      <p className="mt-3 max-w-3xl text-muted">
        Ask an administrator to link your user account to the correct employee
        record before opening My Timesheets.
      </p>
    </section>
  );
}

function resolveActiveView(
  runtime: ReturnType<typeof buildStandardModuleRuntimeContext>,
  viewId: string,
) {
  return (
    runtime.metadata.views.find(
      (view) => (view.viewId ?? view.id) === viewId,
    ) ??
    runtime.metadata.views.find((view) => view.isDefault) ??
    runtime.metadata.views[0] ??
    null
  );
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function numberParam(value?: string | string[]) {
  const parsed = Number(getSearchParam(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function namedLookupOptions(records: NamedLookupRecord[]) {
  return records.map((record) => ({
    id: record.id,
    label: record.code ? `${record.name} (${record.code})` : record.name,
  }));
}

function mergeLookupOptions(
  ...groups: TimesheetExportLookupOption[][]
): TimesheetExportLookupOption[] {
  return Array.from(
    new Map(groups.flat().map((option) => [option.id, option])).values(),
  ).sort((left, right) => left.label.localeCompare(right.label));
}
