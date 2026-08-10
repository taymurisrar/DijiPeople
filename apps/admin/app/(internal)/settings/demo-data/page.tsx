import { redirect } from "next/navigation";
import { DemoDataManager } from "@/app/_components/demo-data-manager";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { isPlatformSuperAdmin } from "@/lib/platform-rbac";

type DemoSummary = React.ComponentProps<typeof DemoDataManager>["initial"];

export default async function DemoDataPage() {
  const user = await requireSystemAdminUser("/settings/demo-data");
  /*
   * Owner-level access uses the shared helper, not a role-string comparison.
   * SUPER_ADMIN is the legacy alias for PLATFORM_OWNER and the API grants
   * `platform.*` to both, so testing the literal locked owners out.
   */
  if (!isPlatformSuperAdmin(user.role)) {
    redirect("/access-denied");
  }
  const summary = await apiRequestJson<DemoSummary>("/admin/demo-data/summary");

  return (
    <SettingsShell
      title="Demo data"
      description="Inspect, delete, and recreate the explicitly tagged client-demo tenant."
    >
      <DemoDataManager initial={summary} />
    </SettingsShell>
  );
}
