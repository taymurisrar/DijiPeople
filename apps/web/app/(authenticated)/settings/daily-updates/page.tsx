import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import type { DailyUpdatePolicy } from "../../work/_lib/daily-updates";
import { DailyUpdatePolicyManager } from "./_components/daily-update-policy-manager";

export default async function DailyUpdatesSettingsPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.DAILY_UPDATES_MANAGE]);
  const policy = await apiRequestJson<DailyUpdatePolicy>("/daily-updates/policy");

  return (
    <SettingsShell
      description="Who reports each day, by when, and whether it is acknowledged."
      eyebrow="People"
      title="Daily Updates"
    >
      <DailyUpdatePolicyManager initialPolicy={policy} />
    </SettingsShell>
  );
}
