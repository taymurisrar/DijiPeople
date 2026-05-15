import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { SettingsShell } from "../../../_components/settings-shell";
import { UserForm } from "../../../_components/user-form";
import { BusinessUnitRecord } from "../../../types";

export default async function NewAccessUserPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.USERS_CREATE]);

  const businessUnits =
    await apiRequestJson<BusinessUnitRecord[]>("/business-units");

  return (
    <SettingsShell
      description="Create a tenant user, then link the user to an employee and assign access roles."
      eyebrow="Role & Access Management"
      title="New User"
    >
      <UserForm businessUnits={businessUnits} />
    </SettingsShell>
  );
}
