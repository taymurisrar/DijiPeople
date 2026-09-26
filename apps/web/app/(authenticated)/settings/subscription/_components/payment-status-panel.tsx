"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Button } from "@/app/components/ui/button";

type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";

type PaymentView = {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  failureReason: "UNDER_REVIEW" | "NOT_COMPLETED" | null;
};

/** How long a returning buyer's page keeps asking before it stops. */
const POLL_INTERVAL_MS = 3_000;
const POLL_LIMIT = 40;

/**
 * The outcome of a hosted checkout, as the API reports it.
 *
 * The query string the provider sent the browser back with is never read as
 * the result — a redirect proves nothing. The API re-verifies a pending payment
 * with the provider on every request, so this settles as soon as the payment
 * does, whether or not the webhook has arrived.
 *
 * `cancelled` is the page the provider's cancel link lands on. It still asks:
 * a buyer can cancel one tab and pay in another.
 */
export function PaymentStatusPanel({
  paymentId,
  returnedFrom,
}: {
  paymentId: string;
  returnedFrom: "success" | "cancel";
}) {
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/billing/payments/${encodeURIComponent(paymentId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as PaymentView;
        if (!cancelled) {
          setPayment(next);
          setLoadFailed(false);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [paymentId, polls]);

  const settled = payment !== null && payment.status !== "PENDING";
  useEffect(() => {
    if (settled || polls >= POLL_LIMIT) return;
    const timer = setTimeout(
      () => setPolls((count) => count + 1),
      POLL_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [settled, polls]);

  if (loadFailed && !payment) {
    return (
      <Outcome
        tone="neutral"
        icon={<Clock3 className="h-10 w-10 text-muted" aria-hidden="true" />}
        title="Payment status unavailable"
        body="We could not load this payment. Check your subscription for its current state."
      />
    );
  }

  if (!payment) {
    return (
      <Outcome
        tone="neutral"
        icon={<Clock3 className="h-10 w-10 text-muted" aria-hidden="true" />}
        title="Processing payment"
        body="Confirming the payment with the payment provider."
      />
    );
  }

  const amount = new Intl.NumberFormat("en", {
    style: "currency",
    currency: payment.currency,
  }).format(payment.amount);

  if (payment.status === "SUCCEEDED") {
    return (
      <Outcome
        tone="good"
        icon={
          <CheckCircle2
            className="h-10 w-10 text-emerald-700"
            aria-hidden="true"
          />
        }
        title="Payment successful"
        body={`${amount} was received and your subscription is active.`}
      />
    );
  }

  if (payment.status === "REFUNDED") {
    return (
      <Outcome
        tone="neutral"
        icon={<XCircle className="h-10 w-10 text-muted" aria-hidden="true" />}
        title="Payment refunded"
        body={`${amount} was returned to your payment method.`}
      />
    );
  }

  if (payment.status === "FAILED") {
    return (
      <Outcome
        tone="warning"
        icon={
          <XCircle className="h-10 w-10 text-amber-700" aria-hidden="true" />
        }
        title={
          payment.failureReason === "UNDER_REVIEW"
            ? "Payment under review"
            : "Payment failed"
        }
        body={
          payment.failureReason === "UNDER_REVIEW"
            ? "The payment could not be matched to your invoice. Our billing team has been notified and will contact you."
            : "The payment was not completed and no subscription was activated."
        }
      />
    );
  }

  if (returnedFrom === "cancel") {
    return (
      <Outcome
        tone="neutral"
        icon={<XCircle className="h-10 w-10 text-muted" aria-hidden="true" />}
        title="Payment canceled"
        body="No payment was taken and no subscription was activated."
      />
    );
  }

  return (
    <Outcome
      tone="neutral"
      icon={<Clock3 className="h-10 w-10 text-muted" aria-hidden="true" />}
      title={polls >= POLL_LIMIT ? "Payment pending" : "Processing payment"}
      body={
        polls >= POLL_LIMIT
          ? "The payment provider has not confirmed this payment yet. Your subscription activates as soon as it does."
          : "Confirming the payment with the payment provider."
      }
    />
  );
}

function Outcome({
  tone,
  icon,
  title,
  body,
}: {
  tone: "good" | "warning" | "neutral";
  icon: ReactNode;
  title: string;
  body: string;
}) {
  const className =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : "border-border bg-surface";

  return (
    <section
      role="status"
      aria-live="polite"
      className={`rounded-[24px] border p-8 shadow-sm ${className}`}
    >
      {icon}
      <h2 className="mt-5 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          href="/settings/subscription/overview"
          variant="primary"
          leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        >
          Back to subscription
        </Button>
      </div>
    </section>
  );
}
