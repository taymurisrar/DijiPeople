import { apiRequestJson } from "@/lib/server-api";
import { BusinessUnitManagement } from "../_components/business-unit-management";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { BusinessUnitRecord, OrganizationRecord } from "../types";

export default async function BusinessUnitsPage() {
  await requireSettingsPermissions(["settings.read"]);

  const [organizations, businessUnits] = await Promise.all([
    apiRequestJson<OrganizationRecord[]>("/organizations"),
    apiRequestJson<BusinessUnitRecord[]>("/business-units"),
  ]);

  return (
    <SettingsShell
      description="Define business units inside organizations, build parent-child structure, and prepare unit-level workforce assignment."
      eyebrow="Organization Settings"
      title="Business Unit Management"
    >
      <BusinessUnitManagement
        initialBusinessUnits={businessUnits}
        initialOrganizations={organizations}
      />
    </SettingsShell>
  );
}
