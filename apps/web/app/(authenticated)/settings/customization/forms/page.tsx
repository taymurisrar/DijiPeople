import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { CustomizationModulePicker } from "../_components/customization-module-picker";
import { CustomizationTable } from "../types";

export default async function CustomizationFormsPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.forms.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );

  return (
    <SettingsShell
      description="Choose a module to manage form layout metadata for main, quick create, create, and edit experiences."
      eyebrow="Customization"
      title="Forms"
    >
      <CustomizationModulePicker
        description="Forms are configured inside each module so layouts can be validated against available fields."
        tables={tables}
        target="forms"
      />
    </SettingsShell>
  );
}
