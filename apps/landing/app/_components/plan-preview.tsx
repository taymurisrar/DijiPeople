import Link from "next/link";

import type { CommercialConfigView } from "../../lib/commercial-config";
import {
  billingUnitLabel,
  findOffer,
  formatMoney,
  highlightLabel,
  resolvePlanCta,
} from "../../lib/plan-presentation";

/**
 * The pricing preview on the front door.
 *
 * It reads published commercial configuration — the same source `/plans` and
 * `/subscribe` read — and that is the whole point of the component.
 *
 * What it replaces was `PlanCards`, which rendered from `/public/plans`. That
 * endpoint is not market-scoped: it returns every active price on every plan in
 * every currency any market publishes, so the home page had to pick one, and
 * the way it picked disagreed with everywhere else. A visitor in Doha was shown
 * USD here and QAR at checkout — two prices for one product, on one visit,
 * neither page obviously the wrong one.
 *
 * There is deliberately no billing-period toggle and no headcount estimator.
 * Those belong to `/plans`, where there is room to explain them; duplicating
 * either here would be a second implementation of a decision that already has
 * one, which is how the two pages drifted apart the first time.
 *
 * Monthly, because it is the smaller commitment and the number most people are
 * comparing when they land. `/plans` is one click away for the rest.
 */
export function PlanPreview({ config }: { config: CommercialConfigView }) {
  const { plans } = config;

  if (plans.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-white px-5 py-8 text-center">
        <p className="text-base font-semibold text-foreground">
          We haven&rsquo;t published pricing for your region yet.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Tell us about your team and we&rsquo;ll set you up directly.
        </p>
        <Link
          className="mt-5 inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          href="/contact"
        >
          Talk to us
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {config.currency ? (
        <p className="text-sm text-muted">
          Prices shown in{" "}
          <span className="font-semibold text-foreground">
            {config.currency}
          </span>
          {config.market ? ` — the currency we bill in ${config.market.name}` : null}.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const offer = findOffer(plan, "MONTH");
          const cta = resolvePlanCta(plan, "MONTH", 1);
          const highlight = highlightLabel(plan);
          const unitLabel = billingUnitLabel(offer);

          return (
            <article
              className={[
                "flex flex-col rounded-[24px] border bg-white p-5",
                highlight
                  ? "border-accent shadow-md ring-1 ring-accent-soft"
                  : "border-border shadow-sm",
              ].join(" ")}
              key={plan.id}
            >
              <div className="flex items-start justify-between gap-3">
                {/*
                  h3 under the section's h2, which is itself under the page h1.
                  The plans page uses h2 for the same card because there the
                  card is a top-level section; here it sits inside "Pricing
                  preview" and jumping back to h2 would skip nothing but read as
                  a new page section to anyone navigating by heading.
                */}
                <h3 className="text-lg font-semibold text-foreground">
                  {plan.name}
                </h3>
                {highlight ? (
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                    {highlight}
                  </span>
                ) : null}
              </div>

              {plan.description ? (
                <p className="mt-2 text-sm leading-6 text-muted">
                  {plan.description}
                </p>
              ) : null}

              <div className="mt-5 border-t border-border pt-5">
                {offer?.available ? (
                  <>
                    <p className="text-3xl font-semibold tracking-tight text-foreground">
                      {formatMoney(offer.unitAmount, offer.currency)}
                    </p>
                    {unitLabel ? (
                      <p className="mt-1 text-sm text-muted">{unitLabel}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-xl font-semibold text-foreground">
                      Pricing on request
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {cta.kind === "UNAVAILABLE"
                        ? cta.message
                        : "We'll put together pricing that fits your organization."}
                    </p>
                  </>
                )}
              </div>

              <div className="mt-5 flex-1" />

              {cta.kind === "UNAVAILABLE" ? (
                <Link
                  className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                  href={`/contact?plan=${encodeURIComponent(plan.key)}`}
                >
                  {cta.label}
                </Link>
              ) : (
                <Link
                  className={[
                    "inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition",
                    cta.kind === "SELF_SERVICE"
                      ? "bg-accent text-white hover:bg-accent-strong"
                      : "border border-border bg-white text-foreground hover:bg-surface-muted",
                  ].join(" ")}
                  href={cta.href}
                >
                  {cta.label}
                </Link>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
