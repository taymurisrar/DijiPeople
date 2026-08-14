import { SectionCard } from "@/app/components/ui/section-card";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../../../_lib/require-settings-permission";
import type { ExternalUserListResponse } from "../_lib/types";
import { MappingWorkspace } from "./_components/mapping-workspace";

/** Accepted from contextual links such as "View device users" on a device. */
const SCOPE_PARAMS = ["integrationId", "deviceId", "mappingStatus"] as const;

type MappingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AttendanceEmployeeMappingPage({
  searchParams,
}: MappingPageProps) {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.ATTENDANCE_MAPPINGS_READ,
    PERMISSION_KEYS.ATTENDANCE_MAPPINGS_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.ATTENDANCE_MAPPINGS_MANAGE,
  );

  const resolved = searchParams ? await searchParams : {};
  const query = new URLSearchParams({ pageSize: "200" });

  for (const key of SCOPE_PARAMS) {
    const value = resolved[key];
    if (typeof value === "string" && value.length > 0) {
      query.set(key, value);
    }
  }

  const externalUsers = await apiRequestJson<ExternalUserListResponse>(
    `/integrations/attendance/external-users?${query.toString()}`,
  ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 }));

  const unresolved = externalUsers.items.filter(
    (item) => item.mappingStatus === "UNMATCHED" || item.mappingStatus === "CONFLICT",
  ).length;

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Employee mapping"
      description="Match the users stored on your attendance devices to DijiPeople employees, so their attendance is attributed correctly."
    >
      <SectionCard
        title={
          unresolved > 0
            ? `${unresolved} device user${unresolved === 1 ? "" : "s"} need attention`
            : `${externalUsers.total} device user${externalUsers.total === 1 ? "" : "s"}`
        }
        description="Attendance from an unmapped user is still recorded — it is attributed once you confirm the match."
      >
        <MappingWorkspace
          externalUsers={externalUsers.items}
          canManage={canManage}
        />
      </SectionCard>
    </SettingsShell>
  );
}
