import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import {
  TableDetailShell,
  type TabKey,
} from "../../_components/table-detail-shell";
import {
  CustomizationColumn,
  CustomizationForm,
  CustomizationPackage,
  CustomizationTable,
  CustomizationView,
} from "../../types";
import {
  mergeRuntimeForms,
  mergeRuntimeViews,
} from "../../_lib/runtime-customization-metadata";

type TableDetailPageProps = {
  params: Promise<{ tableKey: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function CustomizationTableDetailPage({
  params,
  searchParams,
}: TableDetailPageProps) {
  const { tableKey } = await params;
  const query = await searchParams;
  const initialTab = resolveTab(query.tab);
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
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
  const resolvedForms = mergeRuntimeForms(tableKey, forms);
  const resolvedViews = mergeRuntimeViews(tableKey, views);

  return (
    <SettingsShell
      description={`Configure metadata for ${table.pluralDisplayName}, including fields, saved views, form layouts, and module-level settings.`}
      eyebrow="Customization"
      title={table.pluralDisplayName}
    >
      <TableDetailShell
        columns={columns}
        forms={resolvedForms}
        lookupTables={lookupTables}
        packages={packages}
        initialTab={initialTab}
        table={table}
        views={resolvedViews}
      />
    </SettingsShell>
  );
}

const supportedTabs = new Set<TabKey>([
  "columns",
  "forms",
  "views",
  "choiceLists",
  "relationships",
  "actionBars",
  "widgets",
  "settings",
]);

function resolveTab(value: string | string[] | undefined): TabKey {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && supportedTabs.has(candidate as TabKey)
    ? (candidate as TabKey)
    : "columns";
}
