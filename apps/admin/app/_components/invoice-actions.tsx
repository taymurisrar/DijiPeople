"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceActions({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function emailInvoice() {
    setBusy(true);
    setMessage(null);
    setError(null);
    const response = await fetch(`/api/super-admin/invoices/${invoiceId}/email`, {
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.message ?? "Unable to email invoice.");
    } else {
      setMessage("Invoice email queued successfully.");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        href={`/api/super-admin/invoices/${invoiceId}/pdf`}
      >
        Download PDF Invoice
      </a>
      <button
        className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy}
        onClick={emailInvoice}
        type="button"
      >
        {busy ? "Sending..." : "Email Invoice"}
      </button>
      {message ? <p className="basis-full text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="basis-full text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
