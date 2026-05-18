import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import type { AgentSettingsRecord } from "../desktop-agent/_components/desktop-agent-settings-form";

const managedApps = [
  {
    key: "desktop-agent",
    name: "Desktop Agent",
    description: "Workstation telemetry, activity sessions, heartbeat, and updater policy.",
    href: "/settings/desktop-agent",
  },
] as const;

export default async function AppsSettingsPage() {
  await requireSettingsPermissions([
    PERMISSION_KEYS.AGENT_SETTINGS_READ,
    PERMISSION_KEYS.AGENT_SETTINGS_MANAGE,
  ]);

  const agentSettings =
    await apiRequestJson<AgentSettingsRecord>("/agent/settings");

  return (
    <SettingsShell
      eyebrow="Apps"
      title="Managed apps"
      description="Review company apps that expose tenant-level management controls."
    >
      <div className="grid gap-4">
        {managedApps.map((app) => (
          <article
            key={app.key}
            className="rounded-[24px] border border-border bg-surface p-6 shadow-sm"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted">
                  Available Apps
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  {app.name}
                </h2>
                <p className="mt-2 text-sm text-muted">{app.description}</p>
              </div>

              <div className="grid gap-2 text-sm md:text-right">
                <span className="font-medium text-foreground">
                  Enabled Apps: {agentSettings.enabled ? "Enabled" : "Disabled"}
                </span>
                <span className="text-muted">
                  Latest version: v{agentSettings.latestVersion}
                </span>
                <span className="text-muted">
                  Minimum supported: v{agentSettings.minimumSupportedVersion}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
                href={app.href}
              >
                Manage app
              </Link>
              {agentSettings.installerUrl ? (
                <a
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                  href={agentSettings.installerUrl}
                >
                  Download installer
                </a>
              ) : (
                <span className="rounded-2xl border border-dashed border-border px-4 py-2 text-sm text-muted">
                  Installer unavailable
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </SettingsShell>
  );
}
