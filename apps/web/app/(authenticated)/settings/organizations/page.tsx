import { apiRequestJson } from "@/lib/server-api";
import { OrganizationManagement } from "../_components/organization-management";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { OrganizationRecord } from "../types";

export default async function OrganizationsPage() {
  await requireSettingsPermissions(["settings.read"]);

  const organizations = await apiRequestJson<OrganizationRecord[]>(
    "/organizations",
  );

  return (
    <SettingsShell
      description="Create and maintain a nested organization hierarchy to structure business units and workforce reporting."
      eyebrow="Organization Settings"
      title="Organization Management"
    >
      <OrganizationManagement initialOrganizations={organizations} />
    </SettingsShell>
  );
}
