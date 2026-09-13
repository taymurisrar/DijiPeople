import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  isAccessDeniedError,
  requireCustomizationPage,
} from "../_lib/customization-access";
import { CustomizationAccessDenied } from "../_components/customization-access-denied";
import { TablesList } from "../_components/tables-list";
import { CustomizationTable } from "../types";

export default async function CustomizationTablesPage() {
  const { allowed } = await requireCustomizationPage("modules");
  if (!allowed) return <CustomizationAccessDenied />;

  let tables: CustomizationTable[];
  try {
    tables = await apiRequestJson<CustomizationTable[]>(
      "/customization/tables",
    );
  } catch (error) {
    if (isAccessDeniedError(error)) return <CustomizationAccessDenied />;
    throw error;
  }

  return (
    <SettingsShell description="" eyebrow="Customization" title="Modules">
      <TablesList tables={tables} />
    </SettingsShell>
  );
}
