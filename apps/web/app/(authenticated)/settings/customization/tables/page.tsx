import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { TablesList } from "../_components/tables-list";
import { CustomizationTable } from "../types";

export default async function CustomizationTablesPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
  ]);
  const tables = await apiRequestJson<CustomizationTable[]>(
    "/customization/tables",
  );

  return (
    <SettingsShell
      description="Manage tenant labels, descriptions, icons, and active state for existing configurable system tables."
      eyebrow="Customization"
      title="Tables"
    >
      <TablesList tables={tables} />
    </SettingsShell>
  );
}
