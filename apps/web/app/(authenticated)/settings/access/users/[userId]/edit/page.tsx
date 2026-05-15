import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import { SettingsShell } from "../../../../_components/settings-shell";
import { UserForm } from "../../../../_components/user-form";
import { AccessUserRecord, BusinessUnitRecord } from "../../../../types";

type EditAccessUserPageProps = {
  params: Promise<{ userId: string }>;
};

export default async function EditAccessUserPage({
  params,
}: EditAccessUserPageProps) {
  await requireSettingsPermissions([PERMISSION_KEYS.USERS_UPDATE]);

  const { userId } = await params;
  const [user, businessUnits] = await Promise.all([
    apiRequestJson<AccessUserRecord>(`/users/${userId}`),
    apiRequestJson<BusinessUnitRecord[]>("/business-units"),
  ]);

  return (
    <SettingsShell
      description="Update the account profile and business-unit placement."
      eyebrow="Role & Access Management"
      title={`Edit ${user.firstName} ${user.lastName}`}
    >
      <UserForm businessUnits={businessUnits} user={user} />
    </SettingsShell>
  );
}
