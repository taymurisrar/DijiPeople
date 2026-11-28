import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { loadEmployeeOptions } from "../../work/_lib/employee-options";
import type {
  DailyUpdatePolicy,
  ScopePolicy,
} from "../../work/_lib/daily-updates";
import { DailyUpdateEffectivePolicy } from "./_components/daily-update-effective-policy";
import { DailyUpdateEscalationPanel } from "./_components/daily-update-escalation-panel";
import { DailyUpdatePolicyManager } from "./_components/daily-update-policy-manager";
import { DailyUpdateScopePolicies } from "./_components/daily-update-scope-policies";

type NamedRow = { id: string; name: string };

/** A list endpoint that answers an array or `{ items }`; a failure is an empty list. */
async function loadNamed(path: string): Promise<NamedRow[]> {
  const response = await apiRequestJson<NamedRow[] | { items?: NamedRow[] }>(
    path,
  ).catch((): NamedRow[] => []);
  const rows = Array.isArray(response) ? response : (response.items ?? []);
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export default async function DailyUpdatesSettingsPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.DAILY_UPDATES_MANAGE]);
  const [policy, scoped, teams, businessUnits, people] = await Promise.all([
    apiRequestJson<DailyUpdatePolicy>("/daily-updates/policy"),
    apiRequestJson<{ items: ScopePolicy[] }>("/daily-updates/scope-policies"),
    loadNamed("/teams"),
    loadNamed("/business-units"),
    loadEmployeeOptions(),
  ]);

  return (
    <SettingsShell
      description="Who reports each day, by when, and whether it is acknowledged."
      eyebrow="People"
      title="Daily Updates"
    >
      <div className="grid gap-6">
        <DailyUpdatePolicyManager initialPolicy={policy} />
        <DailyUpdateScopePolicies
          businessUnits={businessUnits}
          initialPolicies={scoped.items ?? []}
          teams={teams}
        />
        <DailyUpdateEffectivePolicy people={people} />
        <DailyUpdateEscalationPanel />
      </div>
    </SettingsShell>
  );
}
