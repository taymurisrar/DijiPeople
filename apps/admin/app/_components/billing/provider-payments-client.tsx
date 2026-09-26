"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, Undo2 } from "lucide-react";
import { AdminKeyValueGrid } from "@/app/_components/admin-ui";
import { ProDataTable } from "@/app/_components/crm/data-table";

type ProviderPayment = {
  id: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  amount: number;
  currency: string;
  paymentProvider: string | null;
  providerPaymentId: string | null;
  providerReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: string | null;
  createdAt: string;
  tenant: { name: string };
  subscription?: { status: string; plan?: { name: string } | null } | null;
  invoice?: { invoiceNumber: string; status: string } | null;
};

type ProviderEvent = {
  id: string;
  provider: string;
  externalEventId: string;
  eventType: string;
  providerPaymentId: string | null;
  processingStatus: string;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
};

type ProviderStatus = {
  safepay: {
    enabled: boolean;
    configured: boolean;
    environment: string | null;
  };
};

const REFUND_REASONS = [
  "DUPLICATE_PAYMENT",
  "BILLING_ERROR",
  "LEGAL_REQUIREMENT",
  "GOODWILL",
  "MANUAL_CORRECTION",
] as const;

/**
 * Payments DijiPeople billed through a provider other than Stripe (Safepay),
 * and the webhook deliveries behind them.
 *
 * Verify asks the provider and applies its answer — it never marks a payment
 * paid on an operator's word. Refund returns a captured payment in full through
 * the provider and records a RefundRequest either way.
 */
export function ProviderPaymentsClient({
  payments: initialPayments,
  events,
  providers,
}: {
  payments: ProviderPayment[];
  events: ProviderEvent[];
  providers: ProviderStatus;
}) {
  const [payments, setPayments] = useState(initialPayments);
  const [message, setMessage] = useState<{
    tone: "error" | "info";
    text: string;
  } | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState<Record<string, string>>({});
  const [refundCode, setRefundCode] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function reload() {
    return requestJson<ProviderPayment[]>("/api/super-admin/payments", {
      method: "GET",
    }).then((all) =>
      setPayments(
        all.filter(
          (payment) =>
            payment.paymentProvider && payment.paymentProvider !== "STRIPE",
        ),
      ),
    );
  }

  function verify(paymentId: string) {
    setMessage(null);
    setActionId(paymentId);
    startTransition(async () => {
      try {
        const result = await requestJson<{ status: string | null }>(
          `/api/super-admin/payments/${paymentId}/verify`,
          { method: "POST" },
        );
        await reload();
        setMessage({
          tone: "info",
          text: `Provider verified: ${result.status ?? "unknown"}.`,
        });
      } catch (error) {
        setMessage({
          tone: "error",
          text: errorText(error, "Verification failed."),
        });
      } finally {
        setActionId(null);
      }
    });
  }

  function refund(paymentId: string) {
    const reason = refundReason[paymentId]?.trim() ?? "";
    if (reason.length < 5) {
      setMessage({
        tone: "error",
        text: "Give a refund reason of at least five characters.",
      });
      return;
    }
    setMessage(null);
    setActionId(paymentId);
    startTransition(async () => {
      try {
        const result = await requestJson<{
          status: string;
          failureReason: string | null;
        }>(`/api/super-admin/payments/${paymentId}/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reasonCode: refundCode[paymentId] ?? "BILLING_ERROR",
            reason,
          }),
        });
        await reload();
        setMessage(
          result.status === "PROCESSED"
            ? { tone: "info", text: "Refund processed by the provider." }
            : {
                tone: "error",
                text: `Refund failed: ${result.failureReason ?? "no reason given"}.`,
              },
        );
      } catch (error) {
        setMessage({ tone: "error", text: errorText(error, "Refund failed.") });
      } finally {
        setActionId(null);
      }
    });
  }

  const safepay = providers.safepay;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <AdminKeyValueGrid
          items={[
            {
              label: "Safepay routing",
              value: safepay.enabled ? "On (PKR)" : "Off",
            },
            {
              label: "Credentials",
              value: safepay.configured ? "Configured" : "Missing",
            },
            { label: "Environment", value: safepay.environment ?? "Not set" },
          ]}
        />
      </section>

      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 text-sm ${
            message.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ProDataTable
          compact
          rows={payments}
          rowKey={(payment) => payment.id}
          stickyHeader
          columns={[
            {
              key: "tenant",
              header: "Tenant",
              minWidth: 180,
              render: (p) => p.tenant.name,
            },
            {
              key: "plan",
              header: "Plan",
              minWidth: 140,
              render: (p) => p.subscription?.plan?.name ?? "-",
            },
            {
              key: "status",
              header: "Payment",
              minWidth: 120,
              render: (p) => <Chip value={p.status} />,
            },
            {
              key: "subscription",
              header: "Subscription",
              minWidth: 130,
              render: (p) =>
                p.subscription ? <Chip value={p.subscription.status} /> : "-",
            },
            {
              key: "amount",
              header: "Amount",
              minWidth: 130,
              render: (p) => formatMoney(p.amount, p.currency),
            },
            {
              key: "provider",
              header: "Provider",
              minWidth: 110,
              render: (p) => p.paymentProvider ?? "-",
            },
            {
              key: "reference",
              header: "Provider ref",
              minWidth: 220,
              render: (p) => (
                <span className="font-mono text-xs text-slate-600">
                  {p.providerPaymentId ?? "-"}
                </span>
              ),
            },
            {
              key: "paid",
              header: "Paid",
              minWidth: 160,
              render: (p) => formatDateTime(p.paidAt),
            },
            {
              key: "failure",
              header: "Failure",
              minWidth: 200,
              render: (p) => (
                <span className="line-clamp-2 text-slate-600">
                  {p.failureCode ?? "-"}
                </span>
              ),
            },
            {
              key: "action",
              header: "Action",
              minWidth: 120,
              render: (p) =>
                p.status === "PENDING" || p.status === "FAILED" ? (
                  <button
                    type="button"
                    onClick={() => verify(p.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionId === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    Verify
                  </button>
                ) : (
                  <span className="text-slate-400">-</span>
                ),
            },
          ]}
          emptyTitle="No provider payments"
          emptyDescription="Payments collected through Safepay appear here."
          renderExpandedRow={(p) => (
            <div className="space-y-3">
              <AdminKeyValueGrid
                items={[
                  { label: "Invoice", value: p.invoice?.invoiceNumber ?? "-" },
                  { label: "Invoice status", value: p.invoice?.status ?? "-" },
                  {
                    label: "Provider charge",
                    value: p.providerReference ?? "-",
                  },
                  { label: "Created", value: formatDateTime(p.createdAt) },
                ]}
              />
              {p.failureMessage ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {p.failureMessage}
                </div>
              ) : null}
              {p.status === "SUCCEEDED" ? (
                <div className="grid gap-3 md:grid-cols-[200px_minmax(220px,1fr)_auto] md:items-end">
                  <label className="text-sm font-medium text-slate-700">
                    Refund reason
                    <select
                      value={refundCode[p.id] ?? "BILLING_ERROR"}
                      onChange={(event) =>
                        setRefundCode((current) => ({
                          ...current,
                          [p.id]: event.target.value,
                        }))
                      }
                      className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    >
                      {REFUND_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason.replace(/_/g, " ").toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Details
                    <input
                      value={refundReason[p.id] ?? ""}
                      maxLength={500}
                      onChange={(event) =>
                        setRefundReason((current) => ({
                          ...current,
                          [p.id]: event.target.value,
                        }))
                      }
                      className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => refund(p.id)}
                    disabled={isPending}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {actionId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Undo2 className="h-4 w-4" />
                    )}
                    Refund in full
                  </button>
                </div>
              ) : null}
            </div>
          )}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ProDataTable
          compact
          rows={events}
          rowKey={(event) => event.id}
          getRowClassName={(event) =>
            event.processingStatus === "FAILED" ? "bg-rose-50/40" : undefined
          }
          columns={[
            {
              key: "type",
              header: "Event",
              minWidth: 200,
              render: (event) => (
                <span className="font-mono text-xs">{event.eventType}</span>
              ),
            },
            {
              key: "status",
              header: "Status",
              minWidth: 120,
              render: (event) => <Chip value={event.processingStatus} />,
            },
            {
              key: "tracker",
              header: "Provider ref",
              minWidth: 220,
              render: (event) => (
                <span className="font-mono text-xs text-slate-600">
                  {event.providerPaymentId ?? "-"}
                </span>
              ),
            },
            {
              key: "created",
              header: "Received",
              minWidth: 160,
              render: (event) => formatDateTime(event.createdAt),
            },
            {
              key: "error",
              header: "Error",
              minWidth: 240,
              render: (event) => (
                <span className="line-clamp-2 text-slate-600">
                  {event.errorMessage ?? "-"}
                </span>
              ),
            },
          ]}
          emptyTitle="No provider webhooks"
          emptyDescription="Safepay webhook deliveries appear here."
        />
      </section>
    </div>
  );
}

function Chip({ value }: { value: string }) {
  const tone =
    value === "SUCCEEDED" || value === "PROCESSED" || value === "ACTIVE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "FAILED" || value === "EXPIRED"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : value === "REFUNDED" || value === "IGNORED" || value === "CANCELED"
          ? "border-slate-200 bg-slate-100 text-slate-600"
          : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {value}
    </span>
  );
}

async function requestJson<T = unknown>(path: string, init: RequestInit) {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;
  if (!response.ok) {
    const text =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "Request failed.";
    throw new Error(text);
  }
  return payload as T;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    value,
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
