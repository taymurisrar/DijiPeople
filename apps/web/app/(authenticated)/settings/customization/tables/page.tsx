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
      description="Manage module labels, descriptions, icons, package ownership, and active state for configurable metadata modules."
      eyebrow="Customization"
      title="Modules"
    >
      <TablesList tables={tables} />
    </SettingsShell>
  );
}
