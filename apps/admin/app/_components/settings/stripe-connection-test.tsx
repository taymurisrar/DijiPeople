"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";

export function StripeConnectionTest() {
  const [result, setResult] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            const response = await fetch(
              "/api/super-admin/billing/test-stripe-connection",
              { method: "POST" },
            );
            const payload = (await response.json().catch(() => null)) as {
              accountId?: string;
              mode?: string;
              message?: string;
            } | null;
            setSuccess(response.ok);
            setResult(
              response.ok
                ? `Connected to ${payload?.accountId ?? "Stripe"} in ${payload?.mode ?? "configured"} mode.`
                : (payload?.message ?? "Stripe connection failed."),
            );
          })
        }
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--admin-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PlugZap className="h-4 w-4" />
        )}
        Test Stripe connection
      </button>
      {result ? (
        <p
          className={`inline-flex items-center gap-1.5 text-sm ${success ? "text-emerald-700" : "text-rose-700"}`}
          role="status"
        >
          {success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {result}
        </p>
      ) : null}
    </div>
  );
}
