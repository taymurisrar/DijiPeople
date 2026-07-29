"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";

type ViewEmployeeDraftButtonProps = {
  onboardingId: string;
  draftEmployeeId?: string | null;
};

export function ViewEmployeeDraftButton({
  onboardingId,
  draftEmployeeId,
}: ViewEmployeeDraftButtonProps) {
  const router = useRouter();
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (draftEmployeeId) {
    return (
      <Button
        href={`/recruitment/employee-drafts/${draftEmployeeId}`}
        variant="secondary"
        fullWidth
      >
        View Employee Draft
      </Button>
    );
  }

  async function handleOpenDraft() {
    setError(null);
    setIsPreparing(true);

    const response = await fetch(`/api/onboarding/${onboardingId}/draft-employee`, {
      method: "POST",
    });

    const data = (await response.json().catch(() => null)) as
      | { employeeId?: string; message?: string }
      | null;

    if (!response.ok || !data?.employeeId) {
      setError(data?.message ?? "Unable to prepare employee draft.");
      setIsPreparing(false);
      return;
    }

    router.push(`/recruitment/employee-drafts/${data.employeeId}`);
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="secondary"
        fullWidth
        loading={isPreparing}
        loadingText="Preparing draft..."
        onClick={handleOpenDraft}
      >
        View Employee Draft
      </Button>
      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
