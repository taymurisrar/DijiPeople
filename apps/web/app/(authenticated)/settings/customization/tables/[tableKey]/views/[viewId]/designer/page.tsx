import { notFound } from "next/navigation";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../../../../_components/settings-shell";
import {
  isAccessDeniedError,
  requireCustomizationPage,
} from "../../../../../_lib/customization-access";
import { CustomizationAccessDenied } from "../../../../../_components/customization-access-denied";
import { ViewDesignerWorkspace } from "../../../../../_components/view-designer-workspace";
import { mergeRuntimeViews } from "../../../../../_lib/runtime-customization-metadata";
import type {
  CustomizationColumn,
  CustomizationTable,
  CustomizationView,
} from "../../../../../types";

type ViewDesignerRouteProps = {
  params: Promise<{ tableKey: string; viewId: string }>;
};

export default async function CustomizationViewDesignerRoute({
  params,
}: ViewDesignerRouteProps) {
  const { tableKey, viewId } = await params;
  const { allowed } = await requireCustomizationPage("viewDesigner");
  if (!allowed) return <CustomizationAccessDenied />;

  let loaded: [CustomizationTable, CustomizationColumn[], CustomizationView[]];
  try {
    loaded = await Promise.all([
      apiRequestJson<CustomizationTable>(`/customization/tables/${tableKey}`),
      apiRequestJson<CustomizationColumn[]>(
        `/customization/tables/${tableKey}/columns`,
      ),
      apiRequestJson<CustomizationView[]>(
        `/customization/tables/${tableKey}/views`,
      ),
    ]);
  } catch (error) {
    if (isAccessDeniedError(error)) return <CustomizationAccessDenied />;
    throw error;
  }
  const [table, columns, views] = loaded;
  /*
   * Merged like every list route that links here, so a code-defined view that
   * has no tenant row yet opens instead of 404ing. See the form designer for
   * the same reasoning.
   */
  const view = mergeRuntimeViews(tableKey, views).find(
    (item) => item.id === viewId || item.viewKey === viewId,
  );
  if (!view) notFound();

  return (
    <SettingsShell
      description=""
      eyebrow="View designer"
      title={`${table.displayName} - ${view.name}`}
    >
      <ViewDesignerWorkspace columns={columns} table={table} view={view} />
    </SettingsShell>
  );
}
