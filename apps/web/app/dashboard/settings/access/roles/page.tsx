import { apiRequestJson } from "@/lib/server-api";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { RoleAccessManagement } from "../../_components/role-access-management";
import { SettingsShell } from "../../_components/settings-shell";
import {
  AccessPermissionRecord,
  AccessRoleRecord,
  AccessUserRecord,
} from "../../types";

export default async function AccessRolesPage() {
  await requireSettingsPermissions(["roles.read"]);

  const [roles, permissions, users] = await Promise.all([
    apiRequestJson<AccessRoleRecord[]>("/roles"),
    apiRequestJson<AccessPermissionRecord[]>("/permissions"),
    apiRequestJson<AccessUserRecord[]>("/users"),
  ]);

  return (
    <SettingsShell
      description="Create tenant roles, refine custom access bundles, and inspect how permissions are grouped across modules."
      eyebrow="Role & Access Management"
      title="Roles"
    >
      <RoleAccessManagement
        initialPermissions={permissions}
        initialRoles={roles}
        initialUsers={users}
        mode="roles"
      />
    </SettingsShell>
  );
}
