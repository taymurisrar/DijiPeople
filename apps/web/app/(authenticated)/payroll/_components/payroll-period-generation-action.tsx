"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PermissionGate } from "../../_components/permission-gate";

type Props = {
  cycleId: string;
  disabled: boolean;
  existingPeriodCount: number;
};

export function PayrollPeriodGenerationAction({
  cycleId,
  disabled,
  existingPeriodCount,
}: Props) {
  const router = useRouter();
  const [periodCount, setPeriodCount] = useState(12);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setMessage(null);
    setError(null);
    const response = await fetch(
      `/api/payroll/cycles/${encodeURIComponent(cycleId)}/generate-periods`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodCount }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      createdCount?: number;
      skippedCount?: number;
      message?: string;
    };
    if (!response.ok) {
      setError(data.message ?? "Unable to generate payroll periods.");
      setPending(false);
      return;
    }
    setMessage(
      `${data.createdCount ?? 0} created, ${data.skippedCount ?? 0} already existed.`,
    );
    setPending(false);
    router.refresh();
  }

  return (
    <PermissionGate permission="payroll-periods.manage">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
        <span className="text-muted">{existingPeriodCount} linked periods</span>
        <label className="flex items-center gap-2 text-foreground">
          Generate
          <input
            aria-label="Number of payroll periods"
            className="w-16 rounded-lg border border-border bg-white px-2 py-1.5 text-right"
            disabled={disabled || pending}
            max={60}
            min={1}
            onChange={(event) =>
              setPeriodCount(Math.max(1, Math.min(60, Number(event.target.value) || 1)))
            }
            type="number"
            value={periodCount}
          />
        </label>
        <button
          className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || pending}
          onClick={generate}
          type="button"
        >
          {pending ? "Generating…" : "Generate periods"}
        </button>
        {disabled ? (
          <span className="text-warning">Select an active calendar on this cycle.</span>
        ) : null}
        {message ? <span className="text-success">{message}</span> : null}
        {error ? <span className="text-danger">{error}</span> : null}
      </div>
    </PermissionGate>
  );
}
