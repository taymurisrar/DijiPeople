import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { hasPermission } from "@/lib/permissions";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
} from "@/lib/runtime/modules/standard-module-runtime";
import { leaveRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { formatDate } from "@/lib/formatting-context";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import { getCurrentEmployee } from "../_lib/current-employee";
import type { TenantResolvedSettingsResponse } from "../settings/types";
import type { LeaveRequestRecord } from "./types";

type LeavesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeavePage({ searchParams }: LeavesPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="dp-theme-scope dp-leaves-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include leave module records."
          title="Leave module is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const [params, sessionUser, currentEmployeeContext, resolvedSettings] =
    await Promise.all([
      searchParams,
      getSessionUser(),
      getCurrentEmployee(),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ).catch(() => null),
    ]);
  const isElevated = hasElevatedTenantRole(sessionUser?.roleKeys);
  const canApproveLeave =
    isElevated ||
    hasPermission(
      sessionUser?.permissionKeys,
      PERMISSION_KEYS.LEAVE_REQUESTS_APPROVE,
    );
  const canRejectLeave =
    isElevated ||
    hasPermission(
      sessionUser?.permissionKeys,
      PERMISSION_KEYS.LEAVE_REQUESTS_REJECT,
    );
  const canViewTeamLeaves =
    currentEmployeeContext.isReportingManager ||
    canApproveLeave ||
    canRejectLeave;
  const visibleSpec = canViewTeamLeaves
    ? leaveRuntimeSpec
    : {
        ...leaveRuntimeSpec,
        views: leaveRuntimeSpec.views.filter(
          (view) => view.logicalName === "leaves.my",
        ),
      };
  const runtime = buildStandardModuleRuntimeContext({
    pageKind: "list",
    principal: buildStandardRuntimePrincipal({
      userId: sessionUser?.userId,
      tenantId: sessionUser?.tenantId,
      roleKeys: sessionUser?.roleKeys,
      roles: sessionUser?.roles,
      permissionKeys: sessionUser?.permissionKeys,
    }),
    spec: visibleSpec,
  });
  const activeView = resolveActiveView(runtime, getSearchParam(params.viewId));
  /*
   * Only "My Leave Requests" is personal; every other view is a team view.
   *
   * This used to name `leaves.all` explicitly, so any view added afterwards
   * silently fell through to the personal endpoint — a "Pending Approval" view
   * that showed only your own requests, which is the opposite of its purpose.
   * Inverting the test means a new view is a team view by default.
   */
  const isPersonalView = activeView?.logicalName === "leaves.my";
  const endpoint =
    !isPersonalView && canViewTeamLeaves
      ? "/leave-requests/team"
      : "/leave-requests/mine";
  const requests = await apiRequestJson<LeaveRequestRecord[]>(endpoint);
  const formatting = {
    dateFormat:
      resolvedSettings?.system.dateFormat ||
      resolvedSettings?.organization.dateFormat ||
      "MM/dd/yyyy",
    locale: resolvedSettings?.system.locale || "en-US",
    timezone:
      resolvedSettings?.organization.timezone ||
      resolvedSettings?.system.defaultTimezone ||
      "UTC",
  };
  const records = requests.map((request) => ({
    ...request,
    requestName: `${request.leaveType.name} · ${formatDate(
      request.startDate,
      formatting,
    )} - ${formatDate(request.endDate, formatting)}`,
    employeeName: request.employee.fullName,
    leaveTypeName: request.leaveType.name,
    durationDays: Number(request.totalDays),
  }));

  return (
    <main className="dp-theme-scope dp-leaves-scope grid gap-6">
      <StandardModuleListPage
        activeView={activeView}
        formatting={formatting}
        pagination={{
          page: 1,
          pageSize: records.length || 10,
          totalItems: records.length,
          pathname: visibleSpec.routeBase,
          searchParams: {
            viewId: activeView?.viewId ?? activeView?.id,
          },
        }}
        records={records}
        runtime={runtime}
        title="Leaves"
      />
    </main>
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
