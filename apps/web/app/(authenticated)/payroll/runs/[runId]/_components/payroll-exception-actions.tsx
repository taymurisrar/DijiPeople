"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";

export function PayrollExceptionActions({
  exceptionId,
  isResolved,
  runId,
}: {
  exceptionId: string;
  isResolved: boolean;
  runId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolveException() {
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/payroll/runs/${runId}/exceptions/${exceptionId}/resolve`,
      {
        body: JSON.stringify({
          comment: "Resolved after payroll readiness configuration was corrected.",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to resolve the exception.");
      return;
    }
    router.refresh();
  }

  if (isResolved) {
    return (
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        Resolved
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        disabled={busy}
        loading={busy}
        onClick={resolveException}
        size="sm"
        variant="secondary"
      >
        Resolve
      </Button>
      {error ? <p className="max-w-sm text-sm text-danger">{error}</p> : null}
    </div>
  );
}
