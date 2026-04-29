import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { SettingsShell } from "../../_components/settings-shell";
import { UserAccessManagement } from "../../_components/user-access-management";
import {
  AccessRoleRecord,
  AccessUserRecord,
  BusinessUnitRecord,
} from "../../types";

export default async function AccessUsersPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.USERS_READ]);

  const [roles, users, businessUnits, teams] = await Promise.all([
    apiRequestJson<AccessRoleRecord[]>("/roles"),
    apiRequestJson<AccessUserRecord[]>("/users"),
    apiRequestJson<BusinessUnitRecord[]>("/business-units"),
    apiRequestJson<Parameters<typeof UserAccessManagement>[0]["teams"]>(
      "/teams",
    ).catch(() => []),
  ]);

  return (
    <SettingsShell
      description="Review tenant users, ownership designation, assigned roles, and direct access in one expandable operational view."
      eyebrow="Role & Access Management"
      title="Users & Access"
    >
      <UserAccessManagement
        businessUnits={businessUnits}
        initialUsers={users}
        roles={roles}
        teams={teams}
      />
    </SettingsShell>
  );
}
