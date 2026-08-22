"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { LegalIndexEntry } from "../../lib/legal-server";
import {
  BillingCycle,
  PublicPlan,
  checkoutBlock,
  findPlanPrice,
  formatPlanPrice,
} from "../../lib/plans";
import {
  buildSubmitPayload,
  describeSlugProblem,
  emptyWizardForm,
  missingFieldsForStep,
  STEP_LABELS,
  STEP_TITLES,
  suggestSlug,
  WIZARD_STEPS,
  type WizardForm,
  type WizardStep,
} from "../../lib/onboarding-wizard";
import { readReferralCode } from "../../lib/referral";
import {
  resolveSubscribeSelection,
  type SubscribeSelectionParams,
} from "../../lib/subscribe-selection";
import {
  AgreementsStep,
  OrganizationStep,
  OwnerStep,
  ReviewStep,
  WorkspaceStep,
  type SlugState,
} from "./onboarding-steps";

/**
 * `buildSubmitPayload` with the remembered referral code attached.
 *
 * A wrapper rather than a change to the builder, so the builder stays a pure
 * function of the form and its tests need no browser. The code is read at
 * submit time from `lib/referral`, which captured it wherever the partner's
 * link happened to land. BUG-0281.
 */
function buildSubmitPayloadWithReferral(
  form: Parameters<typeof buildSubmitPayload>[0],
  selection: Parameters<typeof buildSubmitPayload>[1],
) {
  return buildSubmitPayload(form, selection, readReferralCode());
}

/**
 * The public onboarding wizard.
 *
 * This component owns *flow* — which step, what is allowed next, what is
 * submitted. The fields live in `onboarding-steps.tsx` and the rules in
 * `lib/onboarding-wizard.ts`, which is where they can be tested without a
 * browser.
 *
 * Two things here are load-bearing and easy to mistake for incidental:
 *
 * 1. **A draft order is opened before the workspace step**, because the
 *    address check is session-bound — the API will not answer "is maseer free"
 *    to a caller with no live order, which is what stops it being used to map
 *    DijiPeople's customer base.
 * 2. **Submitting does not go to Stripe.** The first submission returns an
 *    onboarding id and mails a verification code; the same submission repeated
 *    after verification returns the checkout URL. Nobody is charged for a
 *    workspace whose administrator address was a typo.
 */
export function SubscribeForm({
  plans,
  defaultCurrency,
  error,
  selectionParams,
  agreements,
  tenantBaseDomain,
}: {
  plans: PublicPlan[];
  defaultCurrency: string;
  error?: string;
  selectionParams?: SubscribeSelectionParams;
  agreements: LegalIndexEntry[];
  tenantBaseDomain: string;
}) {
  const initialSelection = resolveSubscribeSelection(
    plans,
    selectionParams,
    defaultCurrency,
  );
  const [planId, setPlanId] = useState(initialSelection.planId);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    initialSelection.billingCycle,
  );
  /*
   * The market's currency, not the selection's.
   *
   * This read `initialSelection.currency || defaultCurrency`, which inverted
   * the authority: `/public/plans` is not market-scoped and returns its prices
   * ordered by currency ascending, so the selection's currency was whichever
   * one sorted first — QAR ahead of USD. Checkout then quoted a currency the
   * home and plans pages, which read the market, did not. `defaultCurrency` is
   * that market currency, resolved server-side from published configuration,
   * and `resolveSubscribeSelection` now narrows to it rather than competing
   * with it.
   */
  const currency = defaultCurrency || initialSelection.currency;
  const [seatQuantity, setSeatQuantity] = useState(
    initialSelection.seatQuantity,
  );

  const [form, setForm] = useState<WizardForm>(emptyWizardForm());
  const [step, setStep] = useState<WizardStep>("organization");
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState("");

  const selectedPlan =
    plans.find((plan) => plan.id === planId) ?? plans[0] ?? null;
  const selectedPrice = selectedPlan
    ? findPlanPrice(selectedPlan, currency, billingCycle)
    : null;
  // One decision, three consumers: the notice, the form and Continue.
  const block = checkoutBlock(selectedPrice);
  const canCheckout = block === null;
  const minimumSeats = selectedPrice?.minimumSeats ?? 1;
  const maximumSeats = selectedPrice?.maximumSeats ?? null;
  const effectiveSeatQuantity = Math.max(
    minimumSeats,
    maximumSeats === null ? seatQuantity : Math.min(seatQuantity, maximumSeats),
  );

  // Only agreements that name a published version can be accepted; one that
  // cannot say which text was agreed to is not evidence.
  const acceptableAgreements = agreements.filter((entry) => entry.versionId);
  const requiredAgreementIds = acceptableAgreements.map(
    (entry) => entry.versionId as string,
  );

  const missing = missingFieldsForStep(step, form, requiredAgreementIds);
  const stepIndex = WIZARD_STEPS.indexOf(step);

  /*
   * The draft's inputs as plain values, so the availability effect below
   * depends on primitives rather than on objects whose identity changes every
   * render. The placeholder email exists because a draft is opened before the
   * owner step — it is replaced by the real address at submit, when `openOrder`
   * resolves the same customer.
   */
  const priceIdForDraft = selectedPrice?.id ?? null;
  const seatsForDraft = effectiveSeatQuantity;
  const companyNameForDraft = form.companyName.trim();
  const countryForDraft = form.country.trim();
  const emailForDraft = form.email.trim() || "pending@onboarding.invalid";

  function set(patch: Partial<WizardForm>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      /*
       * Prefill the workspace address from the company name, but only while the
       * buyer has not touched it. Overwriting an address they typed because
       * they later corrected a typo in the company name would be maddening.
       */
      if (patch.companyName !== undefined && !current.requestedSlug) {
        next.requestedSlug = suggestSlug(patch.companyName);
      }
      return next;
    });
    setStatus(null);
  }

  /*
   * The availability answer, keyed to the address it is about.
   *
   * Keeping the *subject* alongside the *verdict* is what lets "checking" be
   * derived rather than set: if the buyer has typed past the last answer, the
   * answer is stale by definition and the UI says so without an effect having
   * to announce it. Setting that state synchronously inside the effect is both
   * a lint error and a cascading render.
   */
  const [slugAnswer, setSlugAnswer] = useState<{
    slug: string;
    verdict: "available" | "taken" | "unknown";
  } | null>(null);

  const currentSlug = form.requestedSlug.trim().toLowerCase();
  const slugFormatProblem = currentSlug
    ? describeSlugProblem(currentSlug)
    : "blank";

  const slugState: SlugState = slugFormatProblem
    ? { kind: "idle" }
    : slugAnswer?.slug === currentSlug
      ? { kind: slugAnswer.verdict }
      : { kind: "checking" };

  /*
   * Debounced, and deliberately not per keystroke: each check is a rate-limited
   * API call, and a buyer typing "maseer" would otherwise spend six of their
   * budget asking about "m", "ma", "mas"…
   *
   * The draft is opened here rather than in a memoised callback so this effect
   * depends only on values, not on a function identity — which is what the
   * React Compiler needs to reason about it.
   */
  const onboardingIdRef = useRef<string | null>(null);
  const slugRequestRef = useRef(0);

  useEffect(() => {
    if (step !== "workspace") return;
    if (!currentSlug || describeSlugProblem(currentSlug)) return;
    if (slugAnswer?.slug === currentSlug) return;
    if (!priceIdForDraft) return;

    const requestId = ++slugRequestRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        const answer = (verdict: "available" | "taken" | "unknown") => {
          // A stale response must never overwrite a newer one — the buyer who
          // typed on would otherwise see an answer about a name they left.
          if (slugRequestRef.current === requestId) {
            setSlugAnswer({ slug: currentSlug, verdict });
          }
        };

        try {
          if (!onboardingIdRef.current) {
            const draft = await fetch("/api/public/onboarding", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                planPriceId: priceIdForDraft,
                seatQuantity: seatsForDraft,
                companyName: companyNameForDraft,
                contactName: companyNameForDraft,
                email: emailForDraft,
                country: countryForDraft,
                // Carried from the very first draft, so a buyer who abandons at
                // the payment step and returns is still attributed. BUG-0281.
                referralCode: readReferralCode(),
              }),
            });
            if (!draft.ok) return answer("unknown");
            const payload = (await draft.json()) as { onboardingId?: string };
            if (!payload.onboardingId) return answer("unknown");
            onboardingIdRef.current = payload.onboardingId;
            setOnboardingId(payload.onboardingId);
          }

          const response = await fetch(
            `/api/public/onboarding/${onboardingIdRef.current}/workspace-address?value=${encodeURIComponent(currentSlug)}`,
          );
          if (!response.ok) return answer("unknown");
          const payload = (await response.json()) as { available?: boolean };
          return answer(payload.available ? "available" : "taken");
        } catch {
          // A check we could not run is not a reason to block the buyer. The
          // server decides at submit either way.
          return answer("unknown");
        }
      })();
    }, 450);

    return () => clearTimeout(timer);
  }, [
    step,
    currentSlug,
    slugAnswer,
    priceIdForDraft,
    seatsForDraft,
    companyNameForDraft,
    emailForDraft,
    countryForDraft,
  ]);

  function goTo(next: WizardStep) {
    setShowErrors(false);
    setStatus(null);
    setStep(next);
  }

  function goNext() {
    if (missing.length) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    goTo(WIZARD_STEPS[Math.min(stepIndex + 1, WIZARD_STEPS.length - 1)]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPrice || !canCheckout) {
      /*
       * `checkoutBlock` owns both of these sentences, and this branch used to
       * write its own — including "This price is visible but not connected to
       * Stripe checkout yet", which names our billing processor and describes a
       * misconfiguration the visitor can do nothing about. This file argues at
       * length a few hundred lines below that a buyer must never be shown that,
       * and then showed it here.
       */
      setStatus(
        (block ?? checkoutBlock(selectedPrice))?.message ??
          "We can't start checkout for this selection. Please get in touch and we'll sort it out.",
      );
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const response = await fetch("/api/public/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildSubmitPayloadWithReferral(form, {
          planPriceId: selectedPrice.id,
          seatQuantity: effectiveSeatQuantity,
        }),
      ),
    });
    const payload = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok) {
      setStatus(payload?.message ?? "We couldn't open the payment page. Please try again in a moment.");
      return;
    }

    if (payload?.verificationRequired) {
      setOnboardingId(payload.onboardingId as string);
      setAwaitingCode(true);
      return;
    }

    if (!payload?.url) {
      setStatus(payload?.message ?? "We couldn't open the payment page. Please try again in a moment.");
      return;
    }

    window.location.assign(payload.url);
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onboardingId || !selectedPrice) return;

    setIsSubmitting(true);
    setStatus(null);

    const verification = await fetch(
      `/api/public/onboarding/${onboardingId}/verify-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      },
    );
    const verificationPayload = await verification.json().catch(() => null);

    if (!verification.ok) {
      setIsSubmitting(false);
      setStatus(verificationPayload?.message ?? "That code is not correct.");
      return;
    }

    /*
     * Verified, so the original submission is now permitted. Reusing the same
     * endpoint rather than adding a "resume checkout" one keeps a single path
     * to a Stripe session — which is what stops an unverified caller finding a
     * second way in.
     */
    const checkout = await fetch("/api/public/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildSubmitPayloadWithReferral(form, {
          planPriceId: selectedPrice.id,
          seatQuantity: effectiveSeatQuantity,
        }),
      ),
    });
    const checkoutPayload = await checkout.json().catch(() => null);
    setIsSubmitting(false);

    if (!checkout.ok || !checkoutPayload?.url) {
      setStatus(checkoutPayload?.message ?? "We couldn't open the payment page. Please try again in a moment.");
      return;
    }

    window.location.assign(checkoutPayload.url);
  }

  async function resendCode() {
    if (!onboardingId) return;
    setStatus(null);
    const response = await fetch(
      `/api/public/onboarding/${onboardingId}/verification-code`,
      { method: "POST" },
    );
    // The same message either way. Saying whether a code was actually sent
    // would confirm whether that address is mid-purchase.
    setStatus(
      response.ok
        ? "If that address needs a new code, one is on its way."
        : "Unable to send a new code right now.",
    );
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

  if (awaitingCode) {
    return (
      <form
        className="max-w-xl rounded-[24px] border border-border bg-white p-6 shadow-sm"
        onSubmit={verifyCode}
      >
        <h2 className="text-xl font-semibold text-foreground">
          Confirm your email
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          We sent a six-digit code to{" "}
          <strong className="text-foreground">{form.email}</strong>. Entering it
          confirms the address your workspace administrator will sign in with.
          Nothing has been charged yet.
        </p>

        <label
          className="mt-5 block text-sm font-medium text-foreground"
          htmlFor="verification-code"
        >
          Verification code
          <input
            aria-describedby="verification-code-hint"
            autoComplete="one-time-code"
            className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-lg tracking-[0.4em]"
            id="verification-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value)}
            pattern="[0-9]*"
            required
            value={code}
          />
        </label>
        <p className="mt-2 text-xs text-muted" id="verification-code-hint">
          The code expires 15 minutes after it was sent.
        </p>

        {status ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {status}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isSubmitting || code.length !== 6}
            type="submit"
          >
            {isSubmitting ? "Confirming…" : "Confirm and continue to payment"}
          </button>
          <button
            className="text-sm font-medium text-accent underline"
            onClick={() => void resendCode()}
            type="button"
          >
            Send a new code
          </button>
        </div>
      </form>
    );
  }

  const stepProps = {
    form,
    set,
    missing: showErrors ? missing : [],
    tenantBaseDomain,
    slugState,
    agreements: acceptableAgreements,
  };

  return (
    <form className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]" onSubmit={submit}>
      <section className="rounded-[24px] border border-border bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
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
          {/*
            A short status line here; the full reason moved next to the form.

            The reason has to live where the consequence is. This paragraph
            carried the whole explanation, in the left-hand plan card, while the
            fields it explains are in the right-hand column — so the form read
            as locked for no stated reason and was asked about directly. Keeping
            a line here is still right: the price above it is the thing that
            cannot be bought.
          */}
          {block ? (
            <p className="mt-2 text-xs font-medium text-warning">
              Not available to buy online ({block.code}).
            </p>
          ) : null}
        </div>
        {selectedPrice?.billingModel === "PER_SEAT" ? (
          <label className="mt-4 block text-sm font-medium text-foreground">
            Purchased seats
            <input
              className="mt-2 w-full rounded-xl border border-border px-3 py-2"
              max={selectedPrice.maximumSeats ?? undefined}
              min={selectedPrice.minimumSeats ?? 1}
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
              type="number"
              value={effectiveSeatQuantity}
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
        {/*
          The progress indicator.
          An ordered list, so a screen reader announces position and length, and
          each reachable step is a real button — going back to fix something is
          the most common thing anybody does in a wizard, and the five equal
          pills this replaces gave no sense of how far along you were or how
          much was left.

          Three states, and each is distinguishable without colour: a completed
          step carries a tick, the current one is filled and labelled, and an
          unreached one is outlined and inert. A wizard where progress is
          conveyed by shade alone is one that reads as five identical buttons to
          anybody who cannot see the shade.
        */}
        <ol
          aria-label="Onboarding steps"
          className="flex items-start gap-1 sm:gap-0"
        >
          {WIZARD_STEPS.map((candidate, index) => {
            const isCurrent = candidate === step;
            const isPast = index < stepIndex;
            const isReachable = isPast || isCurrent;
            return (
              <li
                className="flex min-w-0 flex-1 items-start last:flex-none"
                key={candidate}
              >
                <button
                  aria-current={isCurrent ? "step" : undefined}
                  /*
                   * The label sits *under* the marker rather than beside it.
                   * Five labels in a row across a 700px column is what forced
                   * the truncation; stacked, each one gets the full width of
                   * its own segment and no label is ever cut.
                   */
                  className={`group flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 pb-1 pt-0.5 transition sm:w-20 ${
                    isReachable
                      ? "cursor-pointer hover:bg-surface-muted"
                      : "cursor-default"
                  }`}
                  disabled={!isReachable}
                  onClick={() => goTo(candidate)}
                  type="button"
                >
                  <span
                    aria-hidden
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${
                      isCurrent
                        ? "bg-accent text-white ring-4 ring-accent/15"
                        : isPast
                          ? "bg-accent text-white"
                          : "border border-border bg-white text-muted"
                    }`}
                  >
                    {isPast ? "\u2713" : index + 1}
                  </span>
                  <span
                    className={`text-center text-[11px] leading-tight ${
                      isCurrent
                        ? "font-semibold text-foreground"
                        : isPast
                          ? "font-medium text-foreground"
                          : "text-muted"
                    }`}
                  >
                    {STEP_LABELS[candidate]}
                  </span>
                  {/* Announced, never drawn: the tick and the fill are visual. */}
                  <span className="sr-only">
                    {isPast
                      ? " (completed)"
                      : isCurrent
                        ? " (current step)"
                        : " (not yet reached)"}
                  </span>
                </button>
                {index < WIZARD_STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    /*
                     * `mt-3.5` centres the connector on the 28px marker rather
                     * than on the button, whose height now includes the label.
                     */
                    className={`mt-3.5 h-0.5 flex-1 rounded-full ${
                      isPast ? "bg-accent" : "bg-border"
                    }`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">
            {STEP_TITLES[step]}
          </h2>
          {/*
            "Step 2 of 5" in words. The indicator above shows it graphically;
            this is the version somebody skims, and the one that survives a
            narrow viewport where the row collapses.
          */}
          <p className="text-xs font-medium text-muted">
            Step {stepIndex + 1} of {WIZARD_STEPS.length}
          </p>
        </div>

        {/*
          Unavailable: say so, quote a code, and render no form at all.

          The form was disabled and left on screen, which is defensible and was
          not what anybody wanted: a page of dead inputs invites a visitor to
          read them, wonder which one is the problem, and try. Removing it
          entirely is a smaller thing to explain — there is nothing to fill in,
          and the only two live controls left are the plan and billing selectors
          above, which are exactly what a visitor should reach for next.

          The code is the part that makes the sentence useful. A visitor cannot
          act on "your Stripe price is unverified" and should not be shown it;
          they can quote `DP-CHK-01`, and it resolves for us to the plan price
          whose full readiness list is on the console. Deliberately coarse — see
          `CHECKOUT_BLOCK_CODES` — because a code fine enough to name the exact
          misconfiguration would leak it.

          This element keeps `subscribe-unavailable-notice` and is the only one
          that does; the plan card's line is id-less, because the BUG-0066
          journey asserts a single visible notice and a duplicate id is a
          strict-mode violation rather than twice the clarity.
        */}
        {block ? (
          <div
            className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-5"
            id="subscribe-unavailable-notice"
            role="status"
          >
            <p className="text-base font-semibold text-foreground">
              This form is not available for the plan you have selected{" "}
              <span className="font-mono text-sm font-semibold text-muted">
                ({block.code})
              </span>
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">{block.message}</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              The plan, billing cycle and currency on the left stay live —
              choosing a plan that is available brings the form straight back.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                className="inline-flex items-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
                href={`/contact?ref=${encodeURIComponent(block.code)}`}
              >
                Ask us to arrange this plan
              </a>
              <a
                className="inline-flex items-center rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                href="/plans"
              >
                See all plans
              </a>
            </div>
            <p className="mt-3 text-xs text-muted">
              Quote {block.code} if you get in touch and we will know exactly
              which plan and region you were looking at.
            </p>
          </div>
        ) : (
          /*
            BUG-0066: never present an editable form that cannot be submitted.

            The fieldset stays even though the branch above now removes the form
            when checkout is blocked. It is one wrapper that cannot be forgotten
            by the next step somebody adds, and it costs nothing — the two
            guards agree, and the cheap one is the one that survives a future
            edit to the branch above.
          */
          <fieldset className="mt-4 border-0 p-0">
            {step === "organization" ? (
              <OrganizationStep {...stepProps} />
            ) : null}
            {step === "workspace" ? <WorkspaceStep {...stepProps} /> : null}
            {step === "owner" ? <OwnerStep {...stepProps} /> : null}
            {step === "agreements" ? <AgreementsStep {...stepProps} /> : null}
            {step === "review" ? (
              <ReviewStep {...stepProps} goTo={goTo} />
            ) : null}
          </fieldset>
        )}

        {/*
          The honeypot. Hidden from people and from assistive technology, so
          only something filling every field it finds will fill it.
        */}
        <input
          aria-hidden="true"
          autoComplete="off"
          className="hidden"
          name="website"
          onChange={() => undefined}
          tabIndex={-1}
          value=""
        />

        {status ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {status}
          </p>
        ) : null}

        {showErrors && missing.length ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            Please complete the highlighted fields before continuing.
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            className="text-sm font-medium text-accent underline disabled:opacity-40 disabled:no-underline"
            disabled={stepIndex === 0}
            onClick={() => goTo(WIZARD_STEPS[Math.max(stepIndex - 1, 0)])}
            type="button"
          >
            Back
          </button>

          {step === "review" ? (
            <button
              className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSubmitting || !canCheckout}
              type="submit"
            >
              {isSubmitting ? "Submitting…" : "Confirm and verify email"}
            </button>
          ) : (
            <button
              // Disabled for the same reason the fieldset is: advancing collects
              // more of somebody's time towards a submit button that cannot fire.
              className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={!canCheckout}
              onClick={goNext}
              type="button"
            >
              Continue
            </button>
          )}
        </div>
      </section>
    </form>
  );
}
