"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Instructions = {
  bankName: string;
  accountTitle: string;
  accountNumber: string | null;
  iban: string | null;
  raastId: string | null;
  currency: string;
  paymentInstructions: string | null;
  receiptContactEmail: string | null;
  receiptContactPhone: string | null;
};

type InvoiceState =
  | "AWAITING_PAYMENT"
  | "PENDING_VERIFICATION"
  | "CLARIFICATION_REQUESTED"
  | "REJECTED"
  | "PAID"
  | "EXPIRED"
  | "CANCELLED";

type Invoice = {
  orderId: string;
  orderNumber: string;
  invoiceNumber: string;
  reference: string;
  amount: string;
  subtotal: string;
  discount: string;
  tax: string;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  state: InvoiceState;
  claim: {
    status: string;
    clarificationRequest: string | null;
    decisionReason: string | null;
  } | null;
  instructions: Instructions;
};

const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;

const STATE_COPY: Record<InvoiceState, { title: string; body: string }> = {
  AWAITING_PAYMENT: {
    title: "Awaiting your transfer",
    body: "Transfer the exact amount below and quote the payment reference. Then tell us you have paid.",
  },
  PENDING_VERIFICATION: {
    title: "Pending verification",
    body: "We have your payment report. A member of our team will confirm the funds in our bank account. Your subscription starts only after that - a receipt alone does not activate it.",
  },
  CLARIFICATION_REQUESTED: {
    title: "We need more information",
    body: "Please answer our question below and submit your payment details again.",
  },
  REJECTED: {
    title: "We could not verify this payment",
    body: "You can submit the details again if you believe this is a mistake.",
  },
  PAID: {
    title: "Payment confirmed",
    body: "Thank you - we have verified your transfer. Your workspace is being prepared.",
  },
  EXPIRED: {
    title: "This invoice has expired",
    body: "Do not send money for this invoice. Start a new order, or contact us if you already paid.",
  },
  CANCELLED: {
    title: "This invoice was cancelled",
    body: "Do not send money for this invoice. You can start a new order from the plans page.",
  },
};

/** wa.me wants digits only with the country code: 0332... -> 92332... */
function whatsappDigits(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
}

function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Row({
  label,
  value,
  copy,
}: {
  label: string;
  value: string | null;
  copy?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-baseline gap-3 text-sm font-medium text-foreground">
        <span className="break-all">{value}</span>
        {copy ? <CopyButton value={value} label={label} /> : null}
      </dd>
    </div>
  );
}

export function BankTransferPanel({ onboardingId }: { onboardingId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const endpoint = `/api/public/onboarding/${encodeURIComponent(onboardingId)}/bank-transfer`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setLoadError(
          payload?.message ??
            "We could not find an invoice for this order. Choose bank transfer in checkout to create one.",
        );
        return;
      }
      setLoadError(null);
      setInvoice(payload as Invoice);
    } catch {
      setLoadError("We could not reach the server. Retrying...");
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh while the buyer is waiting on a person; stop once the outcome is final.
  const state = invoice?.state;
  useEffect(() => {
    if (
      !state ||
      state === "PAID" ||
      state === "CANCELLED" ||
      state === "EXPIRED"
    ) {
      return;
    }
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [state, load]);

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const files = data
      .getAll("evidence")
      .filter(
        (entry): entry is File => entry instanceof File && entry.size > 0,
      );
    if (files.length > MAX_FILES) {
      setNotice(`Attach at most ${MAX_FILES} files.`);
      return;
    }
    if (files.some((file) => file.size > MAX_BYTES)) {
      setNotice("Each file must be 5 MB or smaller.");
      return;
    }
    // Empty optional fields are dropped so the API's strict validation sees
    // only what the buyer actually typed.
    const body = new FormData();
    for (const key of [
      "transactionReference",
      "transferredAt",
      "amount",
      "note",
    ]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) body.append(key, value);
    }
    for (const file of files) body.append("evidence", file);

    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`${endpoint}/claims`, {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(
          payload?.message ?? "We could not record your payment report.",
        );
        return;
      }
      formRef.current?.reset();
      setNotice("Thank you. Your payment report is with our team.");
      await load();
    } catch {
      setNotice("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvoice() {
    if (busy) return;
    if (
      !window.confirm(
        "Cancel this invoice? Do not send money for it afterwards.",
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`${endpoint}/cancel`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(payload?.message ?? "We could not cancel this invoice.");
        return;
      }
      await load();
    } catch {
      setNotice("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !invoice) {
    return (
      <section
        className="max-w-2xl rounded-[28px] border border-border bg-white p-6 shadow-sm"
        role="alert"
      >
        <h1 className="text-3xl font-semibold text-foreground">
          Invoice unavailable
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">{loadError}</p>
        <Link
          className="mt-5 inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white"
          href="/plans"
        >
          Back to plans
        </Link>
      </section>
    );
  }

  if (!invoice) {
    return (
      <section
        className="max-w-2xl rounded-[28px] border border-border bg-white p-6 shadow-sm"
        aria-busy="true"
      >
        <p className="text-sm text-muted">Loading your invoice...</p>
      </section>
    );
  }

  const copy = STATE_COPY[invoice.state];
  const canReport =
    invoice.state === "AWAITING_PAYMENT" ||
    invoice.state === "CLARIFICATION_REQUESTED" ||
    invoice.state === "REJECTED";
  const showDetails =
    invoice.state !== "EXPIRED" &&
    invoice.state !== "CANCELLED" &&
    invoice.state !== "PAID";
  const { instructions: bank } = invoice;
  const dueLabel = invoice.dueAt
    ? new Date(invoice.dueAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="grid max-w-3xl gap-6">
      <section className="rounded-[28px] border border-border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Invoice {invoice.invoiceNumber}
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">
          Pay {formatMoney(invoice.amount, invoice.currency)}
        </h1>
        <div
          className="mt-4 rounded-2xl border border-border p-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{copy.body}</p>
          {invoice.claim?.clarificationRequest &&
          invoice.state === "CLARIFICATION_REQUESTED" ? (
            <p className="mt-2 text-sm font-medium text-foreground">
              &ldquo;{invoice.claim.clarificationRequest}&rdquo;
            </p>
          ) : null}
          {invoice.claim?.decisionReason && invoice.state === "REJECTED" ? (
            <p className="mt-2 text-sm font-medium text-foreground">
              Reason: {invoice.claim.decisionReason}
            </p>
          ) : null}
        </div>
        {invoice.state === "PAID" ? (
          <Link
            className="mt-4 inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white"
            href={`/subscribe/success?onboarding=${encodeURIComponent(invoice.orderId)}`}
          >
            Continue to your workspace
          </Link>
        ) : null}
      </section>

      {showDetails ? (
        <section className="rounded-[28px] border border-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Transfer details
          </h2>
          <dl className="mt-3 divide-y divide-border rounded-2xl border border-border">
            <Row label="Payment reference" value={invoice.reference} copy />
            <Row
              label="Amount"
              value={formatMoney(invoice.amount, invoice.currency)}
            />
            <Row label="Due by" value={dueLabel} />
            <Row label="Bank" value={bank.bankName} />
            <Row label="Account title" value={bank.accountTitle} copy />
            <Row label="IBAN" value={bank.iban} copy />
            <Row label="Account number" value={bank.accountNumber} copy />
            <Row label="Raast ID" value={bank.raastId} copy />
          </dl>
          <p className="mt-3 text-sm leading-6 text-muted">
            Quote the payment reference in the transfer narration so we can
            match it. Send exactly{" "}
            {formatMoney(invoice.amount, invoice.currency)}.
            {bank.paymentInstructions ? ` ${bank.paymentInstructions}` : ""}
          </p>
          {bank.receiptContactEmail || bank.receiptContactPhone ? (
            <div className="mt-3 rounded-2xl border border-border p-4 text-sm">
              <p className="font-semibold text-foreground">
                Send your payment receipt
              </p>
              <p className="mt-1 text-muted">
                After paying, send the receipt and quote{" "}
                <span className="font-mono text-foreground">
                  {invoice.reference}
                </span>
                . We confirm the funds in our account, then activate your
                subscription.
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {bank.receiptContactEmail ? (
                  <a
                    className="font-medium text-accent underline"
                    href={`mailto:${bank.receiptContactEmail}?subject=${encodeURIComponent(`Payment receipt ${invoice.reference}`)}`}
                  >
                    {bank.receiptContactEmail}
                  </a>
                ) : null}
                {bank.receiptContactPhone ? (
                  <a
                    className="font-medium text-accent underline"
                    href={`https://wa.me/${whatsappDigits(bank.receiptContactPhone)}?text=${encodeURIComponent(`Payment receipt ${invoice.reference}`)}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    WhatsApp {bank.receiptContactPhone}
                  </a>
                ) : null}
              </p>
            </div>
          ) : null}
          <details className="mt-3 text-sm text-muted">
            <summary className="cursor-pointer font-medium text-foreground">
              Price breakdown
            </summary>
            <p className="mt-2">
              Subtotal {formatMoney(invoice.subtotal, invoice.currency)} -
              Discount {formatMoney(invoice.discount, invoice.currency)} - Tax{" "}
              {formatMoney(invoice.tax, invoice.currency)}
            </p>
          </details>
        </section>
      ) : null}

      {canReport ? (
        <section className="rounded-[28px] border border-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">I have paid</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Tell us about your transfer. This does not activate your
            subscription - we verify the funds in our bank account first.
          </p>
          <form
            ref={formRef}
            className="mt-4 grid gap-4"
            onSubmit={submitClaim}
          >
            <label className="grid gap-1 text-sm font-medium text-foreground">
              Your bank&apos;s transaction reference (optional)
              <input
                name="transactionReference"
                className="rounded-xl border border-border px-3 py-2 font-normal"
                maxLength={64}
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-foreground">
              Transfer date (optional)
              <input
                name="transferredAt"
                type="date"
                className="rounded-xl border border-border px-3 py-2 font-normal"
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-foreground">
              Note (optional)
              <textarea
                name="note"
                rows={3}
                maxLength={500}
                className="rounded-xl border border-border px-3 py-2 font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-foreground">
              Payment receipt (optional - PDF, PNG or JPEG, up to {MAX_FILES}{" "}
              files of 5 MB)
              <input
                name="evidence"
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg"
                className="text-sm font-normal"
              />
            </label>
            {notice ? (
              <p className="text-sm font-medium text-foreground" role="status">
                {notice}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Sending..." : "I have paid"}
              </button>
              {invoice.state === "AWAITING_PAYMENT" && !invoice.claim ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancelInvoice}
                  className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground disabled:opacity-60"
                >
                  Cancel invoice
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : notice ? (
        <p className="text-sm font-medium text-foreground" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
