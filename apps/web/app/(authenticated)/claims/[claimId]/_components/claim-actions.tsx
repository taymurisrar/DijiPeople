"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClaimRecord } from "../../claim-types";

export function ClaimActions({
  basePath = "/api/claims",
  canCancel,
  canManagerApprove,
  canPayrollApprove,
  canReject,
  canSubmit,
  claimId,
  onSuccess,
  status,
}: {
  /* "/api/claims" (admin) or "/api/me/claims" (self-service) — TASK-0036. */
  basePath?: string;
  canCancel: boolean;
  canManagerApprove: boolean;
  canPayrollApprove: boolean;
  canReject: boolean;
  canSubmit: boolean;
  claimId: string;
  /*
   * The bespoke claim editor holds the claim in client state rather than
   * server-component props, so `router.refresh()` alone would not update
   * what is on screen — this hands the caller the claim the action returned
   * (every one of these routes responds with the updated claim) so it can
   * update that state directly.
   */
  onSuccess?: (claim: ClaimRecord) => void;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(action: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const response = await fetch(`${basePath}/${claimId}/${action}`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json().catch(() => null)) as
      | (ClaimRecord & { message?: string })
      | null;
    setBusy(false);
    if (!response.ok) {
      setError(data?.message ?? "Claim action failed.");
      return;
    }
    if (data) onSuccess?.(data);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {canSubmit && status === "DRAFT" ? (
          <button
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            disabled={busy}
            onClick={() => post("submit")}
            type="button"
          >
            Submit
          </button>
        ) : null}
        {canManagerApprove && status === "SUBMITTED" ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold"
            disabled={busy}
            onClick={() => post("manager-approve", {})}
            type="button"
          >
            Manager Approve
          </button>
        ) : null}
        {canPayrollApprove && status === "MANAGER_APPROVED" ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold"
            disabled={busy}
            onClick={() => post("payroll-approve", {})}
            type="button"
          >
            Payroll Approve
          </button>
        ) : null}
        {canCancel &&
        !["INCLUDED_IN_PAYROLL", "PAID", "CANCELLED"].includes(status) ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold"
            disabled={busy}
            onClick={() => post("cancel")}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {canReject &&
      !["INCLUDED_IN_PAYROLL", "PAID", "REJECTED", "CANCELLED"].includes(
        status,
      ) ? (
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-2xl border border-border px-3 py-2 text-sm"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reject reason"
            value={reason}
          />
          <button
            className="rounded-2xl border border-danger px-4 py-2 text-sm font-semibold text-danger"
            disabled={busy || reason.trim().length < 3}
            onClick={() => post("reject", { reason })}
            type="button"
          >
            Reject
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
