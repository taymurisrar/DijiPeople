"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  subscriptionId: string;
};

export function GenerateInvoiceButton({ subscriptionId }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(
        `/api/super-admin/subscriptions/${subscriptionId}/invoices`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(body?.message ?? "Unable to generate invoice.");
        return;
      }
      setMessage(`Invoice ${body?.invoiceNumber ?? "generated"} created.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        disabled={isPending}
        onClick={handleGenerate}
        type="button"
      >
        {isPending ? "Generating..." : "Generate invoice"}
      </button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
