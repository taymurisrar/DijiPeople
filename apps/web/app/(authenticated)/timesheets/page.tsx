import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
} from "@/lib/runtime/modules/standard-module-runtime";
import { timesheetRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import type { TimesheetListResponse } from "./types";

type TimesheetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimesheetsPage({
  searchParams,
}: TimesheetsPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();
  const user = await getSessionUser();
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
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include timesheet records."
          title="Timesheets are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const params = await searchParams;
  const response = await apiRequestJson<TimesheetListResponse>(
    `/timesheets/${canReadAllTimesheets || canReadTeamTimesheets ? "team" : "mine"}?${buildTimesheetQuery(params)}`,
  );
  const runtime = buildStandardModuleRuntimeContext({
    pageKind: "list",
    principal: buildStandardRuntimePrincipal({
      userId: user?.userId,
      tenantId: user?.tenantId,
      roleKeys: user?.roleKeys,
      roles: user?.roles,
      permissionKeys: user?.permissionKeys,
    }),
    spec: timesheetRuntimeSpec,
  });
  const activeView = resolveActiveView(runtime, getSearchParam(params.viewId));
  const records = response.items.map((timesheet) => ({
    ...timesheet,
    timesheetName: `${timesheet.employee.fullName} ${timesheet.year}-${String(timesheet.month).padStart(2, "0")}`,
    employeeName: timesheet.employee.fullName,
    period: `${timesheet.periodStart} - ${timesheet.periodEnd}`,
  }));

  return (
    <main className="grid gap-6">
      <StandardModuleListPage
        activeView={activeView}
        formatting={{
          dateFormat: "MM/dd/yyyy",
          locale: "en-US",
          timezone: "UTC",
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
    </main>
  );
}

function buildTimesheetQuery(
  params: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();

  for (const key of [
    "year",
    "month",
    "status",
    "employeeId",
    "page",
    "pageSize",
  ]) {
    const value = getSearchParam(params[key]);
    if (value) query.set(key, value);
  }

  if (!query.has("page")) query.set("page", "1");
  if (!query.has("pageSize")) query.set("pageSize", "20");

  return query.toString();
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
