import { redirect } from "next/navigation";
import { DemoDataManager } from "@/app/_components/demo-data-manager";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

type DemoSummary = React.ComponentProps<typeof DemoDataManager>["initial"];

export default async function DemoDataPage() {
  const user = await requireSystemAdminUser("/settings/demo-data");
  if (user.role !== "SUPER_ADMIN") {
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
