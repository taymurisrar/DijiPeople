"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function AdminResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(
    token ? null : "This password reset link is incomplete.",
  );
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token) return setError("This password reset link is incomplete.");
    if (password.length < 12)
      return setError("Password must be at least 12 characters.");
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password))
      return setError("Use uppercase, lowercase, number, and special characters.");
    if (password !== confirmation)
      return setError("The password confirmation does not match.");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        setError(data?.message ?? "Unable to reset the password.");
        return;
      }
      router.replace("/login?reason=password-reset-success");
    } catch {
      setError("Unable to reach the password recovery service.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-50 disabled:bg-slate-50";
  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error}</div> : null}
      <div className="space-y-2">
        <label htmlFor="new-admin-password" className="text-sm font-medium text-slate-900">New password</label>
        <input id="new-admin-password" type="password" autoComplete="new-password" autoFocus value={password} disabled={submitting || !token} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
        <p className="text-xs leading-5 text-slate-500">At least 12 characters with uppercase, lowercase, number, and special character.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="confirm-admin-password" className="text-sm font-medium text-slate-900">Confirm password</label>
        <input id="confirm-admin-password" type="password" autoComplete="new-password" value={confirmation} disabled={submitting || !token} onChange={(event) => setConfirmation(event.target.value)} className={inputClass} />
      </div>
      <button type="submit" disabled={submitting || !token} className="w-full rounded-2xl bg-[#073c34] px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60">
        {submitting ? "Securing account..." : "Reset password"}
      </button>
      <Link href="/login" className="block text-center text-sm font-semibold text-emerald-800 hover:text-emerald-600">Back to sign in</Link>
    </form>
  );
}
