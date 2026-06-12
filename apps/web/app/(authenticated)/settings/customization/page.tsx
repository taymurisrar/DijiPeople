import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { CustomizationAreasTable } from "./_components/customization-areas-table";

export default async function CustomizationOverviewPage() {
  await requireSettingsPermissions(["customization.read"]);

  return (
    <SettingsShell
      description="Open the workspace you need to manage modules, organize packages, or publish validated customization changes."
      eyebrow="Customization"
      showSidebar={false}
      title="Customization"
    >
      <CustomizationAreasTable />
    </SettingsShell>
  );
}
