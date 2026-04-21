import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../_components/config-settings-form";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { attendanceSettingsSections } from "../_lib/settings-page-config";
import { TenantSettingsResponse } from "../types";

export default async function AttendanceSettingsPage() {
  await requireSettingsPermissions(["settings.read", "attendance.read", "timesheets.read"]);
  const tenantSettings = await apiRequestJson<TenantSettingsResponse>(
    "/tenant-settings",
  );

  return (
    <SettingsShell
      description="Manage tenant rules for attendance modes, location validation, work hours, weekend behavior, and timesheet submission."
      eyebrow="Attendance & Timesheets"
      title="Attendance & Timesheet Rules"
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save attendance settings"
        sections={attendanceSettingsSections}
      />
    </SettingsShell>
  );
}
