"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TriggerParseButtonProps = {
  candidateId: string;
  documentId: string;
};

export function TriggerParseButton({
  candidateId,
  documentId,
}: TriggerParseButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(
      `/api/candidates/${candidateId}/documents/${documentId}/parse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to register parsing job.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <div className="grid gap-2">
      <button
        className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent disabled:opacity-70"
        disabled={isSubmitting}
        onClick={handleClick}
        type="button"
      >
        {isSubmitting ? "Queueing..." : "Trigger parsing placeholder"}
      </button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
