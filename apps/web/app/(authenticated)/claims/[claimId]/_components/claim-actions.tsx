"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClaimActions({
  canCancel,
  canManagerApprove,
  canPayrollApprove,
  canReject,
  canSubmit,
  claimId,
  status,
}: {
  canCancel: boolean;
  canManagerApprove: boolean;
  canPayrollApprove: boolean;
  canReject: boolean;
  canSubmit: boolean;
  claimId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(action: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/claims/${claimId}/${action}`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Claim action failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {canSubmit && status === "DRAFT" ? (
          <button className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white" disabled={busy} onClick={() => post("submit")} type="button">
            Submit
          </button>
        ) : null}
        {canManagerApprove && status === "SUBMITTED" ? (
          <button className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold" disabled={busy} onClick={() => post("manager-approve", {})} type="button">
            Manager Approve
          </button>
        ) : null}
        {canPayrollApprove && status === "MANAGER_APPROVED" ? (
          <button className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold" disabled={busy} onClick={() => post("payroll-approve", {})} type="button">
            Payroll Approve
          </button>
        ) : null}
        {canCancel && !["INCLUDED_IN_PAYROLL", "PAID", "CANCELLED"].includes(status) ? (
          <button className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold" disabled={busy} onClick={() => post("cancel")} type="button">
            Cancel
          </button>
        ) : null}
      </div>
      {canReject && !["INCLUDED_IN_PAYROLL", "PAID", "REJECTED", "CANCELLED"].includes(status) ? (
        <div className="flex flex-wrap gap-2">
          <input className="rounded-2xl border border-border px-3 py-2 text-sm" onChange={(event) => setReason(event.target.value)} placeholder="Reject reason" value={reason} />
          <button className="rounded-2xl border border-danger px-4 py-2 text-sm font-semibold text-danger" disabled={busy || reason.trim().length < 3} onClick={() => post("reject", { reason })} type="button">
            Reject
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
