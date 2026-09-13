import { getSessionUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { getAudienceOptions } from "@/lib/runtime/audience-options.server";
import {
  CUSTOM_RECORDS_READ_PERMISSION,
  type CustomModuleSummary,
} from "@/lib/runtime/custom-modules/custom-module-navigation";
import { SettingsShell } from "../../_components/settings-shell";
import { requireCustomizationPage } from "../_lib/customization-access";
import { CustomizationAccessDenied } from "../_components/customization-access-denied";
import type { DashboardNavOverride } from "../../../_components/navigation";
import { SidebarDesigner } from "../_components/sidebar-designer";

export default async function CustomizationSidebarPage() {
  const { allowed } = await requireCustomizationPage("sidebar");
  if (!allowed) return <CustomizationAccessDenied />;

  const user = await getSessionUser();

  const [overrides, audiences, customModules] = await Promise.all([
    apiRequestJson<DashboardNavOverride[]>("/navigation/sidebar").catch(
      () => [] as DashboardNavOverride[],
    ),
    getAudienceOptions(),
    /*
     * BUG-3494 / ADR-0016 — published custom modules sit in the same sidebar
     * catalog as product entries, so the designer must list them too or they
     * cannot be ordered, renamed or hidden here. Fetched only for holders of
     * the read key, exactly as the authenticated layout does, so nobody else
     * turns a page view into a 403 row in the error log.
     */
    (user?.permissionKeys ?? []).includes(CUSTOM_RECORDS_READ_PERMISSION)
      ? apiRequestJson<{ items?: CustomModuleSummary[] }>(
          "/metadata/custom-modules",
        )
          .then((response) => response.items ?? [])
          .catch(() => [] as CustomModuleSummary[])
      : Promise.resolve([] as CustomModuleSummary[]),
  ]);

  return (
    <SettingsShell
      description=""
      eyebrow="Customization"
      title="Sidebar Designer"
    >
      <SidebarDesigner
        audiences={audiences}
        customModules={customModules}
        initialOverrides={overrides}
      />
    </SettingsShell>
  );
}
