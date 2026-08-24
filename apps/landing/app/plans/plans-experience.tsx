"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { CheckIcon, FeatureIcon } from "../_components/marketing/feature-icon";
import type { CommercialConfigView } from "../../lib/commercial-config";
import {
  billingUnitLabel,
  buildComparisonMatrix,
  calculateAnnualSaving,
  estimateCost,
  findOffer,
  formatMoney,
  highlightLabel,
  incrementalFeatures,
  plansAreCumulative,
  resolvePlanCta,
  type BillingIntervalKey,
} from "../../lib/plan-presentation";

const TEAM_SIZE_PRESETS = [25, 50, 100];
const DEFAULT_TEAM_SIZE = 25;

export function PlansExperience({ config }: { config: CommercialConfigView }) {
  const [interval, setInterval] = useState<BillingIntervalKey>("MONTH");
  const [teamSize, setTeamSize] = useState<number>(DEFAULT_TEAM_SIZE);
  const [showComparison, setShowComparison] = useState(false);

  const teamSizeInputId = useId();
  const comparisonId = useId();

  const { plans, featureCatalog } = config;
  const comparison = useMemo(() => buildComparisonMatrix(config), [config]);
  const cumulative = useMemo(() => plansAreCumulative(plans), [plans]);

  /**
   * The plans the headcount estimator can actually say something about.
   *
   * A flat-priced plan costs the same for six people as for six hundred, so
   * listing it under an "Active employees" input states a relationship that
   * does not exist — and a plan with no offer in this region has no number at
   * all and rendered as "On request" beside three prices, which reads as a
   * fourth quote rather than as an absence.
   */
  const perSeatPlans = useMemo(
    () =>
      plans
        .map((plan) => ({ plan, offer: findOffer(plan, interval) }))
        .filter(
          (
            entry,
          ): entry is {
            plan: (typeof plans)[number];
            offer: NonNullable<ReturnType<typeof findOffer>>;
          } =>
            entry.offer?.available === true &&
            entry.offer.billingModel === "PER_SEAT",
        ),
    [plans, interval],
  );

  // Only offer an interval the backend actually publishes for some plan. A
  // toggle that switches to a period nothing is priced in reads as broken.
  const intervalsWithAnyPrice = useMemo(() => {
    return (["MONTH", "YEAR"] as BillingIntervalKey[]).filter((candidate) =>
      plans.some((plan) => findOffer(plan, candidate)?.available),
    );
  }, [plans]);

  const showToggle = intervalsWithAnyPrice.length > 1;

  if (plans.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-white px-5 py-8 text-center">
        <p className="text-base font-semibold text-foreground">
          Pricing isn&rsquo;t available for your region yet.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Get in touch and we&rsquo;ll set your organization up directly.
        </p>
        <Link
          className="mt-5 inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          href="/contact"
        >
          Contact us
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Billing interval + resolved currency */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {showToggle ? (
          <div
            aria-label="Billing period"
            className="inline-flex w-fit rounded-xl border border-border bg-white p-1"
            role="group"
          >
            {intervalsWithAnyPrice.map((candidate) => (
              <button
                aria-pressed={interval === candidate}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-semibold transition",
                  interval === candidate
                    ? "bg-foreground text-white"
                    : "text-muted hover:text-foreground",
                ].join(" ")}
                key={candidate}
                onClick={() => setInterval(candidate)}
                type="button"
              >
                {candidate === "MONTH" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}

        {config.currency ? (
          <p className="text-sm text-muted">
            Prices shown in{" "}
            <span className="font-semibold text-foreground">
              {config.currency}
            </span>
            {config.market ? ` for ${config.market.name}` : null}
          </p>
        ) : null}
      </div>

      {/* Plan cards */}
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const offer = findOffer(plan, interval);
          const cta = resolvePlanCta(plan, interval, teamSize);
          const highlight = highlightLabel(plan);
          const saving = calculateAnnualSaving(plan);
          const unitLabel = billingUnitLabel(offer);
          const adds = incrementalFeatures(plans, index, featureCatalog);

          return (
            <article
              className={[
                "flex flex-col rounded-[24px] border bg-white p-6",
                highlight
                  ? "border-accent shadow-md ring-1 ring-accent-soft"
                  : "border-border shadow-sm",
              ].join(" ")}
              key={plan.id}
            >
              <div className="flex items-start justify-between gap-3">
                {/*
                  h2, not h3: each plan card is a top-level section of this page,
                  a peer of "Estimate your cost" and "Compare plans in detail".
                  As an h3 directly under the page h1 it skipped a level, which
                  is what a screen-reader user navigating by heading hears as a
                  missing section.
                */}
                <h2 className="text-lg font-semibold text-foreground">
                  {plan.name}
                </h2>
                {highlight ? (
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                    {highlight}
                  </span>
                ) : null}
              </div>

              {plan.description ? (
                <p className="mt-2 min-h-[2.75rem] text-sm leading-6 text-muted">
                  {plan.description}
                </p>
              ) : null}

              {/* Price */}
              <div className="mt-5 border-t border-border pt-5">
                {offer?.available ? (
                  <>
                    <p className="text-3xl font-semibold tracking-tight text-foreground">
                      {formatMoney(offer.unitAmount, offer.currency)}
                    </p>
                    {unitLabel ? (
                      <p className="mt-1 text-sm text-muted">{unitLabel}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-soft">
                      Billed {interval === "MONTH" ? "monthly" : "annually"}
                    </p>
                    {interval === "YEAR" && saving ? (
                      <p className="mt-2 inline-flex rounded-lg bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                        Save {saving.percent}% versus monthly
                      </p>
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

              {/* CTA */}
              <div className="mt-5">
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
              </div>

              {/* Included capabilities */}
              <div className="mt-6 flex-1 border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-soft">
                  {index === 0 || !cumulative
                    ? "Includes"
                    : `Everything in ${plans[index - 1].name}, plus`}
                </p>
                <ul className="mt-3 space-y-2">
                  {adds.length > 0 ? (
                    adds.map((label) => (
                      <li
                        className="flex items-start gap-2 text-sm text-muted"
                        key={label}
                      >
                        <span className="mt-0.5 text-accent">
                          <CheckIcon />
                        </span>
                        {label}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted">
                      Same capabilities as {plans[index - 1]?.name ?? "below"}.
                    </li>
                  )}
                </ul>
              </div>
            </article>
          );
        })}
      </div>

      {/* Estimator */}
      <section className="rounded-[24px] border border-border bg-surface-muted p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Estimate your cost
        </h2>
        {/*
          Per-seat plans only.
          A cost estimator that lists flat-priced plans is showing numbers the
          input above it cannot change — the section read "Each plan is one flat
          price, whatever your headcount" above an "Active employees" field and
          four prices that never moved. Flat plans have one price and it is on
          the card above; repeating it here under a headcount control implies a
          relationship that does not exist.
        */}
        <p className="mt-1 text-sm leading-6 text-muted">
          {perSeatPlans.length > 0
            ? "These plans are billed per active employee, and each has a minimum number of seats you are billed for even with a smaller team. Enter roughly how many people you employ — every estimate below shows the seats it is charging and the rate per seat, so you can see how the figure is reached."
            : "No per-seat plan is available in your region yet, so there is nothing to estimate here. Get in touch and we will price it with you directly."}
        </p>

        {perSeatPlans.length > 0 ? (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div
                aria-label="Team size presets"
                className="inline-flex rounded-xl border border-border bg-white p-1"
                role="group"
              >
                {TEAM_SIZE_PRESETS.map((preset) => (
                  <button
                    aria-pressed={teamSize === preset}
                    className={[
                      "rounded-lg px-3 py-2 text-sm font-semibold transition",
                      teamSize === preset
                        ? "bg-foreground text-white"
                        : "text-muted hover:text-foreground",
                    ].join(" ")}
                    key={preset}
                    onClick={() => setTeamSize(preset)}
                    type="button"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div>
                <label
                  className="block text-xs font-semibold text-muted"
                  htmlFor={teamSizeInputId}
                >
                  Active employees
                </label>
                <input
                  className="mt-1 w-32 rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                  id={teamSizeInputId}
                  inputMode="numeric"
                  min={1}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    setTeamSize(
                      Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                    );
                  }}
                  type="number"
                  value={teamSize}
                />
              </div>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              {perSeatPlans.map(({ plan, offer }) => {
                const estimate = estimateCost(offer, teamSize);
                return (
                  <div
                    className="rounded-2xl border border-border bg-white p-4"
                    key={plan.id}
                  >
                    <dt className="text-sm font-semibold text-foreground">
                      {plan.name}
                    </dt>
                    {/*
                  The qualifier belongs inside the <dd>: a <div> grouping inside
                  a <dl> may contain only <dt>/<dd>, so a sibling <p> here made
                  the list structurally invalid. It only became visible once
                  seeded pricing existed to render — with an empty plan list the
                  <dl> had no children and nothing flagged it.
                */}
                    <dd className="mt-1 text-lg font-semibold text-foreground">
                      {estimate
                        ? formatMoney(estimate.total, estimate.currency)
                        : "On request"}
                      {/*
                        `offer.available` is redundant at runtime — `estimate`
                        is non-null only when it is true — but the compiler
                        cannot see that through `estimateCost`, and an
                        unavailable offer carries no `unitAmount` to show. The
                        alternative was deriving the rate as `total / billable`,
                        which would be a second calculation of a number the
                        server already sent.
                      */}
                      {estimate && offer.available ? (
                        <>
                          <span className="mt-1 block text-xs font-normal text-muted">
                            estimated{" "}
                            {interval === "MONTH" ? "per month" : "per year"}
                          </span>
                          {/*
                            Show the arithmetic, not only its answer.

                            The card read "QAR 80 · below this plan's minimum"
                            for a one-person company and left the reader to work
                            out where 80 came from — the number they typed was
                            1, and nothing on screen multiplied to 80. A minimum
                            commitment that is *billed* has to appear as a
                            quantity, or the estimate reads as wrong rather than
                            as explained.

                            `estimate.billable` is the seat count actually
                            charged — `max(teamSize, minimumSeats, 1)`, the same
                            expression the server bills on. This line restates
                            the server's arithmetic; it does not perform its
                            own, which is the mistake BUG-0080 was found through.
                          */}
                          <span className="mt-1 block text-xs font-normal leading-5 text-muted">
                            {estimate.billable} seat
                            {estimate.billable === 1 ? "" : "s"}
                            {estimate.belowMinimum
                              ? ` (this plan's minimum, not your ${teamSize})`
                              : ""}{" "}
                            × {formatMoney(offer.unitAmount, offer.currency)}{" "}
                            each
                          </span>
                          {estimate.aboveMaximum ? (
                            <span className="mt-1 block text-xs font-normal leading-5 text-muted">
                              Above the self-service maximum — talk to us and
                              we&rsquo;ll price it with you.
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        ) : null}
      </section>

      {/* Comparison */}
      {comparison.length > 0 ? (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-2xl text-foreground">
              Compare plans in detail
            </h2>
            <button
              aria-controls={comparisonId}
              aria-expanded={showComparison}
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
              onClick={() => setShowComparison((open) => !open)}
              type="button"
            >
              {showComparison ? "Hide comparison" : "Show comparison"}
            </button>
          </div>

          {showComparison ? (
            <div className="mt-5 space-y-6" id={comparisonId}>
              {comparison.map((group) => (
                <div key={group.key}>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-soft">
                    {group.label}
                  </h3>
                  {/* Scrolls inside itself so the page never scrolls sideways. */}
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                      <caption className="sr-only">
                        {group.label} capabilities included in each plan
                      </caption>
                      <thead>
                        <tr className="border-b border-border">
                          <th
                            className="py-2 pr-4 font-semibold text-foreground"
                            scope="col"
                          >
                            Capability
                          </th>
                          {plans.map((plan) => (
                            <th
                              className="w-24 py-2 text-center font-semibold text-foreground"
                              key={plan.id}
                              scope="col"
                            >
                              {plan.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr
                            className="border-b border-border/60"
                            key={row.key}
                          >
                            <th
                              className="py-2 pr-4 font-normal text-muted"
                              scope="row"
                            >
                              <span className="font-medium text-foreground">
                                {row.label}
                              </span>
                              <span className="block text-xs text-muted">
                                {row.description}
                              </span>
                            </th>
                            {row.included.map((included, planIndex) => (
                              <td
                                className="py-2 text-center"
                                key={plans[planIndex].id}
                              >
                                {/* Text, not colour alone, carries the meaning. */}
                                <span className="sr-only">
                                  {included ? "Included" : "Not included"}
                                </span>
                                {included ? (
                                  <span
                                    aria-hidden="true"
                                    className="inline-flex text-accent"
                                  >
                                    <CheckIcon />
                                  </span>
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="text-muted-soft"
                                  >
                                    &mdash;
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Feature catalogue legend — what the categories mean */}
      {featureCatalog.length > 0 ? (
        <section className="rounded-[24px] border border-border bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">
            What&rsquo;s in the platform
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureCatalog.map((feature) => (
              <div className="flex gap-3" key={feature.key}>
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <FeatureIcon className="h-4 w-4" name={feature.icon} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {feature.label}
                  </p>
                  <p className="text-xs leading-5 text-muted">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
