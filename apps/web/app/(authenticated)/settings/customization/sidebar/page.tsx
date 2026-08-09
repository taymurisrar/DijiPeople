import { apiRequestJson } from "@/lib/server-api";
import { getAudienceOptions } from "@/lib/runtime/audience-options.server";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import type { DashboardNavOverride } from "../../../_components/navigation";
import { SidebarDesigner } from "../_components/sidebar-designer";

export default async function CustomizationSidebarPage() {
  await requireSettingsPermissions([
    "customization.read",
    "customization.modules.manage",
  ]);

  const [overrides, audiences] = await Promise.all([
    apiRequestJson<DashboardNavOverride[]>("/navigation/sidebar").catch(
      () => [] as DashboardNavOverride[],
    ),
    getAudienceOptions(),
  ]);

  return (
    <SettingsShell
      description="Reorder, rename, hide, and audience-gate the main sidebar for this tenant. Entries themselves stay product-defined, so a newly released module still appears without being added here."
      eyebrow="Customization"
      title="Sidebar Designer"
    >
      <SidebarDesigner audiences={audiences} initialOverrides={overrides} />
    </SettingsShell>
  );
}
