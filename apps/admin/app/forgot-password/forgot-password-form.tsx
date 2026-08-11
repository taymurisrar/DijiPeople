"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your admin email address.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        setError(data?.message ?? "Unable to request a password reset.");
        return;
      }
      setMessage(
        data?.message ??
          "If an active admin account exists, a reset link will be sent.",
      );
    } catch {
      setError("Unable to reach the password recovery service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      {message ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="recovery-email" className="text-sm font-medium text-slate-900">
          Admin email
        </label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          disabled={submitting || Boolean(message)}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@company.com"
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-50 disabled:bg-slate-50"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || Boolean(message)}
        className="w-full rounded-2xl bg-[#073c34] px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending secure link..." : "Send reset link"}
      </button>
      <Link href="/login" className="block text-center text-sm font-semibold text-emerald-800 hover:text-emerald-600">
        Back to sign in
      </Link>
    </form>
  );
}
