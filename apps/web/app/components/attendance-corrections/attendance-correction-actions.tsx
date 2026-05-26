"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AttendanceCorrectionActionsProps = {
  requestId: string;
  canApprove: boolean;
  canReject: boolean;
};

export function AttendanceCorrectionActions({
  requestId,
  canApprove,
  canReject,
}: AttendanceCorrectionActionsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(action: "approve" | "reject") {
    const label = action === "approve" ? "approve" : "reject";
    const confirmed = window.confirm(
      `Are you sure you want to ${label} this attendance correction request?`,
    );
    if (!confirmed) return;

    const comment = window.prompt("Optional comment")?.trim() ?? "";
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/attendance/correction-requests/${requestId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to update correction request.");
      }
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update correction request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canApprove && !canReject) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canApprove ? (
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => void submit("approve")}
            type="button"
          >
            <Check className="h-4 w-4" />
            Approve
          </button>
        ) : null}
        {canReject ? (
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => void submit("reject")}
            type="button"
          >
            <X className="h-4 w-4" />
            Reject
          </button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
