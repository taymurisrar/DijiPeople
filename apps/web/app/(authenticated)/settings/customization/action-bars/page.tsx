import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { CustomizationModulePicker } from "../_components/customization-module-picker";
import type { CustomizationTable } from "../types";

export default async function CustomizationActionBarsPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );
  return (
    <SettingsShell
      description="Configure package-backed command bars for module lists, records, and related lists."
      eyebrow="Customization"
      title="Action Bars"
    >
      <CustomizationModulePicker
        description="Action Bars are module-scoped so commands, permissions, grouping, icons, and order can be validated in context."
        tables={tables}
        target="actionBars"
      />
    </SettingsShell>
  );
}
