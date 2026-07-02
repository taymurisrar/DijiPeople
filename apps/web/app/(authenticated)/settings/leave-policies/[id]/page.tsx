import Link from "next/link";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import type { LeavePolicyRecord, LeavePolicyRuleRecord } from "../../types";

export default async function LeavePolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSettingsPermissions([PERMISSION_KEYS.LEAVE_POLICIES_READ]);
  const { id } = await params;
  const [policy, rules] = await Promise.all([
    apiRequestJson<LeavePolicyRecord>(`/leave-policies/${id}`),
    apiRequestJson<LeavePolicyRuleRecord[]>(`/leave-policies/${id}/rules`),
  ]);
  return (
    <SettingsShell title={policy.name} description="Leave policy details and effective entitlement rules.">
      <div className="grid gap-6">
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted">Policy status</p><div className="mt-2"><StatusPill tone={policy.isActive ? "good" : "danger"}>{policy.isActive ? "Active" : "Inactive"}</StatusPill></div></div><Link className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white" href={`/settings/leave-policies/${id}/edit`}>Edit policy</Link></div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted">Rules</dt><dd className="mt-1 font-semibold">{rules.length}</dd></div><div><dt className="text-sm text-muted">Last updated</dt><dd className="mt-1 font-semibold">{formatDate(policy.updatedAt)}</dd></div></dl>
        </section>
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm"><h2 className="text-lg font-semibold">Entitlement rules</h2>{rules.length ? <div className="mt-4 grid gap-3">{rules.map((rule) => <div className="rounded-lg border border-border p-4" key={rule.id}><p className="font-medium">{rule.leaveType?.name ?? "Leave rule"}</p><p className="mt-1 text-sm text-muted">Annual entitlement: {rule.entitlementDays ?? "Configured by rule"}</p></div>)}</div> : <p className="mt-3 text-sm text-muted">No entitlement rules are configured.</p>}</section>
      </div>
    </SettingsShell>
  );
}
