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

type TableFormsPageProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationTableFormsPage({
  params,
}: TableFormsPageProps) {
  const { tableKey } = await params;
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
    "customization.forms.read",
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
      description={`Design metadata forms for ${table.pluralDisplayName}.`}
      eyebrow="Customization"
      title={`${table.displayName} forms`}
    >
      <TableDetailShell
        columns={columns}
        forms={forms}
        initialTab="forms"
        lookupTables={lookupTables}
        table={table}
        views={views}
      />
    </SettingsShell>
  );
}
