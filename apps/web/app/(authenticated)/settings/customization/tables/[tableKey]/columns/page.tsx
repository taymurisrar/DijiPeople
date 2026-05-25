import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import { TableDetailShell } from "../../../_components/table-detail-shell";
import {
  CustomizationColumn,
  CustomizationForm,
  CustomizationTable,
  CustomizationView,
} from "../../../types";

type TableColumnsPageProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationTableColumnsPage({
  params,
}: TableColumnsPageProps) {
  const { tableKey } = await params;
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
    "customization.columns.read",
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
      description={`Manage metadata columns for ${table.pluralDisplayName}.`}
      eyebrow="Customization"
      title={`${table.displayName} columns`}
    >
      <TableDetailShell
        columns={columns}
        forms={forms}
        initialTab="columns"
        lookupTables={lookupTables}
        table={table}
        views={views}
      />
    </SettingsShell>
  );
}
