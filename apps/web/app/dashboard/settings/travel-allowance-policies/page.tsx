import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { TravelAllowancePolicyRecord } from "../../business-trips/business-trip-types";

export default async function TravelAllowancePoliciesSettingsPage() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.TADA_POLICIES_READ)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to TA/DA policies." />;
  }
  const policies = await apiRequestJson<TravelAllowancePolicyRecord[]>("/travel-allowance-policies");
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Settings</p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">Travel Allowance Policies</h2>
        <p className="mt-3 max-w-3xl text-muted">Configure effective-dated TA/DA allowance policies and reusable rules.</p>
      </section>
      <section className="grid gap-3">
        {policies.length ? policies.map((policy) => (
          <article className="rounded-2xl border border-border bg-white p-4" key={policy.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{policy.code} / {policy.name}</p>
                <p className="text-sm text-muted">
                  {policy.employeeLevel ? `${policy.employeeLevel.code} / ${policy.employeeLevel.name}` : "Tenant default"}
                  {policy.countryCode ? ` / ${policy.countryCode}` : ""}
                  {policy.city ? ` / ${policy.city}` : ""}
                </p>
              </div>
              <p className="text-sm text-muted">{policy.isActive ? "Active" : "Inactive"}</p>
            </div>
            {policy.rules?.length ? (
              <div className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
                {policy.rules.map((rule) => (
                  <div className="rounded-xl border border-border px-3 py-2" key={rule.id}>
                    {rule.allowanceType.replaceAll("_", " ")} / {rule.calculationBasis.replaceAll("_", " ")} / {rule.currencyCode} {rule.amount}
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-muted">No rules configured.</p>}
          </article>
        )) : <p className="text-sm text-muted">No TA/DA policies found.</p>}
      </section>
    </main>
  );
}
