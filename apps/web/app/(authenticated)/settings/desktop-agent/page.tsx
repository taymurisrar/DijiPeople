import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import {
  AgentSettingsRecord,
  DesktopAgentSettingsForm,
} from "./_components/desktop-agent-settings-form";
import { DlpRulesManager } from "./_components/dlp-rules-manager";

export default async function DesktopAgentSettingsPage() {
  await requireSettingsPermissions([
    PERMISSION_KEYS.AGENT_SETTINGS_READ,
    PERMISSION_KEYS.AGENT_SETTINGS_MANAGE,
  ]);

  const settings = await apiRequestJson<AgentSettingsRecord>("/agent/settings");

  return (
    <SettingsShell
      description="Configure the Windows desktop companion agent, heartbeat cadence, idle thresholds, privacy switches, offline queue, and update policy."
      eyebrow="Productivity & Tracking"
      title="Desktop Agent"
    >
      <div className="grid gap-6">
        <DesktopAgentSettingsForm initialSettings={settings} />
        <DlpRulesManager />
      </div>
    </SettingsShell>
  );
}
