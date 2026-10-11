"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { PasswordField } from "@/app/components/ui/password-field";
import {
  comparePasswords,
  describeComparison,
  evaluatePasswordPolicy,
  readPasswordsFromForm,
  type PasswordPolicy,
} from "./password-rules";

type InvitationStatus = {
  email: string;
  expiresAt: string;
  /*
   * Optional: a checklist is rendered only when the API supplies the tenant's
   * policy. The client never guesses rules the server would then contradict.
   */
  passwordPolicy?: PasswordPolicy | null;
  tenant?: {
    name: string;
  } | null;
  user?: {
    firstName: string;
    lastName: string;
  } | null;
};

export function ActivateAccountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<InvitationStatus | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadStatus() {
      if (!token) {
        setError("Activation token is missing.");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/auth/invitation-status?token=${encodeURIComponent(token)}`,
        );
        const payload = (await response.json().catch(() => null)) as
          | ({ message?: string } & InvitationStatus)
          | null;

        if (!response.ok) {
          /*
           * The API distinguishes unknown (404), already used and expired
           * (400) in `message`; fall back by status so a bare proxy error
           * still reads sensibly.
           */
          setError(
            payload?.message ??
              (response.status === 404
                ? "This invitation link is not valid."
                : "Invitation is invalid or expired."),
          );
          setIsLoading(false);
          return;
        }

        setStatus(payload);
      } catch {
        setError("Unable to check this invitation. Check your connection.");
      }
      setIsLoading(false);
    }

    void loadStatus();
  }, [token]);

  /*
   * Match feedback waits until the confirmation field has been left once, so
   * the first keystrokes are never flagged as a mismatch.
   */
  const liveComparison = comparePasswords(password, confirmPassword);
  const confirmError =
    confirmTouched && confirmPassword
      ? describeComparison(liveComparison)
      : null;
  const policyRules = status?.passwordPolicy
    ? evaluatePasswordPolicy(password, status.passwordPolicy)
    : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("Activation token is missing.");
      return;
    }

    /*
     * Read the live DOM values: autofill can fill a field without a React
     * change event, which would otherwise read as a false mismatch.
     */
    const current = readPasswordsFromForm(event.currentTarget, {
      password,
      confirmPassword,
    });
    setConfirmTouched(true);

    if (!current.password) {
      setError("Enter a password.");
      return;
    }

    const comparison = comparePasswords(
      current.password,
      current.confirmPassword,
    );
    if (!comparison.ok) {
      setError(describeComparison(comparison) ?? "Confirm your password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/activate-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password: current.password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.message ?? "Unable to activate your account.");
        setIsSubmitting(false);
        return;
      }
    } catch {
      setError("Unable to activate your account. Check your connection.");
      setIsSubmitting(false);
      return;
    }

    setSuccess("Your account is active. Redirecting to login...");
    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 1200);
  }

  if (isLoading) {
    return <p className="text-sm text-muted">Validating invitation...</p>;
  }

  if (error && !status) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-4 text-sm text-danger"
          role="alert"
        >
          {error}
        </div>
        <Link className="text-sm font-medium text-accent" href="/login">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <form className="min-w-0 space-y-5" onSubmit={handleSubmit}>
      <div className="break-words rounded-2xl border border-border bg-white/80 px-4 py-4 text-sm text-muted">
        <p className="font-medium text-foreground">
          {status?.user
            ? `${status.user.firstName} ${status.user.lastName}`
            : "Invited user"}
        </p>
        <p className="mt-1">Work email: {status?.email}</p>
        <p className="mt-1">
          Workspace: {status?.tenant?.name ?? "DijiPeople"}
        </p>
      </div>

      <PasswordField
        autoComplete="new-password"
        describedBy={policyRules ? "password-rules" : undefined}
        disabled={isSubmitting}
        label="Set password"
        name="password"
        onChange={setPassword}
        value={password}
      />

      {policyRules ? (
        <ul className="space-y-1 text-sm" id="password-rules">
          {policyRules.map((rule) => (
            <li
              className={rule.met ? "text-emerald-700" : "text-muted"}
              key={rule.key}
            >
              {/* Text prefix, so state is never carried by colour alone. */}
              {rule.met ? "Met: " : "Required: "}
              {rule.label}
            </li>
          ))}
        </ul>
      ) : null}

      <PasswordField
        autoComplete="new-password"
        disabled={isSubmitting}
        error={confirmError}
        label="Confirm password"
        name="confirmPassword"
        onBlur={() => setConfirmTouched(true)}
        onChange={setConfirmPassword}
        value={confirmPassword}
      />

      {confirmTouched && confirmPassword && liveComparison.ok ? (
        <p className="text-sm text-emerald-700" role="status">
          Passwords match.
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {success ? (
        <p
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <button
        className="min-h-11 w-full rounded-2xl bg-accent px-4 py-3 text-base font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting || Boolean(success)}
        type="submit"
      >
        {isSubmitting ? "Activating..." : "Activate account"}
      </button>
    </form>
  );
}
