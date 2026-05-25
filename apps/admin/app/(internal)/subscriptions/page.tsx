import Link from "next/link";
import { RefreshCw } from "lucide-react";
import {
  AdminCommandBar,
  AdminCommandButton,
  AdminKeyValueGrid,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { DataTable } from "@/app/_components/crm/data-table";
import { EmptyState } from "@/app/_components/ui/empty-state";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import {
  formatBillingCycle,
  formatCurrency,
  formatDate,
  formatEnumLabel,
} from "@/lib/formatters";
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
    <AdminWorkspace>
      <AdminCommandBar
        left={
          <AdminCommandButton href="/subscriptions" icon={RefreshCw}>
            Refresh
          </AdminCommandButton>
        }
      />
      <AdminPageHeader
        eyebrow="Subscriptions"
        title="Tenant subscriptions"
        description="Monitor plan assignment, billing interval, renewal timing, and subscription state."
      />

      <AdminSectionCard title="Subscription list">
        {subscriptions.length === 0 ? (
          <EmptyState
            title="No subscriptions found"
            description="Subscriptions will appear here when tenant billing is configured."
          />
        ) : (
          <DataTable
            compact
            rows={subscriptions}
            rowKey={(subscription) => subscription.id}
            stickyHeader
            columns={[
              {
                key: "customer",
                header: "Customer and tenant",
                minWidth: 280,
                render: (subscription) => (
                  <div>
                    <div className="font-medium text-slate-950">
                      {subscription.customerAccount?.companyName ??
                        "No customer account"}
                    </div>
                    <Link
                      href={`/tenants/${subscription.tenant.id}`}
                      className="mt-1 block text-slate-500 transition hover:text-slate-700"
                    >
                      {subscription.tenant.name} | {subscription.tenant.slug}
                    </Link>
                  </div>
                ),
              },
              {
                key: "plan",
                header: "Plan",
                minWidth: 170,
                render: (subscription) => (
                  <div>
                    <div className="font-medium text-slate-950">
                      {subscription.plan.name}
                    </div>
                    <div className="mt-1 text-slate-500">
                      {subscription.plan.key}
                    </div>
                  </div>
                ),
              },
              {
                key: "billing",
                header: "Billing",
                minWidth: 170,
                render: (subscription) => (
                  <div>
                    <div className="font-medium text-slate-950">
                      {formatBillingCycle(subscription.billingCycle)}
                    </div>
                    <div className="mt-1 text-slate-500">
                      {String(subscription.discountType).toUpperCase() !== "NONE"
                        ? `${formatEnumLabel(subscription.discountType)} ${subscription.discountValue}`
                        : "No discount"}
                    </div>
                  </div>
                ),
              },
              {
                key: "price",
                header: "Price",
                minWidth: 160,
                render: (subscription) => (
                  <div>
                    <div className="font-medium text-slate-950">
                      {formatCurrency(
                        subscription.finalPrice,
                        subscription.currency,
                      )}
                    </div>
                    <div className="mt-1 text-slate-500">
                      Base{" "}
                      {formatCurrency(
                        subscription.basePrice,
                        subscription.currency,
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                minWidth: 130,
                render: (subscription) => (
                  <TenantStatusBadge value={subscription.status} />
                ),
              },
              {
                key: "renewal",
                header: "Renewal",
                minWidth: 160,
                render: (subscription) =>
                  subscription.renewalDate
                    ? formatDate(subscription.renewalDate)
                    : "Not scheduled",
              },
            ]}
            renderExpandedRow={(subscription) => (
              <div className="space-y-3">
                <AdminKeyValueGrid
                  items={[
                    { label: "Subscription ID", value: subscription.id },
                    { label: "Tenant status", value: subscription.tenant.status },
                    {
                      label: "Customer status",
                      value: subscription.customerAccount?.status,
                    },
                    {
                      label: "Billing interval",
                      value: formatBillingCycle(subscription.billingCycle),
                    },
                    {
                      label: "Renewal date",
                      value: subscription.renewalDate
                        ? formatDate(subscription.renewalDate)
                        : "Not scheduled",
                    },
                    {
                      label: "Final price",
                      value: formatCurrency(
                        subscription.finalPrice,
                        subscription.currency,
                      ),
                    },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    href={`/tenants/${subscription.tenant.id}`}
                  >
                    Open tenant
                  </Link>
                  {subscription.customerAccount ? (
                    <Link
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      href={`/customers/${subscription.customerAccount.id}`}
                    >
                      Open customer
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          />
        )}
      </AdminSectionCard>
    </AdminWorkspace>
  );
}
