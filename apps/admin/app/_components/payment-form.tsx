"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PaymentFormProps = {
  tenants: Array<{
    id: string;
    name: string;
    subscriptions: Array<{
      id: string;
      label: string;
    }>;
    invoices: Array<{
      id: string;
      label: string;
    }>;
  }>;
};

export function PaymentForm({ tenants }: PaymentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [subscriptionId, setSubscriptionId] = useState(
    tenants[0]?.subscriptions[0]?.id ?? "",
  );
  const [invoiceId, setInvoiceId] = useState(tenants[0]?.invoices[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [paymentMethod, setPaymentMethod] = useState("MANUAL");
  const [status, setStatus] = useState("SUCCEEDED");

  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId) ?? null;

  function handleTenantChange(value: string) {
    setTenantId(value);
    const nextTenant = tenants.find((tenant) => tenant.id === value);
    setSubscriptionId(nextTenant?.subscriptions[0]?.id ?? "");
    setInvoiceId(nextTenant?.invoices[0]?.id ?? "");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/super-admin/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          subscriptionId,
          invoiceId: invoiceId || undefined,
          amount: Number(amount),
          currency,
          paymentMethod,
          status,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to record payment.");
        return;
      }

      setMessage("Payment recorded.");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-950">Record payment</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Capture offline or manually reconciled payments without waiting for gateway automation.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Tenant
          <select
            value={tenantId}
            onChange={(event) => handleTenantChange(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Subscription
          <select
            value={subscriptionId}
            onChange={(event) => setSubscriptionId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          >
            {selectedTenant?.subscriptions.map((subscription) => (
              <option key={subscription.id} value={subscription.id}>
                {subscription.label}
              </option>
            )) ?? <option value="">No subscription</option>}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <label className="block text-sm font-medium text-slate-700">
          Invoice
          <select
            value={invoiceId}
            onChange={(event) => setInvoiceId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          >
            <option value="">No linked invoice</option>
            {selectedTenant?.invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Amount
          <input
            min="0"
            step="0.01"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Currency
          <input
            maxLength={3}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm uppercase"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Method
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          >
            <option value="MANUAL">Manual</option>
            <option value="CARD">Card</option>
            <option value="BANK">Bank</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Status
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="PENDING">Pending</option>
          <option value="SUCCEEDED">Succeeded</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </label>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <button
        className="inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : "Record payment"}
      </button>
    </form>
  );
}
