import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import { TableDetailShell } from "../../../_components/table-detail-shell";
import {
  mergeRuntimeForms,
  mergeRuntimeViews,
} from "../../../_lib/runtime-customization-metadata";
import {
  CustomizationColumn,
  CustomizationForm,
  CustomizationPackage,
  CustomizationTable,
  CustomizationView,
} from "../../../types";

type TableViewsPageProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationTableViewsPage({
  params,
}: TableViewsPageProps) {
  const { tableKey } = await params;
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
    "customization.views.read",
  ]);

  const [table, columns, views, forms, lookupTables, packages] =
    await Promise.all([
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
      apiRequestJson<CustomizationPackage[]>("/customization/packages"),
    ]);

  return (
    <SettingsShell
      description={`Configure metadata views for ${table.pluralDisplayName}.`}
      eyebrow="Customization"
      title={`${table.displayName} views`}
    >
      <TableDetailShell
        columns={columns}
        forms={mergeRuntimeForms(tableKey, forms)}
        initialTab="views"
        lookupTables={lookupTables}
        packages={packages}
        table={table}
        views={mergeRuntimeViews(tableKey, views)}
      />
    </SettingsShell>
  );
}
