"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GeneratePayrollDraftsButton({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/payroll/cycles/${cycleId}/generate-drafts`, {
      method: "POST",
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to generate payroll drafts.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <button
        className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
        disabled={isSubmitting}
        onClick={handleGenerate}
        type="button"
      >
        {isSubmitting ? "Generating..." : "Generate draft payroll"}
      </button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

