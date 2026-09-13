import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  isAccessDeniedError,
  requireCustomizationPage,
} from "../_lib/customization-access";
import {
  mergeRuntimeForms,
  mergeRuntimeViews,
} from "../_lib/runtime-customization-metadata";
import type {
  CustomizationColumn,
  CustomizationForm,
  CustomizationPackage,
  CustomizationTable,
  CustomizationView,
} from "../types";
import { CustomizationAccessDenied } from "./customization-access-denied";
import { TableDetailShell } from "./table-detail-shell";

const TAB_TITLES = {
  columns: "fields",
  forms: "forms",
  views: "views",
} as const;

/*
 * The Fields, Forms and Views routes were three copies of one page that loaded
 * the same six resources and each gated on a different subset of the keys those
 * loads need — so a user one key short passed the gate and crashed on the load.
 * One loader, gated on the module detail page's full key set (ADR-0013).
 */
export async function renderModuleTab(
  tableKey: string,
  tab: keyof typeof TAB_TITLES,
) {
  const { allowed } = await requireCustomizationPage("moduleDetail");
  if (!allowed) return <CustomizationAccessDenied />;

  let loaded: [
    CustomizationTable,
    CustomizationColumn[],
    CustomizationView[],
    CustomizationForm[],
    CustomizationTable[],
    CustomizationPackage[],
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
    ]);
  } catch (error) {
    if (isAccessDeniedError(error)) return <CustomizationAccessDenied />;
    throw error;
  }
  const [table, columns, views, forms, lookupTables, packages] = loaded;

  return (
    <SettingsShell
      description=""
      eyebrow="Customization"
      title={`${table.displayName} ${TAB_TITLES[tab]}`}
    >
      <TableDetailShell
        columns={columns}
        forms={mergeRuntimeForms(tableKey, forms)}
        initialTab={tab}
        lookupTables={lookupTables}
        packages={packages}
        table={table}
        views={mergeRuntimeViews(tableKey, views)}
      />
    </SettingsShell>
  );
}
