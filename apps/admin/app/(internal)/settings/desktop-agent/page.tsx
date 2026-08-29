import type { Metadata } from "next";
import { DesktopAgentManager } from "@/app/_components/settings/desktop-agent-manager";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Desktop Agent",
};

export default async function DesktopAgentSettingsPage() {
  await requireSystemAdminUser("/settings/desktop-agent");

  return (
    <SettingsShell
      description="Publish desktop-agent versions to a channel, and choose which tenants receive that channel. Publishing a release assigns it to nobody; assigning a tenant builds nothing."
      title="Desktop agent"
    >
      <DesktopAgentManager />
    </SettingsShell>
  );
}
