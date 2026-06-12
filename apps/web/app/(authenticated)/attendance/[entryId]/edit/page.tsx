import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { loadAttendanceRuntimeConfiguration } from "@/lib/runtime/modules/attendance-settings.adapter";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import type { TenantResolvedSettingsResponse } from "../../../settings/types";
import { AttendanceRecordEditClient } from "../../_components/attendance-record-edit-client";
import type { AttendanceEntryRecord } from "../../types";

type PageProps = {
  params: Promise<{ entryId: string }>;
};

export default async function EditAttendanceRecordPage({ params }: PageProps) {
  const { entryId } = await params;
  const [record, sessionUser, configuration, resolvedSettings] =
    await Promise.all([
      apiRequestJson<AttendanceEntryRecord>(
        `/attendance/${encodeURIComponent(entryId)}`,
      ),
      getSessionUser(),
      loadAttendanceRuntimeConfiguration(),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ),
    ]);
  const canOverride =
    record.canCurrentUserEdit &&
    configuration.policy?.allowManualAdjustments === true &&
    hasPermission(
      sessionUser?.permissionKeys,
      PERMISSION_KEYS.ATTENDANCE_UPDATE,
    );

  if (!canOverride) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Attendance correction requires update access and the tenant manual-adjustment policy."
          title="Attendance correction is unavailable."
        />
      </main>
    );
  }

  return (
    <main className="dp-theme-scope dp-attendance-scope min-h-[60vh]">
      <AttendanceRecordEditClient
        canOverride
        formatting={{
          dateFormat:
            resolvedSettings.system.dateFormat ||
            resolvedSettings.organization.dateFormat ||
            "MM/dd/yyyy",
          locale: resolvedSettings.system.locale || "en-US",
          timezone:
            resolvedSettings.organization.timezone ||
            resolvedSettings.system.defaultTimezone ||
            "UTC",
        }}
        recordId={entryId}
      />
    </main>
  );
}
