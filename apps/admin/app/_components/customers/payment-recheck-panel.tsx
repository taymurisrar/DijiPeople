"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  CreditCard,
  Info,
  LoaderCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Outcome =
  | "CONFIRMED"
  | "ALREADY_CONFIRMED"
  | "AWAITING_CUSTOMER"
  | "PAYMENT_FAILED"
  | "EXPIRED"
  | "PROCESSING"
  | "NO_SESSION";

type RecheckResult = {
  orderNumber?: string;
  previousStatus?: string;
  outcome: Outcome;
  summary: string;
  customerMessage: string;
  providerDetail: string | null;
  advanced: boolean;
  retryable: boolean;
};

/**
 * What Stripe says about this customer's payment, and what to tell them.
 *
 * The operator running this is usually mid-reply to somebody who has been
 * watching "We're confirming your payment" for twenty minutes, so the result is
 * laid out in the order they need it: what happened, then the sentence to send,
 * then — separately, and never mixed into that sentence — the provider's own
 * words for the operator's own understanding.
 *
 * The customer message is copyable because the alternative is retyping it, and
 * a retyped message is one where "nothing has been charged" quietly becomes
 * something less reassuring.
 */
export function PaymentRecheckPanel({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName?: string;
}) {
  const [result, setResult] = useState<RecheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function recheck() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/super-admin/customers/${encodeURIComponent(customerId)}/recheck-payment`,
          { method: "POST" },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setResult(null);
          setError(
            payload?.message ??
              "Stripe could not be reached. The payment state is unchanged.",
          );
          return;
        }
        setResult(payload as RecheckResult);
      } catch (reason) {
        setResult(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "Stripe could not be reached. The payment state is unchanged.",
        );
      }
    });
  }

  async function copyMessage() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.customerMessage);
      setCopied(true);
    } catch {
      // A clipboard the browser refused is not worth an error state — the text
      // is on screen and selectable.
      setCopied(false);
    }
  }

  const tone = result ? OUTCOME_TONES[result.outcome] : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-slate-500" aria-hidden />
            <h2 className="text-lg font-semibold text-slate-950">Payment</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Payment is confirmed by a signed Stripe webhook, never by the
            browser returning from checkout. If one did not arrive, ask Stripe
            directly — this advances the order only if Stripe says it was paid.
          </p>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={isPending}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Re-check payment with Stripe
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}

      {result && tone ? (
        <div className="mt-4 space-y-3">
          <div
            className={`rounded-xl border px-4 py-3 ${tone.container}`}
            role="status"
          >
            <div className="flex items-start gap-2">
              <tone.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{tone.label}</p>
                <p className="mt-1 text-sm leading-6">{result.summary}</p>
                {result.orderNumber ? (
                  <p className="mt-1 text-xs opacity-80">
                    Order {result.orderNumber}
                    {result.previousStatus
                      ? ` · was ${humanize(result.previousStatus)}`
                      : ""}
                    {result.advanced ? " · now marked paid" : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                What to tell {customerName?.trim() || "the customer"}
              </p>
              <button
                type="button"
                onClick={copyMessage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-800">
              {result.customerMessage}
            </p>
          </div>

          {result.providerDetail ? (
            <details className="rounded-xl border border-slate-200 px-4 py-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Stripe&apos;s own words — for you, not the customer
              </summary>
              <p className="mt-2 break-words font-mono text-xs text-slate-700">
                {result.providerDetail}
              </p>
            </details>
          ) : null}

          {result.retryable ? (
            <p className="text-xs text-slate-500">
              Checking again later can change this answer.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Tone carries text, never colour alone — a red panel and an amber one say the
 * same thing to somebody who cannot tell them apart, so each states its own
 * verdict in words.
 */
const OUTCOME_TONES: Record<
  Outcome,
  { label: string; container: string; icon: LucideIcon }
> = {
  CONFIRMED: {
    label: "Paid — order advanced",
    container: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: CheckCircle2,
  },
  ALREADY_CONFIRMED: {
    label: "Paid — already recorded",
    container: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: CheckCircle2,
  },
  AWAITING_CUSTOMER: {
    label: "Not paid yet",
    container: "border-sky-200 bg-sky-50 text-sky-900",
    icon: Info,
  },
  PAYMENT_FAILED: {
    label: "Payment declined",
    container: "border-rose-200 bg-rose-50 text-rose-900",
    icon: AlertTriangle,
  },
  EXPIRED: {
    label: "Checkout expired",
    container: "border-amber-200 bg-amber-50 text-amber-900",
    icon: Clock3,
  },
  PROCESSING: {
    label: "Still processing",
    container: "border-sky-200 bg-sky-50 text-sky-900",
    icon: Clock3,
  },
  NO_SESSION: {
    label: "No payment was ever started",
    container: "border-slate-200 bg-slate-50 text-slate-800",
    icon: Info,
  },
};

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
