import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";

type PlanRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  monthlyBasePrice: number;
  annualBasePrice: number;
  currency: string;
  sortOrder: number;
  subscriptionCount: number;
  features: string[];
};

export default async function PlansPage() {
  const plans = await apiRequestJson<PlanRecord[]>("/super-admin/plans");

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Billing structure
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              Plans and entitlements
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Plans define which product modules a tenant can turn on, while tenant-level feature flags refine usage within those entitlements.
            </p>
          </div>
          <Link
            href="/plans/new"
            className="inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            New plan
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Pricing</th>
                <th className="px-6 py-4">Features</th>
                <th className="px-6 py-4">Subscriptions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {plans.map((plan) => (
                <tr key={plan.id} className="align-top">
                  <td className="px-6 py-5">
                    <Link
                      href={`/plans/${plan.id}`}
                      className="font-semibold text-slate-950 transition hover:text-slate-700"
                    >
                      {plan.name}
                    </Link>
                    <div className="mt-1 text-slate-500">{plan.key}</div>
                    {plan.description ? (
                      <div className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                        {plan.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-6 py-5">
                    <TenantStatusBadge value={plan.isActive ? "ACTIVE" : "SUSPENDED"} />
                  </td>
                  <td className="px-6 py-5">
                    <div className="font-medium text-slate-950">
                      {plan.currency} {plan.monthlyBasePrice.toFixed(2)} / month
                    </div>
                    <div className="mt-1 text-slate-500">
                      {plan.currency} {plan.annualBasePrice.toFixed(2)} / year
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-wrap gap-2">
                      {plan.features.map((feature) => (
                        <span
                          key={feature}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-5">{plan.subscriptionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
