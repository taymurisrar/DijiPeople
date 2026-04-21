import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: "ONBOARDING" | "ACTIVE" | "SUSPENDED" | "CHURNED";
  createdAt: string;
  updatedAt: string;
  customerAccount: {
    id: string;
    companyName: string;
    status: string;
  } | null;
  userCount: number;
  employeeCount: number;
  enabledFeatures: string[];
  subscription: {
    plan: {
      id: string;
      key: string;
      name: string;
    };
    status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
    billingCycle: "MONTHLY" | "ANNUAL";
    finalPrice: number;
    currency: string;
    startDate: string;
    endDate: string | null;
  } | null;
};

export default async function TenantsPage() {
  const tenants = await apiRequestJson<TenantSummary[]>("/super-admin/tenants");

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              SaaS tenants
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              Tenant workspace overview
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Review tenant health, subscription posture, and enabled feature footprint from one internal workspace.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {tenants.length} tenant{tenants.length === 1 ? "" : "s"}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <th className="px-6 py-4">Tenant</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Subscription</th>
                <th className="px-6 py-4">Features</th>
                <th className="px-6 py-4">Users</th>
                <th className="px-6 py-4">Employees</th>
                <th className="px-6 py-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="align-top">
                  <td className="px-6 py-5">
                    <Link
                      href={`/tenants/${tenant.id}`}
                      className="font-semibold text-slate-950 transition hover:text-slate-700"
                    >
                      {tenant.name}
                    </Link>
                    <div className="mt-1 text-slate-500">{tenant.slug}</div>
                  </td>
                  <td className="px-6 py-5">
                    {tenant.customerAccount ? (
                      <Link
                        href={`/customers/${tenant.customerAccount.id}`}
                        className="font-medium text-slate-950 transition hover:text-slate-700"
                      >
                        {tenant.customerAccount.companyName}
                      </Link>
                    ) : (
                      <span className="text-slate-500">No customer account</span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <TenantStatusBadge value={tenant.status} />
                  </td>
                  <td className="px-6 py-5">
                    {tenant.subscription ? (
                      <div className="space-y-2">
                        <div className="font-medium text-slate-950">
                          {tenant.subscription.plan.name}
                        </div>
                        <div className="mt-2">
                          <TenantStatusBadge value={tenant.subscription.status} />
                        </div>
                        <div className="mt-2 text-slate-500">
                          {tenant.subscription.currency}{" "}
                          {tenant.subscription.finalPrice.toFixed(2)} •{" "}
                          {tenant.subscription.billingCycle.toLowerCase()}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500">Not configured</span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-wrap gap-2">
                      {tenant.enabledFeatures.length > 0 ? (
                        tenant.enabledFeatures.slice(0, 4).map((feature) => (
                          <span
                            key={feature}
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                          >
                            {feature}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-500">No enabled features</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">{tenant.userCount}</td>
                  <td className="px-6 py-5">{tenant.employeeCount}</td>
                  <td className="px-6 py-5">
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                    }).format(new Date(tenant.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
