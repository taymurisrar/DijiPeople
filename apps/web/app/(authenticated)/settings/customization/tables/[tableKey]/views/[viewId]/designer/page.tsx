import { notFound } from "next/navigation";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../../../_lib/require-settings-permission";
import { ViewDesignerWorkspace } from "../../../../../_components/view-designer-workspace";
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
  await requireSettingsPermissions([
    "customization.read",
    "customization.tables.read",
    "customization.views.read",
  ]);

  const [table, columns, views] = await Promise.all([
    apiRequestJson<CustomizationTable>(`/customization/tables/${tableKey}`),
    apiRequestJson<CustomizationColumn[]>(
      `/customization/tables/${tableKey}/columns`,
    ),
    apiRequestJson<CustomizationView[]>(
      `/customization/tables/${tableKey}/views`,
    ),
  ]);
  const view = views.find((item) => item.viewKey === viewId);
  if (!view) notFound();

  return (
    <SettingsShell
      description="Design list fields, filters, and sorting for runtime module grids."
      eyebrow="View designer"
      title={`${table.displayName} - ${view.name}`}
    >
      <ViewDesignerWorkspace columns={columns} table={table} view={view} />
    </SettingsShell>
  );
}
