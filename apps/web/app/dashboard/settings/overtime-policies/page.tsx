import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";

type OvertimePolicyRecord = {
  id: string;
  code: string;
  name: string;
  calculationPeriod: string;
  thresholdHours: string;
  rateMultiplier: string;
  requiresApproval: boolean;
  isActive: boolean;
  employeeLevel?: { code: string; name: string } | null;
  businessUnit?: { name: string } | null;
};

export default async function OvertimePoliciesPage() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.OVERTIME_POLICIES_READ)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to overtime policies." />;
  }
  const policies = await apiRequestJson<OvertimePolicyRecord[]>("/overtime-policies");
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Settings</p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">Overtime Policies</h2>
        <p className="mt-3 max-w-3xl text-muted">Configure overtime thresholds and payroll multipliers.</p>
      </section>
      <section className="grid gap-3">
        {policies.length ? policies.map((policy) => (
          <article className="rounded-2xl border border-border bg-white p-4" key={policy.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{policy.code} / {policy.name}</p>
                <p className="text-sm text-muted">
                  {policy.calculationPeriod} / threshold {policy.thresholdHours}h / multiplier {policy.rateMultiplier}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {policy.employeeLevel ? `${policy.employeeLevel.code} / ${policy.employeeLevel.name}` : "Tenant default"}
                  {policy.businessUnit ? ` / ${policy.businessUnit.name}` : ""}
                </p>
              </div>
              <div className="text-right text-sm text-muted">
                <p>{policy.isActive ? "Active" : "Inactive"}</p>
                <p>{policy.requiresApproval ? "Approval required" : "No approval required"}</p>
              </div>
            </div>
          </article>
        )) : <p className="text-sm text-muted">No overtime policies found.</p>}
      </section>
    </main>
  );
}
