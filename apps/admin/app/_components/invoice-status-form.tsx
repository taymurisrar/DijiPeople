"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type InvoiceStatusFormProps = {
  invoiceId: string;
  currentStatus: "DRAFT" | "ISSUED" | "PAID" | "OVERDUE";
};

export function InvoiceStatusForm({
  invoiceId,
  currentStatus,
}: InvoiceStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/super-admin/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update invoice status.");
        return;
      }

      setMessage("Invoice status updated.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value as typeof status)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="DRAFT">Draft</option>
        <option value="ISSUED">Issued</option>
        <option value="PAID">Paid</option>
        <option value="OVERDUE">Overdue</option>
      </select>
      <button
        className="rounded-xl border border-slate-200 bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : "Update"}
      </button>
      {message ? <span className="text-xs text-slate-500">{message}</span> : null}
    </form>
  );
}
