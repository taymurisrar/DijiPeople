import { EssDashboardAdminView } from "@/app/components/views/ess-dashboard-admin-view";
import { EssDashboardOperationsView } from "@/app/components/views/ess-dashboard-operations-view";
import { EssDashboardOverviewView } from "@/app/components/views/ess-dashboard-overview-view";
import { buildEssDashboardState } from "@/app/components/views/helpers";
import type { EssDashboardViewModel } from "@/app/components/views/types";

export type EssDashboardContentProps = EssDashboardViewModel;

export function EssDashboardContent(props: EssDashboardContentProps) {
  const selectedViewId = props.dashboardViews?.selectedViewId ?? "ess-overview";
  const state = buildEssDashboardState(props);

  if (selectedViewId === "admin-workbench") {
    return <EssDashboardAdminView state={state} props={props} />;
  }

  if (selectedViewId === "operations-focus") {
    return <EssDashboardOperationsView state={state} props={props} />;
  }

  return <EssDashboardOverviewView state={state} props={props} />;
}