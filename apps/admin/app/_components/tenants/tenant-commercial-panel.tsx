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
  DialogField,
  PanelButton,
  PanelCard,
  PanelDialog,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatePill,
  dialogInputClass,
} from "./tenant-panel-ui";
import {
  describeError,
  tenantRequest,
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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

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

  const isCancelled = ["CANCELLED", "CANCELED", "EXPIRED"].includes(
    data.subscription?.status ?? "",
  );

  return (
    <div className="space-y-5">
      {notice ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {notice.text}
        </p>
      ) : null}
      <PanelCard
        title="Subscription"
        description="The commercial agreement this workspace runs under."
        actions={
          data.subscription ? (
            <div className="flex flex-wrap gap-2">
              {/*
                Cancelling is its own action rather than a status field buried in
                the subscription editor: it ends billing and it is the gate in
                front of decommissioning and erasure.
              */}
              <PanelButton
                variant="danger"
                disabled={isCancelled}
                title={
                  isCancelled ? "This subscription is already cancelled." : undefined
                }
                onClick={() => setCancelOpen(true)}
              >
                Cancel subscription
              </PanelButton>
              <Link
                href={`/subscriptions/${data.subscription.id}`}
                className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open subscription
              </Link>
            </div>
          ) : null
        }
      >
        {data.subscription ? (
          <>
            <DefinitionList
              columns={3}
              items={[
                {
                  label: "Plan",
                  /* Names a record, so it opens it — like every other reference here. */
                  value: (
                    <Link
                      href={`/plans/${data.subscription.plan.id}`}
                      className="font-medium text-[var(--admin-primary)] hover:underline"
                    >
                      {data.subscription.plan.name}
                    </Link>
                  ),
                },
                {
                  label: "Subscription",
                  value: (
                    <Link
                      href={`/subscriptions/${data.subscription.id}`}
                      className="font-medium text-[var(--admin-primary)] hover:underline"
                    >
                      Open subscription
                    </Link>
                  ),
                },
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

      {cancelOpen && data.subscription ? (
        <CancelSubscriptionDialog
          tenantId={tenantId}
          planName={data.subscription.plan.name}
          onClose={() => setCancelOpen(false)}
          onDone={(message) => {
            setNotice({ tone: "success", text: message });
            setCancelOpen(false);
            reload();
          }}
        />
      ) : null}

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
 * Cancellation asks for a reason and, when Stripe is billing the customer, an
 * explicit acknowledgement that cancelling here does not stop Stripe. Saying so
 * up front is the difference between a retired tenant and a customer who is
 * still being charged.
 */
function CancelSubscriptionDialog({
  tenantId,
  planName,
  onClose,
  onDone,
}: {
  tenantId: string;
  planName: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [acknowledgeStripe, setAcknowledgeStripe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsStripeAcknowledgement, setNeedsStripeAcknowledgement] =
    useState(false);

  return (
    <PanelDialog
      title={`Cancel ${planName}?`}
      description="Billing stops and the subscription moves to Cancelled. Invoices and payment history are preserved. This is a prerequisite for decommissioning or erasing the tenant."
      tone="danger"
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Keep subscription</PanelButton>
          <PanelButton
            variant="danger"
            busy={busy}
            disabled={
              reason.trim().length < 3 ||
              (needsStripeAcknowledgement && !acknowledgeStripe)
            }
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const result = await tenantRequest<{
                  message: string;
                  requiresStripeAction: boolean;
                }>(tenantId, "/subscription/cancel", {
                  method: "POST",
                  body: JSON.stringify({
                    reason: reason.trim(),
                    acknowledgeStripeSubscription: acknowledgeStripe,
                  }),
                });
                onDone(result.message);
              } catch (reason_) {
                const message = describeError(
                  reason_,
                  "The subscription could not be cancelled.",
                );
                /*
                 * The API refuses a Stripe-backed cancellation until it is
                 * acknowledged. Surface the checkbox rather than leaving the
                 * operator to re-read the error and guess.
                 */
                if (message.includes("Stripe")) {
                  setNeedsStripeAcknowledgement(true);
                }
                setError(message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Cancel subscription
          </PanelButton>
        </>
      }
    >
      <DialogField
        label="Reason"
        required
        hint="Recorded on the tenant timeline and in the platform audit log."
      >
        <textarea
          rows={3}
          className={`${dialogInputClass} h-auto py-2`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Contract terminated effective end of term."
        />
      </DialogField>
      {needsStripeAcknowledgement ? (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-rose-600"
            checked={acknowledgeStripe}
            onChange={(event) => setAcknowledgeStripe(event.target.checked)}
          />
          <span>
            I understand this subscription is billed through Stripe, and that it
            must also be cancelled in Stripe to stop charging the customer.
          </span>
        </label>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
    </PanelDialog>
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
