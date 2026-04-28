import { apiRequestJson } from "@/lib/server-api";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { RoleAccessManagement } from "../../_components/role-access-management";
import { SettingsShell } from "../../_components/settings-shell";
import {
  AccessPermissionRecord,
  AccessRoleRecord,
  AccessUserRecord,
  BusinessUnitRecord,
  RoleMatrixCatalog,
} from "../../types";

export default async function AccessRolesPage() {
  await requireSettingsPermissions(["roles.read"]);

  const [roles, permissions, users, businessUnits, matrixCatalog] = await Promise.all([
    apiRequestJson<AccessRoleRecord[]>("/roles"),
    apiRequestJson<AccessPermissionRecord[]>("/permissions"),
    apiRequestJson<AccessUserRecord[]>("/users"),
    apiRequestJson<BusinessUnitRecord[]>("/business-units"),
    apiRequestJson<RoleMatrixCatalog>("/roles/matrix/catalog"),
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
        initialBusinessUnits={businessUnits}
        matrixCatalog={matrixCatalog}
        mode="roles"
      />
    </SettingsShell>
  );
}
