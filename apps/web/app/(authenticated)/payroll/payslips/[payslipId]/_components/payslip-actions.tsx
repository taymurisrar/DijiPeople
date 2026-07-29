"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PayslipActions({
  canRegenerate,
  canPublish,
  canVoid,
  payslipId,
  status,
}: {
  canRegenerate: boolean;
  canPublish: boolean;
  canVoid: boolean;
  payslipId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  async function publish() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payslips/${payslipId}/publish`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to publish payslip.");
      return;
    }
    router.refresh();
  }

  async function voidPayslip() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payslips/${payslipId}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to void payslip.");
      return;
    }
    setReason("");
    router.refresh();
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payslips/${payslipId}/regenerate`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to regenerate payslip.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {canPublish && status === "GENERATED" ? (
          <button
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            disabled={busy}
            onClick={publish}
            type="button"
          >
            Publish
          </button>
        ) : null}
        {canRegenerate && ["GENERATED", "PUBLISHED"].includes(status) ? (
          <button
            className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={regenerate}
            type="button"
          >
            Regenerate PDF
          </button>
        ) : null}
        {canVoid && ["GENERATED", "PUBLISHED"].includes(status) ? (
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-2xl border border-border px-3 py-2 text-sm"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Void reason"
              value={reason}
            />
            <button
              className="rounded-2xl border border-danger px-4 py-2 text-sm font-semibold text-danger"
              disabled={busy || reason.trim().length < 3}
              onClick={voidPayslip}
              type="button"
            >
              Void
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
