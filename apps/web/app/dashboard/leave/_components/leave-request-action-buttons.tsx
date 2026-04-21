"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LeaveRequestRecord } from "../types";

type LeaveRequestActionButtonsProps = {
  request: LeaveRequestRecord;
};

export function LeaveRequestActionButtons({
  request,
}: LeaveRequestActionButtonsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAction(
    action: "approve" | "reject" | "cancel",
    body?: Record<string, string>,
  ) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/leave-requests/${request.id}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? `Unable to ${action} leave request.`);
        setIsSubmitting(false);
        return;
      }

      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `Unable to ${action} leave request.`,
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {request.canCurrentUserApprove ? (
          <button
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            onClick={() => runAction("approve")}
            type="button"
          >
            Approve
          </button>
        ) : null}
        {request.canCurrentUserReject ? (
          <button
            className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            onClick={() => runAction("reject")}
            type="button"
          >
            Reject
          </button>
        ) : null}
        {request.canCurrentUserCancel ? (
          <button
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            onClick={() => runAction("cancel")}
            type="button"
          >
            Cancel request
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
