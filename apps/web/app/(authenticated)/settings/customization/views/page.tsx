import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { CustomizationModulePicker } from "../_components/customization-module-picker";
import { CustomizationTable } from "../types";

export default async function CustomizationViewsPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.views.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );

  return (
    <SettingsShell
      description="Choose a module to manage its saved views, list fields, filters, sorting, and visibility scope."
      eyebrow="Customization"
      title="Views"
    >
      <CustomizationModulePicker
        description="Views are module-scoped so they can be validated against the correct metadata fields."
        tables={tables}
        target="views"
      />
    </SettingsShell>
  );
}
