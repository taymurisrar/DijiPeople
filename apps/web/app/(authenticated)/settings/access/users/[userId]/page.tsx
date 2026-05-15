import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { SettingsShell } from "../../../_components/settings-shell";
import { UserAccessManagement } from "../../../_components/user-access-management";
import {
  AccessRoleRecord,
  AccessUserRecord,
  BusinessUnitRecord,
} from "../../../types";

type UserDetailPageProps = {
  params: Promise<{ userId: string }>;
};

export default async function AccessUserDetailPage({
  params,
}: UserDetailPageProps) {
  await requireSettingsPermissions([PERMISSION_KEYS.USERS_READ]);

  const { userId } = await params;
  const [roles, user, businessUnits, teams] = await Promise.all([
    apiRequestJson<AccessRoleRecord[]>("/roles"),
    apiRequestJson<AccessUserRecord>(`/users/${userId}`),
    apiRequestJson<BusinessUnitRecord[]>("/business-units"),
    apiRequestJson<Parameters<typeof UserAccessManagement>[0]["teams"]>(
      "/teams",
    ).catch(() => []),
  ]);

  return (
    <SettingsShell
      description="Review profile, linked employee, assigned roles, teams, business unit, and effective access diagnostics."
      eyebrow="Role & Access Management"
      title={`${user.firstName} ${user.lastName}`}
    >
      <UserAccessManagement
        businessUnits={businessUnits}
        initialUsers={[user]}
        roles={roles}
        teams={teams}
      />
    </SettingsShell>
  );
}
