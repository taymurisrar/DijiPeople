"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSideToast } from "@/app/components/notifications";
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
  const { notifySuccess, notifyError, toast } = useSideToast();

  const pastTense = {
    approve: "approved",
    reject: "rejected",
    cancel: "cancelled",
  } as const;

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
        const message = data.message ?? `Unable to ${action} leave request.`;
        setError(message);
        notifyError(`Could not ${action} the request`, message);
        setIsSubmitting(false);
        return;
      }

      // The page refresh alone gives no confirmation that the action landed.
      notifySuccess(`Leave request ${pastTense[action]}`);
      router.refresh();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : `Unable to ${action} leave request.`;

      setError(message);
      notifyError(`Could not ${action} the request`, message);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  return (
    <div className="space-y-3">
      {toast}
      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent/30 hover:text-foreground"
          href={`/leaves/${request.id}`}
        >
          View
        </Link>
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
