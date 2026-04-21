"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";

export function EmployeeResetPasswordButton({
  employeeId,
}: {
  employeeId: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setMessage(null);
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(
      `/api/employees/${employeeId}/send-reset-password-link`,
      { method: "POST" },
    );
    const data = (await response.json().catch(() => null)) as
      | { message?: string; recipientEmail?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to send reset password link.");
      setIsSubmitting(false);
      return;
    }

    setMessage(
      data?.recipientEmail
        ? `Reset password link sent to ${data.recipientEmail}.`
        : "Reset password link sent.",
    );
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
<Button
  variant="secondary"
  loading={isSubmitting}
  loadingText="Sending reset link..."
  disabled={isSubmitting}
  onClick={handleClick}
  type="button"
>
  Send reset password link
</Button>
      {message ? (
        <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
