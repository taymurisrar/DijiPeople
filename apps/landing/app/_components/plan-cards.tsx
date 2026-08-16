"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BillingCycle,
  PublicPlan,
  findPlanPrice,
  formatBillingUnit,
  formatPlanPrice,
  getDisplayFeatures,
  humanizeFeature,
  isCheckoutReady,
} from "../../lib/plans";

export function PlanCards({
  plans,
  defaultCurrency,
  error,
  compact = false,
}: {
  plans: PublicPlan[];
  defaultCurrency: string;
  error?: string;
  compact?: boolean;
}) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  // The market's currency, resolved server-side from published configuration.
  // Not selectable here — see the note where the selector used to be.
  const currency = defaultCurrency;

  if (error) {
    return (
      <div className="rounded-[24px] border border-danger/30 bg-danger/5 px-5 py-6 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!plans.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-white px-5 py-6 text-sm text-muted">
        No public plans are currently active. Please contact sales for the
        right subscription path.
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-xl border border-border bg-white p-1">
          {(["MONTHLY", "ANNUAL"] as BillingCycle[]).map((cycle) => (
            <button
              className={[
                "rounded-lg px-4 py-2 text-sm font-semibold",
                billingCycle === cycle ? "bg-foreground text-white" : "text-muted",
              ].join(" ")}
              key={cycle}
              onClick={() => setBillingCycle(cycle)}
              type="button"
            >
              {cycle === "MONTHLY" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>

        {/*
          The currency selector is deliberately not rendered.
          Currency is a property of the visitor's market, resolved server-side
          from published configuration. Letting a visitor pick one invites
          choosing a currency their market has no price in, and then being
          quoted a fallback in a different currency than the one they picked.
          Multi-currency support is intact underneath — `currency` here is the
          market's, and `availableCurrencies` still arrives from the backend.
        */}
        {currency ? (
          <p className="text-sm text-muted">
            Prices shown in <span className="font-semibold">{currency}</span>
          </p>
        ) : null}
      </div>

      <div className={compact ? "grid gap-4 lg:grid-cols-3" : "grid gap-5 lg:grid-cols-3"}>
        {plans.map((plan) => {
          const price = findPlanPrice(plan, currency, billingCycle);
          const canCheckout = isCheckoutReady(price);
          const features = getDisplayFeatures(plan);
          // Which plan is highlighted is a commercial decision, so it comes
          // from plan configuration only. This used to fall back to
          // `index === 1`, which made whichever plan happened to be second
          // "Popular" regardless of what anyone configured — and silently
          // changed the highlighted plan whenever sortOrder changed.
          const isHighlighted = Boolean(plan.isPopular || plan.isRecommended);
          const contactHref = `/contact?plan=${encodeURIComponent(plan.key)}`;

          return (
            <article
              className={[
                "flex flex-col rounded-[24px] border bg-white p-5 shadow-sm",
                isHighlighted ? "border-accent ring-accent-soft" : "border-border",
              ].join(" ")}
              key={plan.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                    {plan.name}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">
                    {plan.description || "Configurable HR operations plan"}
                  </h3>
                </div>
                {isHighlighted ? (
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                    {plan.isRecommended ? "Recommended" : "Popular"}
                  </span>
                ) : null}
              </div>

              <div className="mt-5 rounded-2xl border border-border bg-surface-muted p-4">
                <p className="text-3xl font-semibold text-foreground">
                  {formatPlanPrice(price)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {price
                    ? (formatBillingUnit(price) ??
                      `per ${billingCycle === "MONTHLY" ? "month" : "year"}`)
                    : "Custom pricing"}
                </p>
                {price && formatBillingUnit(price) ? (
                  <p className="mt-1 text-xs text-muted">
                    Billed {billingCycle === "MONTHLY" ? "monthly" : "annually"}
                  </p>
                ) : null}
                {price && !canCheckout ? (
                  <p className="mt-2 text-xs text-muted">
                    Online checkout is not available for this price yet.
                  </p>
                ) : null}
              </div>

              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted">
                {features.slice(0, compact ? 4 : features.length).map((feature) => (
                  <li className="flex gap-2" key={feature.id ?? feature.key}>
                    <span className="mt-1 h-2 w-2 rounded-full bg-accent" />
                    <span>{humanizeFeature(feature.key)}</span>
                  </li>
                ))}
                {compact && features.length > 4 ? (
                  <li className="text-xs font-semibold text-accent">
                    + {features.length - 4} more features
                  </li>
                ) : null}
              </ul>

              <Link
                className={[
                  "mt-6 inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition",
                  canCheckout
                    ? "bg-accent text-white hover:bg-accent-strong"
                    : "border border-border bg-white text-foreground hover:bg-surface-muted",
                ].join(" ")}
                href={canCheckout && price ? `/subscribe?planPriceId=${price.id}` : contactHref}
              >
                {canCheckout ? "Subscribe" : price ? "Contact sales" : "Custom pricing"}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
