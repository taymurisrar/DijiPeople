"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";

export function ConvertToEmployeeButton({
  canConvert,
  onboardingId,
}: {
  canConvert: boolean;
  onboardingId: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConvert() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/onboarding/${onboardingId}/convert-to-employee`, {
      method: "POST",
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string; employeeId?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to convert onboarding to employee.");
      setIsSubmitting(false);
      return;
    }

    if (data?.employeeId) {
      router.push(`/employees/${data.employeeId}`);
      router.refresh();
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <div className="grid gap-3">
      <Button
        disabled={!canConvert || isSubmitting}
        loading={isSubmitting}
        loadingText="Converting..."
        onClick={handleConvert}
        type="button"
        fullWidth
      >
        Convert to employee
      </Button>
      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
