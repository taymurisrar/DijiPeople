import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SectionCard } from "@/app/components/ui/section-card";
import { SettingsShell } from "../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../_lib/require-settings-permission";
import type { ApplicationRelease } from "../integrations/attendance/_lib/types";
import type { AgentSettingsRecord } from "../desktop-agent/_components/desktop-agent-settings-form";
import { DownloadCards } from "./_components/download-cards";

const managedApps = [
  {
    key: "desktop-agent",
    name: "Desktop Agent",
    description:
      "Workstation telemetry, activity sessions, heartbeat, and updater policy.",
    href: "/settings/desktop-agent",
  },
] as const;

/**
 * Apps & downloads.
 *
 * Extends the existing managed-apps page rather than adding a second downloads
 * screen. Release visibility is decided server-side: INTERNAL builds and
 * artefacts the caller lacks permission for never reach this page.
 */
export default async function AppsSettingsPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.AGENT_SETTINGS_READ,
    PERMISSION_KEYS.AGENT_SETTINGS_MANAGE,
    PERMISSION_KEYS.APP_DOWNLOADS_READ,
  ]);

  const canManageAgent = hasAnySettingsPermission(user, [
    PERMISSION_KEYS.AGENT_SETTINGS_READ,
    PERMISSION_KEYS.AGENT_SETTINGS_MANAGE,
  ]);

  const [agentSettings, releases] = await Promise.all([
    canManageAgent
      ? apiRequestJson<AgentSettingsRecord>("/agent/settings").catch(() => null)
      : Promise.resolve(null),
    apiRequestJson<{ items: ApplicationRelease[] }>("/app-releases").catch(
      () => ({ items: [] }),
    ),
  ]);

  return (
    <SettingsShell
      eyebrow="Apps"
      title="Apps & downloads"
      description="Company applications you can manage, and the installers available to your organisation."
    >
      <div className="grid gap-6">
        <SectionCard
          title="Downloads"
          description="Only applications available to your account are listed."
        >
          <DownloadCards releases={releases.items} />
        </SectionCard>

        {canManageAgent && agentSettings ? (
          <SectionCard
            title="Managed apps"
            description="Company apps that expose tenant-level management controls."
          >
            <div className="grid gap-4">
              {managedApps.map((app) => (
                <article
                  key={app.key}
                  className="rounded-[22px] border border-border bg-white/70 p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {app.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {app.description}
                      </p>
                    </div>

                    <div className="grid gap-1 text-sm md:text-right">
                      <span className="font-medium text-foreground">
                        {agentSettings.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <span className="text-muted">
                        Latest version: v{agentSettings.latestVersion}
                      </span>
                      <span className="text-muted">
                        Minimum supported: v
                        {agentSettings.minimumSupportedVersion}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Link
                      className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                      href={app.href}
                    >
                      Manage app
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </SettingsShell>
  );
}
