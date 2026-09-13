import { apiRequestJson } from "@/lib/server-api";
import { getAudienceOptions } from "@/lib/runtime/audience-options.server";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  isAccessDeniedError,
  requireCustomizationPage,
} from "../../_lib/customization-access";
import { CustomizationAccessDenied } from "../../_components/customization-access-denied";
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
  const { allowed } = await requireCustomizationPage("moduleDetail");
  if (!allowed) return <CustomizationAccessDenied />;

  let loaded: [
    CustomizationTable,
    CustomizationColumn[],
    CustomizationView[],
    CustomizationForm[],
    CustomizationTable[],
    CustomizationPackage[],
    Awaited<ReturnType<typeof getAudienceOptions>>,
  ];
  try {
    loaded = await Promise.all([
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
      getAudienceOptions(),
    ]);
  } catch (error) {
    if (isAccessDeniedError(error)) return <CustomizationAccessDenied />;
    throw error;
  }
  const [table, columns, views, forms, lookupTables, packages, audiences] =
    loaded;

  return (
    <SettingsShell
      description=""
      eyebrow="Customization"
      title={table.displayName}
    >
      <TableDetailShell
        audiences={audiences}
        columns={columns}
        forms={mergeRuntimeForms(tableKey, forms)}
        lookupTables={lookupTables}
        packages={packages}
        initialTab={initialTab}
        table={table}
        views={mergeRuntimeViews(tableKey, views)}
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
