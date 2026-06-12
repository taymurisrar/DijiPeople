import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { RolesCatalog } from "../../_components/roles-catalog";
import { SettingsShell } from "../../_components/settings-shell";
import {
  AccessPermissionRecord,
  AccessRoleRecord,
} from "../../types";

export default async function AccessRolesPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.ROLES_READ]);

  const [roles, permissions] = await Promise.all([
    apiRequestJson<AccessRoleRecord[]>("/roles"),
    apiRequestJson<AccessPermissionRecord[]>("/permissions"),
  ]);

  return (
    <SettingsShell
      description="Create tenant roles, refine custom access bundles, and inspect how permissions are grouped across modules."
      eyebrow="Role & Access Management"
      title="Roles"
    >
      <RolesCatalog
        initialPermissions={permissions}
        initialRoles={roles}
      />
    </SettingsShell>
  );
}
