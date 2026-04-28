import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { TableDetailShell } from "../../_components/table-detail-shell";
import {
  CustomizationColumn,
  CustomizationForm,
  CustomizationTable,
  CustomizationView,
} from "../../types";

type TableDetailPageProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationTableDetailPage({
  params,
}: TableDetailPageProps) {
  const { tableKey } = await params;
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
  ]);

  const [table, columns, views, forms, lookupTables] = await Promise.all([
    apiRequestJson<CustomizationTable>(`/customization/tables/${tableKey}`),
    apiRequestJson<CustomizationColumn[]>(
      `/customization/tables/${tableKey}/columns`,
    ),
    apiRequestJson<CustomizationView[]>(
      `/customization/tables/${tableKey}/views`,
    ),
    apiRequestJson<CustomizationForm[]>(
      `/customization/tables/${tableKey}/forms`,
    ),
    apiRequestJson<CustomizationTable[]>("/customization/tables"),
  ]);

  return (
    <SettingsShell
      description={`Configure metadata for ${table.pluralDisplayName}, including columns, saved views, form layouts, and table-level settings.`}
      eyebrow="Customization"
      title={table.pluralDisplayName}
    >
      <TableDetailShell
        columns={columns}
        forms={forms}
        lookupTables={lookupTables}
        table={table}
        views={views}
      />
    </SettingsShell>
  );
}
