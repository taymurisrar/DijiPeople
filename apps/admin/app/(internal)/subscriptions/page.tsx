import Link from "next/link";
import { EmptyState } from "@/app/_components/ui/empty-state";
import { PageHeader } from "@/app/_components/ui/page-header";
import { SectionCard } from "@/app/_components/ui/section-card";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { formatBillingCycle, formatCurrency, formatDate, formatEnumLabel } from "@/lib/formatters";
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
  const subscriptions = await apiRequestJson<SubscriptionRecord[]>("/super-admin/subscriptions");

  return (
    <main className="space-y-6">
      <PageHeader eyebrow="Subscriptions" title="Tenant subscriptions" />

      <SectionCard title="Subscription list">
        {subscriptions.length === 0 ? (
          <EmptyState
            title="No subscriptions found"
            description="Subscriptions will appear here when tenant billing is configured."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-6 py-4">Customer and tenant</th>
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
                        {subscription.tenant.name} | {subscription.tenant.slug}
                      </Link>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-medium text-slate-950">{subscription.plan.name}</div>
                      <div className="mt-1 text-slate-500">{subscription.plan.key}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-medium text-slate-950">
                        {formatBillingCycle(subscription.billingCycle)}
                      </div>
                      <div className="mt-1 text-slate-500">
                        {String(subscription.discountType).toUpperCase() !== "NONE"
                          ? `${formatEnumLabel(subscription.discountType)} ${subscription.discountValue}`
                          : "No discount"}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-medium text-slate-950">
                        {formatCurrency(subscription.finalPrice, subscription.currency)}
                      </div>
                      <div className="mt-1 text-slate-500">
                        Base {formatCurrency(subscription.basePrice, subscription.currency)}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <TenantStatusBadge value={subscription.status} />
                    </td>
                    <td className="px-6 py-5">
                      {subscription.renewalDate ? formatDate(subscription.renewalDate) : "Not scheduled"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </main>
  );
}
