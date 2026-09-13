import { apiRequestJson } from "@/lib/server-api";
import { getAudienceOptions } from "@/lib/runtime/audience-options.server";
import { SettingsShell } from "../../_components/settings-shell";
import { requireCustomizationPage } from "../_lib/customization-access";
import { CustomizationAccessDenied } from "../_components/customization-access-denied";
import type { DashboardNavOverride } from "../../../_components/navigation";
import { SidebarDesigner } from "../_components/sidebar-designer";

export default async function CustomizationSidebarPage() {
  const { allowed } = await requireCustomizationPage("sidebar");
  if (!allowed) return <CustomizationAccessDenied />;

  const [overrides, audiences] = await Promise.all([
    apiRequestJson<DashboardNavOverride[]>("/navigation/sidebar").catch(
      () => [] as DashboardNavOverride[],
    ),
    getAudienceOptions(),
  ]);

  return (
    <SettingsShell
      description=""
      eyebrow="Customization"
      title="Sidebar Designer"
    >
      <SidebarDesigner audiences={audiences} initialOverrides={overrides} />
    </SettingsShell>
  );
}
