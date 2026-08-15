"use client";

import { useMemo, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";

/**
 * The rules the API enforces, restated so they can be shown while typing.
 *
 * Deliberately a mirror rather than the authority: `ChangePlatformPasswordDto`
 * decides. Showing them live is the difference between a person choosing a
 * password that works and guessing at variations of one that does not.
 */
const RULES = [
  { key: "length", label: "At least 12 characters", test: (v: string) => v.length >= 12 },
  { key: "lower", label: "A lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { key: "upper", label: "An uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { key: "number", label: "A number", test: (v: string) => /[0-9]/.test(v) },
] as const;

type FieldError = { field?: string; message: string };

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const ruleState = useMemo(
    () => RULES.map((rule) => ({ ...rule, met: rule.test(newPassword) })),
    [newPassword],
  );
  const allRulesMet = ruleState.every((rule) => rule.met);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const reused = newPassword.length > 0 && newPassword === currentPassword;
  const canSubmit =
    Boolean(currentPassword) && allRulesMet && matches && !reused && !busy;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/platform-users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          signOutOtherSessions: signOutOthers,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const envelope = (payload ?? {}) as {
          message?: unknown;
          fieldErrors?: FieldError[];
        };
        /*
         * The global validation pipe returns `message` as an array of rule
         * failures. Joining them keeps every unmet rule visible instead of
         * showing "[object Object]" or only the first.
         */
        setError(
          Array.isArray(envelope.message)
            ? (envelope.message as string[]).join(" ")
            : typeof envelope.message === "string" && envelope.message
              ? envelope.message
              : "The password could not be changed.",
        );
        return;
      }

      const result = (payload ?? {}) as { message?: string };
      setSuccess(result.message ?? "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Unable to reach the account security service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Current password"
          autoComplete="current-password"
          reveal={reveal}
          value={currentPassword}
          onChange={setCurrentPassword}
          onToggleReveal={() => setReveal((value) => !value)}
        />
        <div className="hidden sm:block" aria-hidden />
        <Field
          label="New password"
          autoComplete="new-password"
          reveal={reveal}
          value={newPassword}
          onChange={setNewPassword}
        />
        <Field
          label="Confirm new password"
          autoComplete="new-password"
          reveal={reveal}
          value={confirmPassword}
          onChange={setConfirmPassword}
          hint={
            confirmPassword.length > 0 && !matches
              ? "The two entries do not match."
              : undefined
          }
          invalid={confirmPassword.length > 0 && !matches}
        />
      </div>

      <ul className="grid gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
        {ruleState.map((rule) => (
          <li
            key={rule.key}
            className={`flex items-center gap-2 text-xs ${
              rule.met ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            {rule.met ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300"
                aria-hidden
              />
            )}
            {rule.label}
          </li>
        ))}
      </ul>

      {reused ? (
        <p className="text-xs font-medium text-amber-700">
          The new password must be different from your current one.
        </p>
      ) : null}

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={signOutOthers}
          onChange={(event) => setSignOutOthers(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--admin-primary)]"
        />
        <span>
          <span className="block font-medium text-slate-900">
            Sign out my other sessions
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Recommended. The usual reason to change a password is that someone
            else may know the old one, and their session stays live otherwise.
            This session stays signed in.
          </span>
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {success}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Updating…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
  reveal,
  onToggleReveal,
  hint,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  reveal: boolean;
  onToggleReveal?: () => void;
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <span className="relative block">
        <input
          required
          type={reveal ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`h-11 w-full rounded-xl border bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:ring-4 focus:ring-slate-900/5 ${
            invalid
              ? "border-rose-300 focus:border-rose-400"
              : "border-slate-200 focus:border-slate-400"
          } ${onToggleReveal ? "pr-11" : ""}`}
        />
        {onToggleReveal ? (
          <button
            type="button"
            onClick={onToggleReveal}
            aria-label={reveal ? "Hide passwords" : "Show passwords"}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
          >
            {reveal ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </span>
      {hint ? (
        <span className="flex items-center gap-1 font-normal normal-case tracking-normal text-rose-700">
          <X className="h-3 w-3" aria-hidden />
          {hint}
        </span>
      ) : null}
    </label>
  );
}
