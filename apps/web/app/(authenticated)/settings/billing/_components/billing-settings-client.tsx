"use client";

import type { ReactNode } from "react";
import { Fragment, useId, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCcw,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { SegmentedControl } from "@/app/components/ui/segmented-control";
import {
  estimateSeatOrder,
  validateSeatCount,
  type SeatCountValidation,
} from "../_lib/seat-pricing";
import {
  computeAnnualSavingsPercent,
  rankPlanFeatures,
  resolveDefaultCurrency,
} from "../_lib/plan-presentation";

type SubscriptionView = "overview" | "plans" | "billing-history";

type BillingCycle = "MONTHLY" | "ANNUAL";

type BillingPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder?: number;
  isPopular?: boolean;
  isRecommended?: boolean;
  prices: Array<{
    id: string;
    billingCycle: BillingCycle;
    currency: string;
    unitAmount: number;
    billingModel?: "PER_SEAT" | "FLAT";
    billingInterval?: "MONTH" | "YEAR";
    minimumSeats?: number;
    maximumSeats?: number | null;
    includedSeats?: number;
    hasStripePrice: boolean;
    isCheckoutReady: boolean;
  }>;
  features: Array<{
    key: string;
    label?: string | null;
    description?: string | null;
    categoryKey?: string | null;
    categoryLabel?: string | null;
    categoryOrder?: number | null;
    sortOrder?: number | null;
    isEnabled?: boolean;
  }>;
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
  activeView?: SubscriptionView;
  /*
   * BUG-3333 — the currency list the server considers sellable at all. Prefer
   * this over re-deriving the same set from `initialPlans` client-side: two
   * copies of "which currencies exist" is exactly the duplicate-source-of-
   * truth problem the record calls out, and once the API scopes this to the
   * tenant's market, the frontend inherits that narrowing for free.
   */
  availableCurrencies?: string[];
  presentation?: {
    allowPlanComparison?: boolean;
    allowSelfServiceUpgrade?: boolean;
    showUpgradeOptions?: boolean;
    contactLabel?: string;
  };
};

/*
 * Subscription states in which the API refuses a new Stripe Checkout session
 * outright (`resolveCheckoutState` / the 409 in `billing.service.ts`).
 * BUG-3331 (UI half): no plan may offer "Subscribe" while one of these is
 * true, not only the tenant's current plan — every checkout attempt in this
 * state fails identically regardless of which card it came from.
 */
const LIVE_SUBSCRIPTION_STATES = ["ACTIVE", "TRIALING", "PAST_DUE", "UNPAID"];

// Keeps a card's height reasonable now that it also carries an order summary
// (BUG-3330). Differentiating features are always ranked first (BUG-3332), so
// a cut here only ever removes features already visible on a cheaper plan.
const FEATURE_DISPLAY_CAP = 6;

export function BillingSettingsClient({
  initialPlans,
  initialSubscription,
  initialInvoices,
  activeView = "overview",
  availableCurrencies,
  presentation,
}: BillingSettingsClientProps) {
  const [plans] = useState(initialPlans);
  const [subscription, setSubscription] = useState(initialSubscription);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [currency, setCurrency] = useState(
    () =>
      resolveDefaultCurrency({
        currencies:
          availableCurrencies && availableCurrencies.length > 0
            ? [...availableCurrencies].sort()
            : deriveCurrenciesFromPlans(initialPlans),
        subscriptionCurrency: initialSubscription?.currency ?? null,
        plans: initialPlans,
        billingCycle: "MONTHLY",
      }) ?? "USD",
  );
  const [seatQuantity, setSeatQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const seatFieldId = useId();

  const currencies = useMemo(
    () =>
      availableCurrencies && availableCurrencies.length > 0
        ? [...availableCurrencies].sort()
        : deriveCurrenciesFromPlans(plans),
    [availableCurrencies, plans],
  );

  const annualSavingsPercent = useMemo(
    () => computeAnnualSavingsPercent(plans, currency),
    [plans, currency],
  );

  const hasManageableSubscription = Boolean(subscription?.hasStripeCustomer);
  const subscriptionState = subscription?.status ?? "NOT_SUBSCRIBED";
  const hasLiveSubscriptionBlock =
    LIVE_SUBSCRIPTION_STATES.includes(subscriptionState);
  const canComparePlans = presentation?.allowPlanComparison !== false;
  const canSelfServiceUpgrade = presentation?.allowSelfServiceUpgrade !== false;
  const contactLabel = presentation?.contactLabel ?? "Contact Administrator";

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
        const selectedPrice = plans
          .flatMap((plan) => plan.prices)
          .find((price) => price.id === planPriceId);

        if (!selectedPrice) {
          throw new Error("Selected price could not be found.");
        }

        /*
         * BUG-3330 — this used to clamp a seat count into range with
         * `Math.max`/`Math.min` and submit whatever came out, so a buyer who
         * typed a number the price could not honour was silently charged for
         * a different number than the one they entered. Refuse instead.
         */
        const validation = validateSeatCount(selectedPrice, seatQuantity);
        if (!validation.ok) {
          throw new Error(validation.message);
        }

        const response = await fetchJson<{ url?: string }>(
          "/api/billing/checkout-sessions",
          {
            method: "POST",
            body: JSON.stringify({ planPriceId, seatQuantity }),
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
    <div className="min-w-0 space-y-6">
      <nav className="flex flex-wrap gap-2 rounded-[20px] border border-border bg-surface p-2 shadow-sm">
        {[
          {
            key: "overview",
            label: "Overview",
            href: "/settings/subscription/overview",
          },
          {
            key: "plans",
            label: "Plans & Features",
            href: "/settings/subscription/plans",
          },
          {
            key: "billing-history",
            label: "Billing History",
            href: "/settings/subscription/billing-history",
          },
        ].map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={activeView === item.key ? "page" : undefined}
            className={`rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
              activeView === item.key
                ? "bg-accent text-white"
                : "text-muted hover:bg-muted/10 hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {activeView === "overview" ? (
        <>
          {error ? <AlertBanner message={error} /> : null}

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

                <StatusPill tone={resolveStatusTone(subscriptionState)}>
                  {formatEnum(subscriptionState)}
                </StatusPill>
              </div>

              <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoTile
                  label="Billing cycle"
                  value={formatEnum(subscription?.billingCycle)}
                />
                <InfoTile
                  label="Currency"
                  value={subscription?.currency ?? "-"}
                />
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
                <Button
                  variant="primary"
                  onClick={openPortal}
                  disabled={!hasManageableSubscription || isPending}
                  loading={actionId === "portal"}
                  leftIcon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
                >
                  Manage in Stripe
                </Button>
                <Button
                  variant="secondary"
                  onClick={refreshBilling}
                  disabled={isPending}
                  leftIcon={<RefreshCcw className="h-4 w-4" aria-hidden="true" />}
                >
                  Refresh status
                </Button>
              </div>
              {!hasManageableSubscription ? (
                <p className="mt-4 text-sm leading-6 text-muted">
                  Stripe Customer Portal becomes available after a subscription
                  or Stripe customer is created for this tenant.
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
        </>
      ) : null}

      {activeView === "plans" ? (
        <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          {error ? <AlertBanner message={error} /> : null}

          <label
            htmlFor={seatFieldId}
            className="mb-1 block max-w-xs text-sm font-semibold text-foreground"
          >
            Seats to purchase
          </label>
          <input
            id={seatFieldId}
            type="number"
            min={1}
            value={seatQuantity}
            onChange={(event) =>
              setSeatQuantity(Math.max(1, Number(event.target.value)))
            }
            className="mt-2 w-full max-w-xs rounded-xl border border-border px-3 py-2"
          />
          <p className="mb-5 mt-2 max-w-xs text-xs leading-5 text-muted">
            Applies to whichever plan you subscribe to below. Minimum and
            maximum seats vary by plan — see each plan&apos;s order summary.
          </p>

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
                  {
                    label: "Annual",
                    value: "ANNUAL",
                    description:
                      annualSavingsPercent && annualSavingsPercent > 0
                        ? `save ${annualSavingsPercent}%`
                        : undefined,
                  },
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

          {!canComparePlans ? (
            <EmptyState
              title="Plan comparison is not enabled"
              description="The platform administrator has not published tenant-facing plan comparison for this workspace."
            />
          ) : plans.length === 0 ? (
            <EmptyState
              title="No online plans are available"
              description="The billing team has not published any self-service plans yet."
            />
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan, planIndex) => {
                const price = plan.prices.find(
                  (item) =>
                    item.billingCycle === billingCycle &&
                    item.currency === currency,
                );

                /*
                 * BUG-3331 (UI half) — the current-plan comparison used to be
                 * plan identity alone, so the Annual view of a Monthly
                 * subscription still read "Current plan", and switching
                 * currency could report a plan as current that the tenant is
                 * not actually billed in. Cycle and currency now have to
                 * match too.
                 */
                const isCurrentPlanExact = Boolean(
                  subscription &&
                    subscription.plan.id === plan.id &&
                    subscription.billingCycle === billingCycle &&
                    subscription.currency === currency,
                );

                const previousPlan = plans[planIndex - 1];
                const rankedFeatures = rankPlanFeatures(plan, previousPlan);
                const visibleFeatures = rankedFeatures.slice(
                  0,
                  FEATURE_DISPLAY_CAP,
                );
                const hiddenFeatureCount =
                  rankedFeatures.length - visibleFeatures.length;

                const seatValidation: SeatCountValidation | null = price
                  ? validateSeatCount(price, seatQuantity)
                  : null;
                const seatOrder =
                  price && seatValidation?.ok
                    ? estimateSeatOrder(price, seatQuantity)
                    : null;

                return (
                  <article
                    key={plan.id}
                    className={`flex min-h-full flex-col rounded-[20px] border p-5 shadow-sm ${
                      plan.isPopular || plan.isRecommended
                        ? "border-accent/40 bg-white ring-1 ring-accent/20"
                        : "border-border bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-foreground">
                            {plan.name}
                          </h3>
                          {plan.isPopular ? (
                            <StatusPill tone="info">Most popular</StatusPill>
                          ) : null}
                          {plan.isRecommended ? (
                            <StatusPill tone="good">Recommended</StatusPill>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          {plan.description ?? "No description provided."}
                        </p>
                      </div>
                      {isCurrentPlanExact ? (
                        <StatusPill tone="good">Current</StatusPill>
                      ) : null}
                    </div>

                    <div className="mt-5">
                      {price ? (
                        <>
                          <p className="text-3xl font-semibold text-foreground">
                            {formatMoney(price.unitAmount, price.currency)}
                            <span className="text-sm font-medium text-muted">
                              {" "}
                              {formatPriceQualifier(price, billingCycle)}
                            </span>
                          </p>
                          {price.includedSeats ? (
                            <p className="mt-1 text-xs font-medium text-muted">
                              Includes {price.includedSeats} seat
                              {price.includedSeats === 1 ? "" : "s"}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-muted">
                            {formatSeatBounds(price)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-muted">
                          Not available for {currency}{" "}
                          {formatEnum(billingCycle)}
                        </p>
                      )}
                    </div>

                    {price ? (
                      <div className="mt-4 rounded-[14px] border border-border bg-surface px-4 py-3 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                          Order summary
                        </p>
                        {seatValidation && !seatValidation.ok ? (
                          <p
                            role="alert"
                            className="mt-2 text-sm font-medium text-danger"
                          >
                            {seatValidation.message}
                          </p>
                        ) : seatOrder ? (
                          <dl className="mt-2 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-muted">Seats requested</dt>
                              <dd className="font-medium text-foreground">
                                {seatQuantity}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-muted">Billable seats</dt>
                              <dd className="font-medium text-foreground">
                                {seatOrder.billableSeats}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-2 border-t border-border pt-1">
                              <dt className="font-semibold text-foreground">
                                Total{" "}
                                {billingCycle === "MONTHLY" ? "monthly" : "annual"}
                              </dt>
                              <dd className="font-semibold text-foreground">
                                {formatMoney(
                                  seatOrder.estimatedTotal,
                                  price.currency,
                                )}
                              </dd>
                            </div>
                          </dl>
                        ) : null}
                      </div>
                    ) : null}

                    <ul className="mt-5 grid gap-2 text-sm text-muted">
                      {rankedFeatures.length > 0 ? (
                        <>
                          {visibleFeatures.map((feature) => (
                            <li
                              key={feature.key}
                              className="flex items-start gap-2"
                            >
                              <CheckCircle2
                                aria-hidden="true"
                                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                              />
                              <span>
                                {feature.label ?? formatEnum(feature.key)}
                              </span>
                            </li>
                          ))}
                          {hiddenFeatureCount > 0 ? (
                            <li>
                              <a
                                href="#feature-comparison"
                                className="font-semibold text-accent hover:underline"
                              >
                                and {hiddenFeatureCount} more
                              </a>
                            </li>
                          ) : null}
                        </>
                      ) : (
                        <li>No feature list configured.</li>
                      )}
                    </ul>

                    <div className="mt-auto pt-6">
                      {isCurrentPlanExact ? (
                        <Button variant="secondary" fullWidth disabled>
                          Current plan
                        </Button>
                      ) : price?.isCheckoutReady &&
                        canSelfServiceUpgrade &&
                        !hasLiveSubscriptionBlock ? (
                        <Button
                          variant="primary"
                          fullWidth
                          onClick={() => createCheckoutSession(price.id)}
                          disabled={
                            isPending ||
                            Boolean(seatValidation && !seatValidation.ok)
                          }
                          loading={actionId === price.id}
                          leftIcon={
                            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                          }
                        >
                          Subscribe
                        </Button>
                      ) : hasLiveSubscriptionBlock ? (
                        <div className="rounded-[14px] border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted">
                          You already have a subscription. Manage or change
                          your plan from the billing portal on the Overview
                          tab.
                        </div>
                      ) : (
                        <div className="rounded-[14px] border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted">
                          {canSelfServiceUpgrade
                            ? "This plan is not available for online checkout yet."
                            : contactLabel}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {canComparePlans && plans.length > 0 ? (
            <FeatureComparison plans={plans} />
          ) : null}
        </section>
      ) : null}

      {activeView === "billing-history" ? (
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
            <div className="w-full min-w-0 overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="bg-muted/10 text-xs uppercase tracking-[0.14em] text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Invoice
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Period
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Total
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Paid
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Due
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Paid date
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="bg-white">
                      <td className="px-5 py-4 font-semibold text-foreground">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={resolveStatusTone(invoice.status)}>
                          {formatEnum(invoice.status)}
                        </StatusPill>
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
                              <ExternalLink
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              View
                            </SafeExternalLink>
                          ) : null}
                          {invoice.invoicePdfUrl ? (
                            <SafeExternalLink href={invoice.invoicePdfUrl}>
                              <Download className="h-4 w-4" aria-hidden="true" />
                              PDF
                            </SafeExternalLink>
                          ) : null}
                          {!invoice.hostedInvoiceUrl &&
                          !invoice.invoicePdfUrl ? (
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
      ) : null}
    </div>
  );
}

/*
 * BUG-3335 — this used to be six independent `<table>` elements, one per
 * feature category, each auto-sizing its own columns. Nothing tied their
 * column widths together, so the same plan landed at a different horizontal
 * offset in every category block, and each table scrolled on its own. One
 * table with category header rows and an explicit `colgroup` fixes both: the
 * columns line up because there is only one set of them, and there is one
 * scroller instead of six.
 */
function FeatureComparison({ plans }: { plans: BillingPlan[] }) {
  const featuresByKey = new Map<
    string,
    NonNullable<BillingPlan["features"][number]>
  >();

  for (const plan of plans) {
    for (const feature of plan.features) {
      if (!featuresByKey.has(feature.key)) {
        featuresByKey.set(feature.key, feature);
      }
    }
  }

  const grouped = [...featuresByKey.values()]
    .sort(compareFeatures)
    .reduce<Record<string, BillingPlan["features"]>>((acc, feature) => {
      const key = feature.categoryLabel ?? "Features";
      acc[key] = [...(acc[key] ?? []), feature];
      return acc;
    }, {});

  const columnWidth = plans.length > 0 ? 60 / plans.length : 60;

  return (
    <div id="feature-comparison" className="mt-8 min-w-0 scroll-mt-24 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Feature access
        </p>
        <h3 className="mt-2 text-lg font-semibold text-foreground">
          Included features by plan
        </h3>
      </div>

      <div className="w-full min-w-0 max-h-[560px] overflow-auto rounded-[18px] border border-border bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <colgroup>
            <col style={{ width: "40%" }} />
            {plans.map((plan) => (
              <col key={plan.id} style={{ width: `${columnWidth}%` }} />
            ))}
          </colgroup>
          <thead className="text-xs uppercase tracking-[0.14em] text-muted">
            <tr>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-border bg-white px-5 py-3 font-semibold"
              >
                Feature
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className="sticky top-0 z-10 border-b border-border bg-white px-5 py-3 font-semibold"
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Object.entries(grouped).map(([category, features]) => (
              <Fragment key={category}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={plans.length + 1}
                    className="bg-muted/10 px-5 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-foreground"
                  >
                    {category}
                  </th>
                </tr>
                {features.map((feature) => (
                  <tr key={feature.key}>
                    <th
                      scope="row"
                      className="px-5 py-4 text-left align-top font-normal"
                    >
                      <div className="font-semibold text-foreground">
                        {feature.label ?? formatEnum(feature.key)}
                      </div>
                      {feature.description ? (
                        <div className="mt-1 text-xs font-normal leading-5 text-muted">
                          {feature.description}
                        </div>
                      ) : null}
                    </th>
                    {plans.map((plan, planIndex) => {
                      const isIncluded = plan.features.some(
                        (planFeature) =>
                          planFeature.key === feature.key &&
                          planFeature.isEnabled !== false,
                      );
                      // ITEM-0160 (deferred, out of scope here) assumes this
                      // ascending-tier ordering to decide "available in a
                      // higher plan" — preserved as-is by the restructure.
                      const availableLater =
                        !isIncluded &&
                        plans
                          .slice(planIndex + 1)
                          .some((laterPlan) =>
                            laterPlan.features.some(
                              (planFeature) =>
                                planFeature.key === feature.key &&
                                planFeature.isEnabled !== false,
                            ),
                          );

                      return (
                        <td key={plan.id} className="px-5 py-4 align-top">
                          <StatusPill
                            tone={
                              isIncluded
                                ? "good"
                                : availableLater
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {isIncluded
                              ? "Included"
                              : availableLater
                                ? "Available in higher plan"
                                : "Not included"}
                          </StatusPill>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-[18px] border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
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
    <Button
      variant="primary"
      onClick={onClick}
      disabled={isPending}
      loading={loading}
      leftIcon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
      className="shrink-0"
    >
      Manage billing
    </Button>
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

function resolveStatusTone(
  value: string,
): "good" | "warning" | "muted" | "neutral" {
  const normalized = value.toUpperCase();

  if (
    normalized === "ACTIVE" ||
    normalized === "PAID" ||
    normalized === "CURRENT"
  ) {
    return "good";
  }

  if (
    normalized === "PAST_DUE" ||
    normalized === "PAYMENT_FAILED" ||
    normalized === "UNPAID"
  ) {
    return "warning";
  }

  if (normalized === "CANCELED" || normalized === "VOIDED") {
    return "muted";
  }

  return "neutral";
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

function deriveCurrenciesFromPlans(plans: BillingPlan[]) {
  const values = new Set<string>();
  for (const plan of plans) {
    for (const price of plan.prices) values.add(price.currency);
  }
  return [...values].sort();
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

/*
 * BUG-3330 — every self-service price is per-seat, and the screen used to
 * render the interval suffix ("/ month") with no mention of that, so a buyer
 * read a single seat's price as the whole charge. `PER_SEAT` is the only
 * model that gets the word "seat"; this mirrors `resolveBillableSeatsClient`'s
 * own convention of treating anything else as a flat, one-unit charge.
 */
function formatPriceQualifier(
  price: { billingModel?: "PER_SEAT" | "FLAT" },
  billingCycle: BillingCycle,
) {
  const interval = billingCycle === "MONTHLY" ? "month" : "year";
  return price.billingModel === "PER_SEAT"
    ? `/ seat / ${interval}`
    : `/ ${interval}`;
}

function formatSeatBounds(price: {
  minimumSeats?: number;
  maximumSeats?: number | null;
}) {
  const minimum = price.minimumSeats ?? 1;
  if (price.maximumSeats == null) {
    return `Minimum ${minimum} seat${minimum === 1 ? "" : "s"}.`;
  }
  return `${minimum}-${price.maximumSeats} seats.`;
}

function compareFeatures(
  left: BillingPlan["features"][number],
  right: BillingPlan["features"][number],
) {
  return (
    (left.categoryOrder ?? 999) - (right.categoryOrder ?? 999) ||
    (left.sortOrder ?? 999) - (right.sortOrder ?? 999) ||
    (left.label ?? left.key).localeCompare(right.label ?? right.key)
  );
}
