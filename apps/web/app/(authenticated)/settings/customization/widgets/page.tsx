import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { CustomizationModulePicker } from "../_components/customization-module-picker";
import type { CustomizationTable } from "../types";

export default async function CustomizationWidgetsPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );
  return (
    <SettingsShell
      description="Review registered runtime widgets and their module compatibility, permissions, and data-adapter requirements."
      eyebrow="Customization"
      title="Widgets"
    >
      <CustomizationModulePicker
        description="Only registered executable widgets are shown. Custom script execution is intentionally unavailable."
        tables={tables}
        target="widgets"
      />
    </SettingsShell>
  );
}
