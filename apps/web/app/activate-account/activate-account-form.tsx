"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type InvitationStatus = {
  email: string;
  expiresAt: string;
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

      const response = await fetch(
        `/api/auth/invitation-status?token=${encodeURIComponent(token)}`,
      );
      const payload = (await response.json().catch(() => null)) as
        | ({ message?: string } & InvitationStatus)
        | null;

      if (!response.ok) {
        setError(payload?.message ?? "Invitation is invalid or expired.");
        setIsLoading(false);
        return;
      }

      setStatus(payload);
      setIsLoading(false);
    }

    void loadStatus();
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("Activation token is missing.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/auth/activate-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        password,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(payload?.message ?? "Unable to activate your account.");
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
      <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="rounded-2xl border border-border bg-white/80 px-4 py-4 text-sm text-muted">
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

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="password">
          Set password
        </label>
        <input
          id="password"
          className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="confirmPassword">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <button
        className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Activating..." : "Activate account"}
      </button>
    </form>
  );
}
