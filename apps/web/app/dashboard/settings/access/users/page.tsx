import { apiRequestJson } from "@/lib/server-api";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { RoleAccessManagement } from "../../_components/role-access-management";
import { SettingsShell } from "../../_components/settings-shell";
import {
  AccessPermissionRecord,
  AccessRoleRecord,
  AccessUserRecord,
  BusinessUnitRecord,
} from "../../types";

export default async function AccessUsersPage() {
  await requireSettingsPermissions(["users.read"]);

  const [roles, permissions, users, businessUnits] = await Promise.all([
    apiRequestJson<AccessRoleRecord[]>("/roles"),
    apiRequestJson<AccessPermissionRecord[]>("/permissions"),
    apiRequestJson<AccessUserRecord[]>("/users"),
    apiRequestJson<BusinessUnitRecord[]>("/business-units"),
  ]);

  return (
    <SettingsShell
      description="Review tenant users, ownership designation, assigned roles, and direct access in one expandable operational view."
      eyebrow="Role & Access Management"
      title="Users & Access"
    >
      <RoleAccessManagement
        initialPermissions={permissions}
        initialRoles={roles}
        initialUsers={users}
        initialBusinessUnits={businessUnits}
        mode="users"
      />
    </SettingsShell>
  );
}
