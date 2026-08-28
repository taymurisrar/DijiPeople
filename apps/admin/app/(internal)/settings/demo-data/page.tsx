import { redirect } from "next/navigation";
import { DemoDataManager } from "@/app/_components/demo-data-manager";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { isPlatformSuperAdmin } from "@/lib/platform-rbac";
import type { Metadata } from "next";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Demo Data",
};


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
