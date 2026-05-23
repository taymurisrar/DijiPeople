"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  BillingCycle,
  PublicPlan,
  findPlanPrice,
  formatPlanPrice,
  getAvailableCurrenciesFromPlans,
  isCheckoutReady,
} from "../../lib/plans";

export function SubscribeForm({
  plans,
  defaultCurrency,
  availableCurrencies,
  error,
  initialPlanPriceId,
}: {
  plans: PublicPlan[];
  defaultCurrency: string;
  availableCurrencies?: string[];
  error?: string;
  initialPlanPriceId?: string;
}) {
  const currencies = useMemo(
    () =>
      availableCurrencies?.length
        ? availableCurrencies
        : getAvailableCurrenciesFromPlans(plans),
    [availableCurrencies, plans],
  );
  const initialSelection = findInitialSelection(plans, initialPlanPriceId);
  const [planId, setPlanId] = useState(initialSelection.planId);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialSelection.billingCycle);
  const [currency, setCurrency] = useState(initialSelection.currency || defaultCurrency);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    country: "",
    message: "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPlan = plans.find((plan) => plan.id === planId) ?? plans[0] ?? null;
  const selectedPrice = selectedPlan
    ? findPlanPrice(selectedPlan, currency, billingCycle)
    : null;
  const canCheckout = isCheckoutReady(selectedPrice);
  const contactHref = selectedPlan
    ? `/contact?plan=${encodeURIComponent(selectedPlan.key)}`
    : "/contact";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPrice || !canCheckout) {
      setStatus(
        selectedPrice
          ? "This price is visible but not connected to Stripe checkout yet. Please contact sales."
          : "This plan does not have a price for the selected billing option. Please contact sales.",
      );
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const response = await fetch("/api/public/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        planPriceId: selectedPrice.id,
        phone: form.phone || undefined,
        message: form.message || undefined,
      }),
    });
    const payload = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok || !payload?.url) {
      setStatus(payload?.message ?? "Unable to start Stripe Checkout.");
      return;
    }

    window.location.assign(payload.url);
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-danger/30 bg-danger/5 p-5 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!plans.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-white p-5 text-sm text-muted">
        No public plans are currently active. Please contact sales.
      </div>
    );
  }

  return (
    <form className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]" onSubmit={submit}>
      <section className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">Selected plan</h2>
        <label className="mt-4 block text-sm font-medium text-foreground">
          Plan
          <select className="mt-2 w-full rounded-xl border border-border px-3 py-2" onChange={(event) => setPlanId(event.target.value)} value={planId}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.name}</option>
            ))}
          </select>
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-foreground">
            Billing
            <select className="mt-2 w-full rounded-xl border border-border px-3 py-2" onChange={(event) => setBillingCycle(event.target.value as BillingCycle)} value={billingCycle}>
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>
          <label className="text-sm font-medium text-foreground">
            Currency
            <select className="mt-2 w-full rounded-xl border border-border px-3 py-2" onChange={(event) => setCurrency(event.target.value)} value={currency}>
              {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 rounded-2xl bg-surface-muted p-4">
          <p className="text-3xl font-semibold text-foreground">
            {formatPlanPrice(selectedPrice)}
          </p>
          <p className="mt-1 text-sm text-muted">
            Secure subscription checkout is handled by Stripe.
          </p>
          {selectedPrice && selectedPrice.currency !== currency ? (
            <p className="mt-2 text-xs text-warning">
              {currency} is unavailable for this plan. Showing {selectedPrice.currency.toUpperCase()} price.
            </p>
          ) : null}
          {selectedPrice && !canCheckout ? (
            <p className="mt-2 text-xs text-muted">
              This price is configured for display, but online checkout is not
              available yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">Company details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Company / workspace name" onChange={(value) => setForm({ ...form, companyName: value })} required value={form.companyName} />
          <Field label="Contact name" onChange={(value) => setForm({ ...form, contactName: value })} required value={form.contactName} />
          <Field label="Email" onChange={(value) => setForm({ ...form, email: value })} required type="email" value={form.email} />
          <Field label="Phone" onChange={(value) => setForm({ ...form, phone: value })} type="tel" value={form.phone} />
          <Field label="Country / region" onChange={(value) => setForm({ ...form, country: value })} required value={form.country} />
        </div>
        <label className="mt-4 block text-sm font-medium text-foreground">
          Optional message
          <textarea className="mt-2 min-h-28 w-full rounded-xl border border-border px-3 py-2" onChange={(event) => setForm({ ...form, message: event.target.value })} value={form.message} />
        </label>
        <p className="mt-4 text-xs leading-5 text-muted">
          Your tenant stays inactive until Stripe confirms payment through the
          webhook. The success page does not activate access.
        </p>
        {status ? <p className="mt-4 text-sm text-danger">{status}</p> : null}
        {canCheckout ? (
          <button className="mt-5 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Starting checkout..." : "Continue to Stripe Checkout"}
          </button>
        ) : (
          <a className="mt-5 inline-flex rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground hover:bg-surface-muted" href={contactHref}>
            Contact sales
          </a>
        )}
      </section>
    </form>
  );
}

function Field({
  label,
  onChange,
  required,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="text-sm font-medium text-foreground">
      {label}
      <input className="mt-2 w-full rounded-xl border border-border px-3 py-2" onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} />
    </label>
  );
}

function findInitialSelection(plans: PublicPlan[], planPriceId?: string) {
  for (const plan of plans) {
    const price = plan.prices.find((item) => item.id === planPriceId);
    if (price) {
      return {
        planId: plan.id,
        billingCycle: price.billingCycle,
        currency: price.currency,
      };
    }
  }

  const firstPlan = plans[0];
  const firstPrice = firstPlan?.prices[0];
  return {
    planId: firstPlan?.id ?? "",
    billingCycle: firstPrice?.billingCycle ?? "MONTHLY",
    currency: firstPrice?.currency ?? "",
  };
}
