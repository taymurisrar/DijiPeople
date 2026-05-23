"use client";

import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCcw,
} from "lucide-react";

type BillingCycle = "MONTHLY" | "ANNUAL";

type BillingPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  prices: Array<{
    id: string;
    billingCycle: BillingCycle;
    currency: string;
    unitAmount: number;
    hasStripePrice: boolean;
    isCheckoutReady: boolean;
  }>;
  features: Array<{ key: string }>;
};

type BillingSubscription = {
  id: string;
  status: string;
  stripeStatus: string | null;
  hasStripeCustomer?: boolean;
  billingCycle: BillingCycle;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialStart: string | null;
  trialEnd: string | null;
  plan: {
    id: string;
    key: string;
    name: string;
    description: string | null;
  };
};

type BillingInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  total: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
};

type BillingSettingsClientProps = {
  initialPlans: BillingPlan[];
  initialSubscription: BillingSubscription | null;
  initialInvoices: BillingInvoice[];
};

export function BillingSettingsClient({
  initialPlans,
  initialSubscription,
  initialInvoices,
}: BillingSettingsClientProps) {
  const [plans] = useState(initialPlans);
  const [subscription, setSubscription] = useState(initialSubscription);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [currency, setCurrency] = useState(
    resolveInitialCurrency(initialPlans),
  );
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currencies = useMemo(() => {
    const values = new Set<string>();
    for (const plan of plans) {
      for (const price of plan.prices) values.add(price.currency);
    }
    return [...values].sort();
  }, [plans]);

  const hasManageableSubscription = Boolean(subscription?.hasStripeCustomer);
  const subscriptionState = subscription?.status ?? "NOT_SUBSCRIBED";

  function refreshBilling() {
    setError(null);
    startTransition(async () => {
      const [nextSubscription, nextInvoices] = await Promise.all([
        fetchJson<BillingSubscription | null>("/api/billing/subscription"),
        fetchJson<BillingInvoice[]>("/api/billing/invoices"),
      ]).catch((requestError) => {
        setError(getErrorMessage(requestError, "Unable to refresh billing."));
        return [subscription, invoices] as const;
      });

      setSubscription(nextSubscription);
      setInvoices(nextInvoices);
    });
  }

  function createCheckoutSession(planPriceId: string) {
    setError(null);
    setActionId(planPriceId);
    startTransition(async () => {
      try {
        const response = await fetchJson<{ url?: string }>(
          "/api/billing/checkout-sessions",
          {
            method: "POST",
            body: JSON.stringify({ planPriceId }),
          },
        );

        if (!response.url) {
          throw new Error("Checkout URL was not returned.");
        }

        window.location.assign(response.url);
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to start checkout."));
        setActionId(null);
      }
    });
  }

  function openPortal() {
    setError(null);
    setActionId("portal");
    startTransition(async () => {
      try {
        const response = await fetchJson<{ url?: string }>(
          "/api/billing/portal-sessions",
          { method: "POST" },
        );

        if (!response.url) {
          throw new Error("Billing portal URL was not returned.");
        }

        window.location.assign(response.url);
      } catch (requestError) {
        setError(
          getErrorMessage(requestError, "Unable to open the billing portal."),
        );
        setActionId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Current Subscription
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                {subscription?.plan.name ?? "No active plan"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                {subscription?.plan.description ??
                  "Choose a public plan below to start Stripe Checkout. Subscription activation is confirmed by Stripe webhook processing."}
              </p>
            </div>

            <StatusChip value={subscription?.status ?? "NOT_SUBSCRIBED"} />
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoTile
              label="Billing cycle"
              value={formatEnum(subscription?.billingCycle)}
            />
            <InfoTile label="Currency" value={subscription?.currency ?? "-"} />
            <InfoTile
              label="Period start"
              value={formatDate(subscription?.currentPeriodStart)}
            />
            <InfoTile
              label="Period end"
              value={formatDate(subscription?.currentPeriodEnd)}
            />
            <InfoTile
              label="Cancel at period end"
              value={subscription?.cancelAtPeriodEnd ? "Yes" : "No"}
            />
            <InfoTile
              label="Trial"
              value={
                subscription?.trialEnd
                  ? `${formatDate(subscription.trialStart)} - ${formatDate(subscription.trialEnd)}`
                  : "No active trial"
              }
            />
          </dl>
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Billing actions
          </p>
          <div className="mt-5 grid gap-3">
            <button
              type="button"
              onClick={openPortal}
              disabled={!hasManageableSubscription || isPending}
              className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-foreground px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted"
            >
              {actionId === "portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpRight className="h-4 w-4" />
              )}
              Manage in Stripe
            </button>
            <button
              type="button"
              onClick={refreshBilling}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh status
            </button>
          </div>
          {!hasManageableSubscription ? (
            <p className="mt-4 text-sm leading-6 text-muted">
              Stripe Customer Portal becomes available after a subscription or
              Stripe customer is created for this tenant.
            </p>
          ) : null}
        </div>
      </section>

      <SubscriptionStateAlert
        status={subscriptionState}
        hasStripeCustomer={Boolean(subscription?.hasStripeCustomer)}
        onManage={openPortal}
        isPending={isPending}
        actionId={actionId}
      />

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Plans
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              Select a subscription plan
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Plans shown here are active, public, and configured by the
              platform billing team.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <SegmentedControl
              label="Billing cycle"
              value={billingCycle}
              options={[
                { label: "Monthly", value: "MONTHLY" },
                { label: "Annual", value: "ANNUAL" },
              ]}
              onChange={setBillingCycle}
            />
            <label className="text-sm font-medium text-foreground">
              Currency
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                className="mt-2 h-11 rounded-[12px] border border-border bg-white px-3 text-sm text-foreground outline-none"
              >
                {currencies.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {plans.length === 0 ? (
          <EmptyState
            title="No online plans are available"
            description="The billing team has not published any self-service plans yet."
          />
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {plans.map((plan) => {
              const price = plan.prices.find(
                (item) =>
                  item.billingCycle === billingCycle &&
                  item.currency === currency,
              );
              const isCurrentPlan = subscription?.plan.id === plan.id;
              const blocksCheckout =
                isCurrentPlan &&
                ["ACTIVE", "TRIALING", "PAST_DUE", "UNPAID"].includes(
                  subscriptionState,
                );

              return (
                <article
                  key={plan.id}
                  className="flex min-h-full flex-col rounded-[20px] border border-border bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {plan.name}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {plan.description ?? "No description provided."}
                      </p>
                    </div>
                    {isCurrentPlan ? <StatusChip value="CURRENT" /> : null}
                  </div>

                  <div className="mt-5">
                    {price ? (
                      <p className="text-3xl font-semibold text-foreground">
                        {formatMoney(price.unitAmount, price.currency)}
                        <span className="text-sm font-medium text-muted">
                          {" "}
                          / {billingCycle === "MONTHLY" ? "month" : "year"}
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-muted">
                        Not available for {currency} {formatEnum(billingCycle)}
                      </p>
                    )}
                  </div>

                  <ul className="mt-5 grid gap-2 text-sm text-muted">
                    {plan.features.length > 0 ? (
                      plan.features.slice(0, 8).map((feature) => (
                        <li
                          key={feature.key}
                          className="flex items-start gap-2"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{feature.key}</span>
                        </li>
                      ))
                    ) : (
                      <li>No feature list configured.</li>
                    )}
                  </ul>

                  <div className="mt-auto pt-6">
                    {price?.isCheckoutReady ? (
                      <button
                        type="button"
                        onClick={() => createCheckoutSession(price.id)}
                        disabled={isPending || blocksCheckout}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-foreground px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted"
                      >
                        {actionId === price.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                        {blocksCheckout ? "Current plan" : "Subscribe"}
                      </button>
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted">
                        This plan is not available for online checkout yet.
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Invoices
          </p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">
            Billing history
          </h2>
        </div>

        {invoices.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No invoices yet"
              description="Invoices created by Stripe webhook processing will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-muted/10 text-xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Period</th>
                  <th className="px-5 py-3 font-semibold">Total</th>
                  <th className="px-5 py-3 font-semibold">Paid</th>
                  <th className="px-5 py-3 font-semibold">Due</th>
                  <th className="px-5 py-3 font-semibold">Paid date</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="bg-white">
                    <td className="px-5 py-4 font-semibold text-foreground">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-5 py-4">
                      <StatusChip value={invoice.status} />
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {formatDate(invoice.periodStart)} -{" "}
                      {formatDate(invoice.periodEnd)}
                    </td>
                    <td className="px-5 py-4 text-foreground">
                      {formatMoney(invoice.total, invoice.currency)}
                    </td>
                    <td className="px-5 py-4 text-foreground">
                      {formatMoney(invoice.amountPaid, invoice.currency)}
                    </td>
                    <td className="px-5 py-4 text-foreground">
                      {formatMoney(invoice.amountDue, invoice.currency)}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {formatDate(invoice.paidAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {invoice.hostedInvoiceUrl ? (
                          <SafeExternalLink href={invoice.hostedInvoiceUrl}>
                            <ExternalLink className="h-4 w-4" />
                            View
                          </SafeExternalLink>
                        ) : null}
                        {invoice.invoicePdfUrl ? (
                          <SafeExternalLink href={invoice.invoicePdfUrl}>
                            <Download className="h-4 w-4" />
                            PDF
                          </SafeExternalLink>
                        ) : null}
                        {!invoice.hostedInvoiceUrl && !invoice.invoicePdfUrl ? (
                          <span className="text-muted">No links</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SubscriptionStateAlert({
  status,
  hasStripeCustomer,
  onManage,
  isPending,
  actionId,
}: {
  status: string;
  hasStripeCustomer: boolean;
  onManage: () => void;
  isPending: boolean;
  actionId: string | null;
}) {
  if (status === "NOT_SUBSCRIBED") {
    return null;
  }

  if (status === "ACTIVE" || status === "TRIALING") {
    return (
      <BillingAlert
        tone="success"
        title="Subscription is active"
        description="Billing changes, payment methods, and cancellation settings are managed through Stripe Customer Portal."
        action={
          hasStripeCustomer ? (
            <ManageButton
              onClick={onManage}
              isPending={isPending}
              loading={actionId === "portal"}
            />
          ) : null
        }
      />
    );
  }

  if (status === "PAST_DUE" || status === "UNPAID") {
    return (
      <BillingAlert
        tone="warning"
        title="Payment action required"
        description="Stripe reported a payment issue. Update the payment method or settle the open invoice through the billing portal."
        action={
          hasStripeCustomer ? (
            <ManageButton
              onClick={onManage}
              isPending={isPending}
              loading={actionId === "portal"}
            />
          ) : null
        }
      />
    );
  }

  if (status === "INCOMPLETE") {
    return (
      <BillingAlert
        tone="warning"
        title="Checkout is incomplete"
        description="A previous checkout session did not complete. Selecting a plan will reuse a recent open Stripe Checkout session when possible, otherwise a new session is created safely."
      />
    );
  }

  if (status === "CANCELED" || status === "CANCELLED" || status === "EXPIRED") {
    return (
      <BillingAlert
        tone="neutral"
        title="Subscription is no longer active"
        description="Choose a public plan below to start a new Stripe Checkout flow."
      />
    );
  }

  return null;
}

function BillingAlert({
  title,
  description,
  tone,
  action,
}: {
  title: string;
  description: string;
  tone: "success" | "warning" | "neutral";
  action?: ReactNode;
}) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-border bg-surface text-muted";

  return (
    <section
      className={`flex flex-col gap-4 rounded-[20px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6">{description}</p>
      </div>
      {action}
    </section>
  );
}

function ManageButton({
  onClick,
  isPending,
  loading,
}: {
  onClick: () => void;
  isPending: boolean;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[14px] bg-foreground px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowUpRight className="h-4 w-4" />
      )}
      Manage billing
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-border bg-white px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function StatusChip({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const tone =
    normalized === "ACTIVE" || normalized === "PAID" || normalized === "CURRENT"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "PAST_DUE" ||
          normalized === "PAYMENT_FAILED" ||
          normalized === "UNPAID"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : normalized === "CANCELED" || normalized === "VOIDED"
          ? "border-slate-200 bg-slate-100 text-slate-600"
          : "border-border bg-white text-muted";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {formatEnum(value)}
    </span>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-2 inline-grid grid-cols-2 rounded-[14px] border border-border bg-white p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-[10px] px-4 py-2 text-sm font-semibold transition ${
              value === option.value
                ? "bg-foreground text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-border bg-white px-6 py-10 text-center">
      <FileText className="mx-auto h-8 w-8 text-muted" />
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
        {description}
      </p>
    </div>
  );
}

function SafeExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted/10"
    >
      {children}
    </a>
  );
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(getPayloadMessage(payload) ?? "Request failed.");
  }

  return payload as T;
}

function getPayloadMessage(value: unknown) {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function resolveInitialCurrency(plans: BillingPlan[]) {
  return (
    plans.flatMap((plan) => plan.prices.map((price) => price.currency))[0] ??
    "USD"
  );
}

function formatEnum(value: string | null | undefined) {
  if (!value) return "-";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
