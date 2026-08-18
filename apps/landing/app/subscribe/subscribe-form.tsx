"use client";

import { FormEvent, useState } from "react";
import {
  BillingCycle,
  PublicPlan,
  findPlanPrice,
  formatPlanPrice,
  isCheckoutReady,
} from "../../lib/plans";
import {
  resolveSubscribeSelection,
  type SubscribeSelectionParams,
} from "../../lib/subscribe-selection";

export function SubscribeForm({
  plans,
  defaultCurrency,
  error,
  selectionParams,
}: {
  plans: PublicPlan[];
  defaultCurrency: string;
  error?: string;
  selectionParams?: SubscribeSelectionParams;
}) {
  // Resolved by the shared helper so /plans -> /subscribe continuity is
  // testable; see lib/subscribe-selection.spec.ts.
  const initialSelection = resolveSubscribeSelection(plans, selectionParams);
  const [planId, setPlanId] = useState(initialSelection.planId);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    initialSelection.billingCycle,
  );
  const currency = initialSelection.currency || defaultCurrency;
  const [seatQuantity, setSeatQuantity] = useState(
    initialSelection.seatQuantity,
  );
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

  const selectedPlan =
    plans.find((plan) => plan.id === planId) ?? plans[0] ?? null;
  const selectedPrice = selectedPlan
    ? findPlanPrice(selectedPlan, currency, billingCycle)
    : null;
  const canCheckout = isCheckoutReady(selectedPrice);
  const minimumSeats = selectedPrice?.minimumSeats ?? 1;
  const maximumSeats = selectedPrice?.maximumSeats ?? null;
  const effectiveSeatQuantity = Math.max(
    minimumSeats,
    maximumSeats === null
      ? seatQuantity
      : Math.min(seatQuantity, maximumSeats),
  );
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
        seatQuantity: effectiveSeatQuantity,
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
          <select
            className="mt-2 w-full rounded-xl border border-border px-3 py-2"
            onChange={(event) => setPlanId(event.target.value)}
            value={planId}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-foreground">
            Billing
            <select
              className="mt-2 w-full rounded-xl border border-border px-3 py-2"
              onChange={(event) =>
                setBillingCycle(event.target.value as BillingCycle)
              }
              value={billingCycle}
            >
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>
          {/*
            No currency selector. Currency follows the visitor's market, which
            the backend resolves from published configuration — a buyer choosing
            a currency their market has no price in can only be shown a
            fallback in a different currency than the one they picked.
          */}
          <div className="text-sm font-medium text-foreground">
            Currency
            <p className="mt-2 rounded-xl border border-border bg-surface-muted px-3 py-2 font-semibold">
              {currency}
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl bg-surface-muted p-4">
          <p className="text-3xl font-semibold text-foreground">
            {formatPlanPrice(selectedPrice)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {selectedPrice?.billingModel === "PER_SEAT"
              ? `${effectiveSeatQuantity} purchased seat${effectiveSeatQuantity === 1 ? "" : "s"} · estimated ${new Intl.NumberFormat("en-US", { style: "currency", currency: selectedPrice.currency }).format(selectedPrice.unitAmount * effectiveSeatQuantity)} per month.`
              : "Billed as one subscription."}
          </p>
          {!selectedPrice ? (
            <p className="mt-2 text-xs text-warning">
              This plan has no published price for your region yet. Contact us
              and we will arrange it.
            </p>
          ) : null}
          {selectedPrice && !canCheckout ? (
            <p className="mt-2 text-xs text-muted">
              This price is configured for display, but online checkout is not
              available yet.
            </p>
          ) : null}
        </div>
        {selectedPrice?.billingModel === "PER_SEAT" ? (
          <label className="mt-4 block text-sm font-medium text-foreground">
            Purchased seats
            <input
              className="mt-2 w-full rounded-xl border border-border px-3 py-2"
              type="number"
              min={selectedPrice.minimumSeats ?? 1}
              max={selectedPrice.maximumSeats ?? undefined}
              value={effectiveSeatQuantity}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setSeatQuantity(
                  Math.max(
                    minimumSeats,
                    maximumSeats === null
                      ? nextValue
                      : Math.min(nextValue, maximumSeats),
                  ),
                );
              }}
              required
            />
            <span className="mt-1 block text-xs text-muted">
              Minimum {selectedPrice.minimumSeats ?? 1}
              {selectedPrice.maximumSeats
                ? ` · Maximum ${selectedPrice.maximumSeats}`
                : ""}
            </span>
          </label>
        ) : null}
      </section>

      <section className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">
          Company details
        </h2>

        {/*
          BUG-0066. When checkout is unavailable this card still rendered six
          enabled fields under a heading promising "continue to secure
          checkout", and its only action was a link that discarded whatever had
          been typed. The unavailability was stated — but on the *other* card,
          while the part that invited action said nothing.

          The fields are now disabled with the reason attached, which is the
          repository's own rule: disabled with a reason beats absent, and an
          apparently actionable dead form is worse than either.
        */}
        {!canCheckout ? (
          <p
            className="mt-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning"
            id="subscribe-unavailable-notice"
            role="status"
          >
            Online checkout is not available for this plan in your region yet,
            so these details cannot be submitted here. Talk to us and we will
            set your organization up directly.
          </p>
        ) : null}

        <fieldset
          aria-describedby={
            !canCheckout ? "subscribe-unavailable-notice" : undefined
          }
          className="m-0 border-0 p-0"
          disabled={!canCheckout}
        >
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Company / workspace name"
            onChange={(value) => setForm({ ...form, companyName: value })}
            required
            value={form.companyName}
          />
          <Field
            label="Contact name"
            onChange={(value) => setForm({ ...form, contactName: value })}
            required
            value={form.contactName}
          />
          <Field
            label="Email"
            onChange={(value) => setForm({ ...form, email: value })}
            required
            type="email"
            value={form.email}
          />
          <Field
            label="Phone"
            onChange={(value) => setForm({ ...form, phone: value })}
            type="tel"
            value={form.phone}
          />
          <Field
            label="Country / region"
            onChange={(value) => setForm({ ...form, country: value })}
            required
            value={form.country}
          />
        </div>
        <label className="mt-4 block text-sm font-medium text-foreground">
          Optional message
          <textarea
            className="mt-2 min-h-28 w-full rounded-xl border border-border px-3 py-2"
            onChange={(event) =>
              setForm({ ...form, message: event.target.value })
            }
            value={form.message}
          />
        </label>
        </fieldset>
        <p className="mt-4 text-xs leading-5 text-muted">
          Your tenant stays inactive until Stripe confirms payment through the
          webhook. The success page does not activate access.
        </p>
        {status ? <p className="mt-4 text-sm text-danger">{status}</p> : null}
        {canCheckout ? (
          <button
            className="mt-5 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? "Starting checkout..."
              : "Continue to Stripe Checkout"}
          </button>
        ) : (
          <a
            className="mt-5 inline-flex rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground hover:bg-surface-muted"
            href={contactHref}
          >
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
      <input
        className="mt-2 w-full rounded-xl border border-border px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

