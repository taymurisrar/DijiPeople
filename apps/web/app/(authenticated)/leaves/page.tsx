import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
import { getSessionUser } from "@/lib/auth";
import {
  getTableViews,
  RuntimeCustomizationView,
  withFallbackViews,
} from "@/lib/customization-views";
import { hasPermission } from "@/lib/permissions";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import { LeavesCommandBar } from "./_components/leaves-command-bar";
import { LeavesTable } from "./_components/leaves-table";
import { LeaveRequestRecord } from "./types";
import { getCurrentEmployee } from "../_lib/current-employee";

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

  const params = await searchParams;
  const selectedViewKey = getSearchParam(params.view);

  const sessionUser = await getSessionUser();
  const currentEmployeeContext = sessionUser
    ? await getCurrentEmployee(sessionUser)
    : { employee: null, isReportingManager: false };

  const isElevated = hasElevatedTenantRole(sessionUser?.roleKeys);
  const canCreateLeave = hasPermission(
    sessionUser?.permissionKeys,
    PERMISSION_KEYS.LEAVE_REQUESTS_CREATE,
  );
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
    currentEmployeeContext.isReportingManager || canApproveLeave || canRejectLeave;
  const canViewTenantLeaves = isElevated || canApproveLeave || canRejectLeave;
  const leaveEndpoint = buildLeaveEndpoint(
    canViewTenantLeaves || currentEmployeeContext.isReportingManager,
    selectedViewKey,
  );

  const [requests, publishedViews, pendingApprovals] = await Promise.all([
    apiRequestJson<LeaveRequestRecord[]>(leaveEndpoint),
    getTableViews("leaves"),
    getTeamRequestsCount(),
  ]);

  const systemViews: RuntimeCustomizationView[] = [
    {
      id: "allLeaveRequests",
      viewKey: "allLeaveRequests",
      tableKey: "leaves",
      name: "All Leave Requests",
      type: "system" as const,
      isDefault: canViewTenantLeaves,
      columnsJson: {
        columns: [
          { columnKey: "employee" },
          { columnKey: "leaveType" },
          { columnKey: "dateRange" },
          { columnKey: "status" },
          { columnKey: "attachments" },
          { columnKey: "approvalFlow" },
          { columnKey: "actions" },
        ],
      },
      sortingJson: [{ columnKey: "dateRange", direction: "desc" }],
    },
    {
      id: "myLeaveRequests",
      viewKey: "myLeaveRequests",
      tableKey: "leaves",
      name: "My Leave Requests",
      type: "system" as const,
      isDefault: !canViewTenantLeaves,
      columnsJson: {
        columns: [
          { columnKey: "leaveType" },
          { columnKey: "dateRange" },
          { columnKey: "status" },
          { columnKey: "attachments" },
          { columnKey: "approvalFlow" },
          { columnKey: "actions" },
        ],
      },
      sortingJson: [{ columnKey: "dateRange", direction: "desc" }],
    },
    ...(canViewTeamLeaves
      ? [
          buildLeaveStatusView("pendingApprovals", "Pending Approval", "PENDING"),
          buildLeaveStatusView("approved", "Approved", "APPROVED"),
          buildLeaveStatusView("rejected", "Rejected", "REJECTED"),
          buildLeaveStatusView("cancelled", "Cancelled", "CANCELLED"),
        ]
      : []),
    ...(canViewTeamLeaves
      ? [{
      id: "teamLeaves",
      viewKey: "teamLeaves",
      tableKey: "leaves",
      name: "Team Leaves",
      type: "system" as const,
      isDefault: false,
      columnsJson: {
        columns: [
          { columnKey: "employee" },
          { columnKey: "leaveType" },
          { columnKey: "dateRange" },
          { columnKey: "status" },
          { columnKey: "approvalFlow" },
          { columnKey: "actions" },
        ],
      },
      sortingJson: [{ columnKey: "dateRange", direction: "asc" }],
    }]
      : []),
  ];
  const leaveViews = withFallbackViews(
    "leaves",
    publishedViews,
    canViewTenantLeaves
      ? systemViews
      : systemViews.filter((view) => view.viewKey !== "allLeaveRequests"),
  );

  const selectedView =
    leaveViews.find((view) => view.viewKey === selectedViewKey) ??
    leaveViews.find((view) => view.isDefault) ??
    leaveViews[0] ??
    null;

  const visibleColumnKeys = selectedView?.columnsJson
    ? (
        (selectedView.columnsJson as {
          columns?: Array<{ columnKey?: string }>;
        }).columns ?? []
      )
        .map((column) => column.columnKey)
        .filter((columnKey): columnKey is string => Boolean(columnKey))
    : undefined;

  return (
    <main className="dp-theme-scope dp-leaves-scope grid gap-6">
      <ModuleViewSelector
        configureHref="/settings/customization/tables/leaves"
        enabled
        selectedViewId={selectedView?.viewKey ?? ""}
        views={leaveViews}
      />

      <LeavesCommandBar
        canCreateLeave={canCreateLeave}
        canDeleteLeave={false}
        canShareLeave={false}
        canAssignLeave={false}
        canImportLeave={false}
        canExportLeave={false}
        canApproveLeave={canApproveLeave}
        canRejectLeave={canRejectLeave}
        pendingApprovals={pendingApprovals}
      />

      <LeavesTable
        requests={requests}
        formatting={{
          dateFormat: "MM/dd/yyyy",
          locale: "en-US",
          timezone: "UTC",
        }}
        pagination={{
          page: 1,
          pageSize: requests.length || 10,
          totalItems: requests.length,
          pathname: "/leaves",
          searchParams: {
            view: selectedViewKey,
          },
        }}
        visibleColumnKeys={visibleColumnKeys}
        enableSelection={canApproveLeave || canRejectLeave}
      />
    </main>
  );
}

async function getTeamRequestsCount() {
  try {
    const teamRequests = await apiRequestJson<LeaveRequestRecord[]>(
      "/leave-requests/team?status=PENDING",
    );

    return teamRequests.length;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return 0;
    }

    throw error;
  }
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function buildLeaveEndpoint(
  canViewTenantLeaves: boolean,
  selectedViewKey: string,
) {
  const query = new URLSearchParams();
  const status = resolveLeaveStatus(selectedViewKey);
  if (status) query.set("status", status);

  const path =
    canViewTenantLeaves && selectedViewKey !== "myLeaveRequests"
      ? "/leave-requests/team"
      : "/leave-requests/mine";
  const suffix = query.toString();

  return suffix ? `${path}?${suffix}` : path;
}

function resolveLeaveStatus(selectedViewKey: string) {
  switch (selectedViewKey) {
    case "pendingApprovals":
      return "PENDING";
    case "approved":
      return "APPROVED";
    case "rejected":
      return "REJECTED";
    case "cancelled":
      return "CANCELLED";
    default:
      return "";
  }
}

function buildLeaveStatusView(id: string, name: string, status: string) {
  return {
    id,
    viewKey: id,
    tableKey: "leaves",
    name,
    type: "system" as const,
    isDefault: false,
    filtersJson: { status },
    columnsJson: {
      columns: [
        { columnKey: "employee" },
        { columnKey: "leaveType" },
        { columnKey: "dateRange" },
        { columnKey: "status" },
        { columnKey: "approvalFlow" },
        { columnKey: "actions" },
      ],
    },
    sortingJson: [{ columnKey: "dateRange", direction: "desc" }],
  };
}
