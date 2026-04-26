"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PermissionGate } from "../../_components/permission-gate";
import { PayrollCycleStatus } from "../types";

type PayrollCycleActionsProps = {
  cycleId: string;
  status: PayrollCycleStatus;
  blockedEmployees: number;
  recordCount: number;
  requireApprovedTimesheets?: boolean;
};

export function PayrollCycleActions({
  cycleId,
  status,
  blockedEmployees,
  recordCount,
  requireApprovedTimesheets,
}: PayrollCycleActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: "generate-drafts" | "review" | "finalize") {
    setError(null);
    setPendingAction(action);

    const response = await fetch(`/api/payroll/cycles/${cycleId}/${action}`, {
      method: "POST",
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    if (!response.ok) {
      setError(data.message ?? "Unable to update payroll cycle.");
      setPendingAction(null);
      return;
    }

    router.refresh();
    setPendingAction(null);
  }

  const canGenerate = status !== "FINALIZED" && blockedEmployees === 0;
  const canReview = recordCount > 0 && status !== "FINALIZED";
  const canFinalize = recordCount > 0 && status === "REVIEW";

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap justify-end gap-2">
        <PermissionGate permission="payroll.run">
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canGenerate || pendingAction !== null}
            onClick={() => runAction("generate-drafts")}
            type="button"
          >
            {pendingAction === "generate-drafts"
              ? "Generating..."
              : "Generate draft payroll"}
          </button>
        </PermissionGate>
        <PermissionGate permission="payroll.review">
          <button
            className="rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canReview || pendingAction !== null}
            onClick={() => runAction("review")}
            type="button"
          >
            {pendingAction === "review" ? "Reviewing..." : "Mark reviewed"}
          </button>
        </PermissionGate>
        <PermissionGate permission="payroll.finalize">
          <button
            className="rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-white transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canFinalize || pendingAction !== null}
            onClick={() => runAction("finalize")}
            type="button"
          >
            {pendingAction === "finalize" ? "Finalizing..." : "Finalize payroll"}
          </button>
        </PermissionGate>
        <PermissionGate permission="payroll.export">
          <a
            className="rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
            href={`/api/payroll/cycles/${cycleId}/export`}
          >
            Export payroll
          </a>
        </PermissionGate>
      </div>
      {requireApprovedTimesheets ? (
        <p className="max-w-sm text-right text-xs text-muted">
          Tenant settings require approved timesheets before payroll generation.
        </p>
      ) : null}
      {blockedEmployees > 0 ? (
        <p className="max-w-sm text-right text-xs text-danger">
          Resolve blocked employees in the preview before generating payroll.
        </p>
      ) : null}
      {error ? <p className="max-w-sm text-right text-sm text-danger">{error}</p> : null}
    </div>
  );
}
