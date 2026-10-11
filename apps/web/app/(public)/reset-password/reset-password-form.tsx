"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { PasswordField } from "@/app/components/ui/password-field";
import {
  comparePasswords,
  describeComparison,
} from "@/app/activate-account/password-rules";

type FieldErrors = {
  password?: string;
  confirmPassword?: string;
};

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(
    token ? null : "Password reset token is missing.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    const comparison = comparePasswords(password, confirmPassword);
    if (!comparison.ok) {
      errors.confirmPassword =
        describeComparison(comparison) ?? "Confirm your password.";
    }
    setFieldErrors(errors);
    setMessage(null);
    if (Object.keys(errors).length > 0 || !token) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        setMessage(data?.message ?? "Unable to reset password.");
        return;
      }
      router.push("/login?reason=password-reset-success");
    } catch {
      setMessage("Unable to reset password. Check the API connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={submit}>
      {message ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      ) : null}
      <PasswordField
        autoComplete="new-password"
        disabled={isSubmitting}
        error={fieldErrors.password}
        label="New password"
        name="password"
        onChange={(value) => {
          setPassword(value);
          setFieldErrors((current) => ({ ...current, password: undefined }));
        }}
        placeholder="Enter a new password"
        value={password}
      />
      <PasswordField
        autoComplete="new-password"
        disabled={isSubmitting}
        error={fieldErrors.confirmPassword}
        label="Confirm password"
        name="confirmPassword"
        onChange={(value) => {
          setConfirmPassword(value);
          setFieldErrors((current) => ({
            ...current,
            confirmPassword: undefined,
          }));
        }}
        placeholder="Re-enter the new password"
        value={confirmPassword}
      />
      <button
        className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting || !token}
        type="submit"
      >
        {isSubmitting ? "Resetting..." : "Reset password"}
      </button>
    </form>
  );
}
