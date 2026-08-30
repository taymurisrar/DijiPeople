import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import type { EmployeeListResponse } from "@/app/(authenticated)/employees/types";
import { TopAlert } from "@/app/components/notifications/top-alert";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { loadAttendanceRuntimeConfiguration } from "@/lib/runtime/modules/attendance-settings.adapter";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { ManualAttendanceForm } from "../_components/manual-attendance-form";
import type {
  AttendanceLocationOption,
  TeamEmployeeOption,
} from "../types";

export default async function NewAttendancePage() {
  const [sessionUser, configuration] = await Promise.all([
    getSessionUser(),
    loadAttendanceRuntimeConfiguration(),
  ]);
  const canManageAttendance = hasPermission(
    sessionUser?.permissionKeys,
    PERMISSION_KEYS.ATTENDANCE_MANAGE,
  );

  if (!canManageAttendance || !configuration.policy?.allowManualAdjustments) {
    return (
      <div className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Manual attendance creation requires attendance management access and the tenant manual-adjustment policy."
          title="Manual attendance is unavailable."
        />
      </div>
    );
  }

  const [employees, locations] = await Promise.all([
    getEmployees(),
    apiRequestJson<AttendanceLocationOption[]>("/attendance/locations"),
  ]);

  return (
    <div className="dp-theme-scope dp-attendance-scope grid gap-6">
      {configuration.status !== "AVAILABLE" ? (
        <TopAlert
          description={
            configuration.issues.join(" ") ||
            "Attendance Configuration is missing or invalid. Review Attendance Configuration in Settings."
          }
          title="Attendance configuration is incomplete"
          variant="warning"
        />
      ) : null}
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          HR attendance adjustment
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          Create manual attendance
        </h2>
        <p className="mt-2 text-sm text-muted">
          The employee shift is resolved from tenant configuration. Every
          manual entry requires an audit reason.
        </p>
      </section>
      <ManualAttendanceForm employees={employees} locations={locations} />
    </div>
  );
}

async function getEmployees(): Promise<TeamEmployeeOption[]> {
  const response = await apiRequestJson<EmployeeListResponse>(
    "/employees?pageSize=100",
  );

  return response.items.map((employee) => ({
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
  }));
}
