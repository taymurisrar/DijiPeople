"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";

export function TerminateEmployeeButton({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTerminate() {
    const confirmed = window.confirm(
      "Terminate this employee record? This keeps the record but marks it as terminated.",
    );

    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await fetch(`/api/employees/${employeeId}/terminate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const data = (await response.json()) as { message?: string };
      setError(data.message ?? "Unable to terminate employee.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Button
        fullWidth
        variant="danger-soft"
        loading={isSubmitting}
        loadingText="Terminating..."
        onClick={handleTerminate}
        type="button"
      >
        Terminate employee
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
