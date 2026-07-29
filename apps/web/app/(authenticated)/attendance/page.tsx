import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { hasPermission, isSelfServiceUser } from "@/lib/permissions";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
} from "@/lib/runtime/modules/standard-module-runtime";
import { attendanceRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { PERMISSION_KEYS, ROLE_KEYS } from "@/lib/security-keys";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { formatDate } from "@/lib/formatting-context";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import { getCurrentEmployee } from "../_lib/current-employee";
import type { TenantResolvedSettingsResponse } from "../settings/types";
import type { AttendanceListResponse } from "./types";

type AttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AttendancePage({
  searchParams,
}: AttendancePageProps) {
  const params = normalizeSearchParams(await searchParams);
  const [sessionUser, resolvedSettings, attendanceContext] = await Promise.all([
    getSessionUser(),
    apiRequestJson<TenantResolvedSettingsResponse>(
      "/tenant-settings/resolved",
    ).catch(() => null),
    apiRequestJson<AttendanceRuntimeContext>(
      "/attendance/runtime-context",
    ).catch(() => null),
  ]);
  const hasAttendanceRead = hasPermission(
    sessionUser?.permissionKeys,
    PERMISSION_KEYS.ATTENDANCE_READ,
  );
  const selfServiceAttendance = isSelfServiceUser(sessionUser?.permissionKeys);
  const businessUnitAccess = await getBusinessUnitAccessSummary();
  const isElevated = hasElevatedTenantRole(sessionUser?.roleKeys);
  const hasOrganizationAttendanceRole = (sessionUser?.roleKeys ?? []).some(
    (roleKey) => roleKey === ROLE_KEYS.CEO || roleKey === ROLE_KEYS.HR,
  );

  if (!hasAttendanceRead) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your role does not include attendance self-service access."
          title="Attendance is unavailable for your account."
        />
      </main>
    );
  }

  if (
    !selfServiceAttendance &&
    !isElevated &&
    !hasOrganizationAttendanceRole &&
    !hasBusinessUnitScope(businessUnitAccess)
  ) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include attendance data."
          title="Attendance is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const currentEmployeeContext = sessionUser
    ? await getCurrentEmployee()
    : { employee: null, isReportingManager: false };
  const canViewTeamAttendance =
    isElevated ||
    hasOrganizationAttendanceRole ||
    hasPermission(
      sessionUser?.permissionKeys,
      PERMISSION_KEYS.ATTENDANCE_MANAGE,
    ) ||
    hasPermission(
      sessionUser?.permissionKeys,
      PERMISSION_KEYS.ATTENDANCE_READ_ALL,
    ) ||
    hasPermission(
      sessionUser?.permissionKeys,
      PERMISSION_KEYS.ATTENDANCE_READ_TEAM,
    ) ||
    currentEmployeeContext.isReportingManager;
  const canViewAllAttendance =
    isElevated ||
    hasOrganizationAttendanceRole ||
    hasPermission(
      sessionUser?.permissionKeys,
      PERMISSION_KEYS.ATTENDANCE_MANAGE,
    ) ||
    hasPermission(
      sessionUser?.permissionKeys,
      PERMISSION_KEYS.ATTENDANCE_READ_ALL,
    );
  const canViewMyAttendance = Boolean(currentEmployeeContext.employee);
  const visibleViewKeys = canViewAllAttendance
    ? new Set([
        ...(canViewMyAttendance ? ["attendance.my"] : []),
        "attendance.today",
        "attendance.team",
        "attendance.all",
        "attendance.missingCheckout",
      ])
    : canViewTeamAttendance
      ? new Set([
          ...(canViewMyAttendance ? ["attendance.my"] : []),
          "attendance.team",
        ])
      : new Set(["attendance.my"]);
  const visibleSpec = {
    ...attendanceRuntimeSpec,
    views: attendanceRuntimeSpec.views.filter((view) =>
      visibleViewKeys.has(view.logicalName),
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
  const endpoint = attendanceEndpoint({
    businessDate: attendanceContext?.attendanceDate,
    canViewAllAttendance,
    canViewTeamAttendance,
    view: activeView?.logicalName,
  });

  let response: AttendanceListResponse = emptyAttendanceResponse();
  let unavailableMessage: string | null = null;

  try {
    response = await apiRequestJson<AttendanceListResponse>(endpoint);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 400) {
      unavailableMessage = error.message;
    } else {
      throw error;
    }
  }
  const formatting = {
    dateFormat:
      resolvedSettings?.system.dateFormat ||
      resolvedSettings?.organization.dateFormat ||
      "MM/dd/yyyy",
    locale: resolvedSettings?.system.locale || "en-US",
    timeFormat: resolvedSettings?.system.timeFormat,
    timezone:
      resolvedSettings?.organization.timezone ||
      resolvedSettings?.system.defaultTimezone ||
      "UTC",
  };
  const records = (response.items ?? response.data ?? []).map((entry) => ({
    ...entry,
    entryName: `${entry.employee.fullName} - ${formatDate(
      entry.attendanceDate,
      formatting,
    )} - ${formatAttendanceStatus(entry.status)}`,
    employeeName: entry.employee.fullName,
    checkIn: entry.checkInAt ?? entry.checkIn,
    checkOut: entry.checkOutAt ?? entry.checkOut,
    duration: entry.durationLabel ?? "",
    location:
      entry.workSite?.name ??
      entry.officeLocation?.name ??
      entry.remoteAddressText ??
      "",
    workSite: entry.workSite?.name ?? entry.officeLocation?.name ?? "",
    shift: entry.shift?.name ?? entry.workSchedule?.name ?? "",
  }));
  const isMyAttendanceView = activeView?.logicalName === "attendance.my";
  const attendanceActionState = isMyAttendanceView
    ? (attendanceContext?.attendanceActionState ?? "blocked")
    : "unavailable";
  const attendanceBlockedReason = isMyAttendanceView
    ? (attendanceContext?.blockedReason ?? undefined)
    : "Check in and check out are only available from My Attendance.";

  return (
    <main className="dp-theme-scope dp-attendance-scope grid gap-6">
      {unavailableMessage ? (
        <AccessDeniedState
          description={unavailableMessage}
          title="Attendance setup needed."
        />
      ) : (
        <StandardModuleListPage
          activeView={activeView}
          commandRecord={{
            attendanceActionState,
            attendanceBlockedReason,
            attendanceMode:
              attendanceContext?.todayAttendance?.attendanceMode ??
              attendanceContext?.defaultAttendanceMode,
            defaultAttendanceMode: attendanceContext?.defaultAttendanceMode,
            defaultOfficeLocationId: attendanceContext?.defaultOfficeLocationId,
            officeLocationId: attendanceContext?.defaultOfficeLocationId,
          }}
          formatting={formatting}
          pagination={{
            page: response.meta?.page ?? response.pagination?.page ?? 1,
            pageSize:
              response.meta?.pageSize ?? response.pagination?.pageSize ?? 20,
            totalItems:
              response.meta?.total ??
              response.pagination?.totalItems ??
              response.pagination?.total ??
              records.length,
            pathname: visibleSpec.routeBase,
            searchParams: {
              viewId: activeView?.viewId ?? activeView?.id,
            },
          }}
          records={records}
          runtime={runtime}
          spec={visibleSpec}
          title="Attendance"
        />
      )}
    </main>
  );
}

function emptyAttendanceResponse(): AttendanceListResponse {
  return {
    items: [],
    meta: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    },
    filters: {
      scope: "mine",
    },
  };
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

function normalizeSearchParams(
  params?: Record<string, string | string[] | undefined>,
) {
  return params ?? {};
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

type AttendanceRuntimeContext = {
  attendanceActionState:
    | "not-checked-in"
    | "checked-in"
    | "completed"
    | "blocked";
  attendanceDate: string;
  blockedReason?: string | null;
  defaultAttendanceMode?: "OFFICE" | "REMOTE" | "HYBRID" | null;
  defaultOfficeLocationId?: string | null;
  todayAttendance?: {
    attendanceMode?: "OFFICE" | "REMOTE" | "HYBRID" | null;
    officeLocationId?: string | null;
  } | null;
};

function attendanceEndpoint({
  businessDate,
  canViewAllAttendance,
  canViewTeamAttendance,
  view,
}: {
  businessDate?: string;
  canViewAllAttendance: boolean;
  canViewTeamAttendance: boolean;
  view?: string;
}) {
  if (view === "attendance.today" && canViewAllAttendance) {
    const date = businessDate
      ? `&dateFrom=${businessDate}&dateTo=${businessDate}`
      : "";
    return `/attendance/team?scope=all&pageSize=20${date}`;
  }
  if (view === "attendance.missingCheckout" && canViewAllAttendance) {
    return "/attendance/team?scope=all&pageSize=20&status=MISSED_CHECK_OUT";
  }
  if (view === "attendance.all" && canViewAllAttendance) {
    return "/attendance/team?scope=all&pageSize=20";
  }
  if (view === "attendance.team" && canViewTeamAttendance) {
    return "/attendance/team?scope=team&pageSize=20";
  }
  return "/attendance/mine?pageSize=20";
}

function formatAttendanceStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
