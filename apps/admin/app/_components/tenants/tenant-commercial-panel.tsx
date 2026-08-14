"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GenerateInvoiceButton } from "@/app/_components/generate-invoice-button";
import { SubscriptionForm } from "@/app/_components/subscription-form";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { formatCurrency, formatDate, formatEnumLabel } from "@/lib/formatters";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import {
  DefinitionList,
  PanelCard,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatePill,
} from "./tenant-panel-ui";
import {
  useTenantResource,
  type TenantCommercialView,
} from "./tenant-control-plane.client";

type PlanOption = {
  id: string;
  key: string;
  name: string;
  monthlyBasePrice?: number;
  annualBasePrice?: number;
  currency?: string;
};

type Agreement = TenantCommercialView["agreements"][number];
type Invoice = TenantCommercialView["invoices"][number];

/**
 * Commercial.
 *
 * Everything here is a record this platform holds: a Subscription, Contracts and
 * Invoices. Seats are the capacity concept the product sells, so seats are what
 * is shown — there is no licence entity in this schema and none is invented.
 */
export function TenantCommercialPanel({ tenantId }: { tenantId: string }) {
  const { data, loading, error, reload } =
    useTenantResource<TenantCommercialView>(tenantId, "/commercial");

  if (loading && !data)
    return (
      <PanelCard title="Commercial">
        <PanelLoading label="commercial records" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="Commercial">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  const tenantFilter = encodeURIComponent(
    JSON.stringify([{ field: "tenantId", operator: "eq", value: tenantId }]),
  );

  return (
    <div className="space-y-5">
      <PanelCard
        title="Subscription"
        description="The commercial agreement this workspace runs under."
        actions={
          data.subscription ? (
            <Link
              href={`/subscriptions/${data.subscription.id}`}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open subscription
            </Link>
          ) : null
        }
      >
        {data.subscription ? (
          <>
            <DefinitionList
              columns={3}
              items={[
                { label: "Plan", value: data.subscription.plan.name },
                {
                  label: "Status",
                  value: <TenantStatusBadge value={data.subscription.status} />,
                },
                {
                  label: "Billing cycle",
                  value: formatEnumLabel(data.subscription.billingCycle),
                },
                {
                  label: "Effective date",
                  value: formatDate(data.subscription.startDate),
                },
                {
                  label: "Renewal date",
                  value: data.subscription.renewalDate
                    ? formatDate(data.subscription.renewalDate)
                    : data.subscription.autoRenew
                      ? "Auto-renewing"
                      : "Not scheduled",
                },
                {
                  label: "End date",
                  value: data.subscription.endDate
                    ? formatDate(data.subscription.endDate)
                    : "Open-ended",
                },
                {
                  label: "Recurring price",
                  value: formatCurrency(
                    data.subscription.finalPrice,
                    data.subscription.currency,
                  ),
                  hint:
                    data.subscription.discountValue > 0
                      ? `Discounted from ${formatCurrency(
                          data.subscription.basePrice,
                          data.subscription.currency,
                        )}`
                      : undefined,
                },
                {
                  label: "Purchased seats",
                  value: data.subscription.purchasedSeats,
                  hint: data.seatUsage
                    ? `${data.seatUsage.assigned} tenant user${data.seatUsage.assigned === 1 ? "" : "s"} currently exist`
                    : undefined,
                },
                {
                  label: "Seats last reconciled",
                  value: data.subscription.seatsLastReconciledAt
                    ? formatDate(data.subscription.seatsLastReconciledAt)
                    : "Never",
                },
              ]}
            />
            {data.seatUsage &&
            data.seatUsage.assigned > data.seatUsage.purchased ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This tenant has {data.seatUsage.assigned} users against{" "}
                {data.seatUsage.purchased} purchased seats. Reconcile the
                subscription quantity before the next invoice.
              </p>
            ) : null}
          </>
        ) : (
          <PanelEmptyState
            title="No subscription is linked to this tenant."
            description="A subscription is created during provisioning from the plan and billing cycle agreed on the onboarding record."
          />
        )}
      </PanelCard>

      <SubscriptionManagementCard
        tenantId={tenantId}
        customerAccountId={null}
        subscription={data.subscription}
      />

      <PanelCard
        title="Agreements"
        description="Contracts linked to this tenant."
        actions={
          <Link
            href={`/contracts?filters=${tenantFilter}`}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            View all
          </Link>
        }
      >
        {data.agreements.length ? (
          <ProDataTable
            rows={data.agreements}
            rowKey={(row) => row.id}
            compact
            columns={agreementColumns}
          />
        ) : (
          <PanelEmptyState
            title="No tenant-specific agreements are linked yet."
            description="Customer-level agreements live on the customer record. Link an agreement here when it applies to this workspace specifically."
          />
        )}
      </PanelCard>

      <PanelCard
        title="Invoices"
        description="Invoices raised against this tenant's subscription."
        actions={
          <Link
            href={`/invoices?filters=${tenantFilter}`}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            View all
          </Link>
        }
      >
        {data.invoices.length ? (
          <ProDataTable
            rows={data.invoices}
            rowKey={(row) => row.id}
            compact
            columns={invoiceColumns}
          />
        ) : (
          <PanelEmptyState
            title="No invoices have been raised for this tenant."
            description="Invoices are generated from the subscription when a billing period closes."
          />
        )}
      </PanelCard>
    </div>
  );
}

/**
 * Plan, cycle, discount and seat changes still go through the existing
 * subscription form and the existing endpoints — the tab reorganisation moved
 * where it lives, not what it does.
 */
function SubscriptionManagementCard({
  tenantId,
  customerAccountId,
  subscription,
}: {
  tenantId: string;
  customerAccountId: string | null;
  subscription: TenantCommercialView["subscription"];
}) {
  const [plans, setPlans] = useState<PlanOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || plans) return;
    let active = true;
    fetch("/api/super-admin/plans")
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            (payload as { message?: string } | null)?.message ??
              "Unable to load plans.",
          );
        return payload as PlanOption[];
      })
      .then((items) => {
        if (active) setPlans(items ?? []);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Unable to load plans.",
          );
      });
    return () => {
      active = false;
    };
  }, [open, plans]);

  return (
    <PanelCard
      title="Manage subscription"
      description="Change the plan, billing cycle, seats or discount for this tenant."
      actions={
        <div className="flex flex-wrap gap-2">
          {subscription ? (
            <GenerateInvoiceButton subscriptionId={subscription.id} />
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {open ? "Hide" : "Change subscription"}
          </button>
        </div>
      }
    >
      {!open ? (
        <p className="text-xs text-slate-500">
          Commercial changes are hidden by default so the tab reads as a record
          rather than a form. Open the editor when a change is intended.
        </p>
      ) : error ? (
        <PanelError message={error} onRetry={() => setPlans(null)} />
      ) : !plans ? (
        <PanelLoading label="plans" />
      ) : (
        <SubscriptionForm
          tenantId={tenantId}
          customerAccountId={customerAccountId}
          plans={plans}
          currentSubscription={
            subscription
              ? {
                  ...subscription,
                  discountType: subscription.discountType as
                    | "NONE"
                    | "PERCENTAGE"
                    | "FLAT",
                  discountReason: null,
                  planPrice: null,
                }
              : null
          }
        />
      )}
    </PanelCard>
  );
}

const agreementColumns: ProDataTableColumn<Agreement>[] = [
  {
    key: "contractNumber",
    header: "Agreement #",
    minWidth: 150,
    render: (row) => (
      <Link
        href={`/contracts/${row.id}`}
        className="font-medium text-[var(--admin-primary)] hover:underline"
      >
        {row.contractNumber}
      </Link>
    ),
  },
  {
    key: "title",
    header: "Title",
    minWidth: 220,
    render: (row) => <span className="text-slate-800">{row.title}</span>,
  },
  {
    key: "contractType",
    header: "Type",
    minWidth: 170,
    render: (row) => formatEnumLabel(row.contractType),
  },
  {
    key: "status",
    header: "Status",
    minWidth: 160,
    render: (row) => <TenantStatusBadge value={row.status} />,
  },
  {
    key: "effectiveDate",
    header: "Effective",
    minWidth: 130,
    render: (row) =>
      row.effectiveDate ? formatDate(row.effectiveDate) : "Not set",
  },
  {
    key: "expiryDate",
    header: "Expiry",
    minWidth: 130,
    render: (row) => (row.expiryDate ? formatDate(row.expiryDate) : "None"),
  },
  {
    key: "signed",
    header: "Signed",
    minWidth: 140,
    render: (row) =>
      row.signedAt ? (
        <StatePill value="Signed" tone="success" />
      ) : (
        <StatePill value="Not signed" tone="warning" />
      ),
  },
  {
    key: "counterpartyName",
    header: "Counterparty",
    minWidth: 180,
    render: (row) => row.counterpartyName,
  },
];

const invoiceColumns: ProDataTableColumn<Invoice>[] = [
  {
    key: "invoiceNumber",
    header: "Invoice #",
    minWidth: 150,
    render: (row) => (
      <Link
        href={`/invoices/${row.id}`}
        className="font-medium text-[var(--admin-primary)] hover:underline"
      >
        {row.invoiceNumber}
      </Link>
    ),
  },
  {
    key: "period",
    header: "Billing period",
    minWidth: 200,
    render: (row) =>
      row.periodStart && row.periodEnd
        ? `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}`
        : "Not set",
  },
  {
    key: "status",
    header: "Status",
    minWidth: 130,
    render: (row) => <TenantStatusBadge value={row.status} />,
  },
  {
    key: "subtotal",
    header: "Subtotal",
    minWidth: 120,
    align: "right",
    render: (row) =>
      formatCurrency(row.subtotal ?? row.amount, row.currency),
  },
  {
    key: "tax",
    header: "Tax",
    minWidth: 100,
    align: "right",
    render: (row) => formatCurrency(row.tax ?? 0, row.currency),
  },
  {
    key: "total",
    header: "Total",
    minWidth: 120,
    align: "right",
    render: (row) => (
      <span className="font-semibold">
        {formatCurrency(row.total ?? row.amount, row.currency)}
      </span>
    ),
  },
  {
    key: "dueDate",
    header: "Due",
    minWidth: 130,
    render: (row) => formatDate(row.dueDate),
  },
  {
    key: "paidAt",
    header: "Paid",
    minWidth: 130,
    render: (row) => (row.paidAt ? formatDate(row.paidAt) : "Unpaid"),
  },
];
