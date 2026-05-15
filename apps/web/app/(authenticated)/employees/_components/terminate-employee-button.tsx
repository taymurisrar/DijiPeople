"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ConfirmationDialog,
  SideToast,
} from "@/app/components/notifications";
import { Button } from "@/app/components/ui/button";

export function TerminateEmployeeButton({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{
    title: string;
    description?: string;
    variant: "success" | "error";
  } | null>(null);

  async function handleTerminate() {
    setIsSubmitting(true);

    const response = await fetch(`/api/employees/${employeeId}/terminate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const data = (await response.json()) as { message?: string };
      setToast({
        title: "Termination failed",
        description: data.message ?? "Unable to terminate employee.",
        variant: "error",
      });
      setIsSubmitting(false);
      return;
    }

    setConfirmOpen(false);
    setToast({
      title: "Employee terminated",
      description: "The employee record was marked as terminated.",
      variant: "success",
    });
    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <div className="space-y-3">
      <Button
        fullWidth
        variant="danger-soft"
        loading={isSubmitting}
        loadingText="Terminating..."
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        Terminate employee
      </Button>

      <ConfirmationDialog
        cancelLabel="Cancel"
        confirmLabel="Terminate"
        description="This keeps the employee record but marks it as terminated."
        isLoading={isSubmitting}
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleTerminate}
        title="Terminate this employee?"
        variant="danger"
      />

      {toast ? (
        <SideToast
          isOpen
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
