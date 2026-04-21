import Link from "next/link";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { apiRequestJson } from "@/lib/server-api";

type SubscriptionRecord = {
  id: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  customerAccount: {
    id: string;
    companyName: string;
    status: string;
  } | null;
  plan: {
    id: string;
    key: string;
    name: string;
  };
  status: string;
  billingCycle: string;
  basePrice: number;
  discountType: string;
  discountValue: number;
  finalPrice: number;
  currency: string;
  renewalDate: string | null;
};

export default async function SubscriptionsPage() {
  const subscriptions = await apiRequestJson<SubscriptionRecord[]>(
    "/super-admin/subscriptions",
  );

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Subscriptions
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Tenant subscriptions
        </h1>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <th className="px-6 py-4">Customer / tenant</th>
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4">Billing</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Renewal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {subscriptions.map((subscription) => (
                <tr key={subscription.id} className="align-top">
                  <td className="px-6 py-5">
                    <div className="font-medium text-slate-950">
                      {subscription.customerAccount?.companyName ?? "No customer account"}
                    </div>
                    <Link
                      href={`/tenants/${subscription.tenant.id}`}
                      className="mt-1 block text-slate-500 transition hover:text-slate-700"
                    >
                      {subscription.tenant.name} • {subscription.tenant.slug}
                    </Link>
                  </td>
                  <td className="px-6 py-5">
                    <div className="font-medium text-slate-950">
                      {subscription.plan.name}
                    </div>
                    <div className="mt-1 text-slate-500">{subscription.plan.key}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="font-medium text-slate-950">
                      {subscription.billingCycle.toLowerCase()}
                    </div>
                    <div className="mt-1 text-slate-500">
                      {subscription.discountType !== "NONE"
                        ? `${subscription.discountType.toLowerCase()} ${subscription.discountValue}`
                        : "No discount"}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="font-medium text-slate-950">
                      {subscription.currency} {subscription.finalPrice.toFixed(2)}
                    </div>
                    <div className="mt-1 text-slate-500">
                      Base {subscription.currency} {subscription.basePrice.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <TenantStatusBadge value={subscription.status} />
                  </td>
                  <td className="px-6 py-5">
                    {subscription.renewalDate
                      ? new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                        }).format(new Date(subscription.renewalDate))
                      : "Not scheduled"}
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
