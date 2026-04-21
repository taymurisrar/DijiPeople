import { apiRequestJson } from "@/lib/server-api";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { PermissionsCatalog } from "../../_components/permissions-catalog";
import { SettingsShell } from "../../_components/settings-shell";
import { AccessPermissionRecord } from "../../types";

export default async function AccessPermissionsPage() {
  await requireSettingsPermissions(["permissions.read"]);
  const permissions = await apiRequestJson<AccessPermissionRecord[]>("/permissions");

  return (
    <SettingsShell
      description="Inspect the permission catalog used across sidebar visibility, feature access, and action-level authorization."
      eyebrow="Role & Access Management"
      title="Permissions"
    >
      <PermissionsCatalog permissions={permissions} />
    </SettingsShell>
  );
}
