import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { CustomizationModulePicker } from "../_components/customization-module-picker";
import { CustomizationTable } from "../types";

export default async function CustomizationColumnsPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.columns.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );

  return (
    <SettingsShell
      description="Choose a module to configure its fields. Field changes stay tenant-scoped and metadata-only."
      eyebrow="Customization"
      title="Fields"
    >
      <CustomizationModulePicker
        description="Field editing happens inside each module so validation can use that module's system fields and tenant fields together."
        tables={tables}
        target="columns"
      />
    </SettingsShell>
  );
}
