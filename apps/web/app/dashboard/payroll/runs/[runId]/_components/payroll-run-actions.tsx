"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PayrollRunActions({
  canCalculate,
  canGeneratePayslips,
  canLock,
  runId,
  status,
}: {
  canCalculate: boolean;
  canGeneratePayslips: boolean;
  canLock: boolean;
  runId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(action: "calculate" | "lock") {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/${action}`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? `Unable to ${action} payroll run.`);
      return;
    }
    router.refresh();
  }

  async function generatePayslips() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payslips/generate/run/${runId}`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to generate payslips.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {canCalculate && !["APPROVED", "PAID", "LOCKED"].includes(status) ? (
          <button
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            disabled={busy}
            onClick={() => post("calculate")}
            type="button"
          >
            Calculate
          </button>
        ) : null}
        {canLock && ["CALCULATED", "REVIEWED"].includes(status) ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={() => post("lock")}
            type="button"
          >
            Lock
          </button>
        ) : null}
        {canGeneratePayslips &&
        ["CALCULATED", "REVIEWED", "APPROVED", "PAID", "LOCKED"].includes(
          status,
        ) ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={generatePayslips}
            type="button"
          >
            Generate Payslips
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
