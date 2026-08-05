"use client";

import { useState } from "react";

export function ActivationForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== data.get("confirmPassword")) {
      setMessage("Passwords do not match.");
      setBusy(false);
      return;
    }
    const response = await fetch("/api/partners/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(payload.message ?? "Unable to activate account.");
      return;
    }
    setSuccess(true);
    setMessage(payload.message);
  }
  return (
    <div className="mx-auto max-w-lg rounded-[28px] border border-border bg-white p-7 shadow-md">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
        Partner portal activation
      </p>
      <h1 className="mt-2 font-serif text-3xl text-foreground">
        Create your secure password
      </h1>
      {success ? (
        <div className="mt-6 rounded-2xl bg-accent-soft p-5 text-sm leading-6 text-accent-strong">
          {message} You can now open the partner portal from the login page.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-foreground">
            Password
            <input
              name="password"
              type="password"
              minLength={12}
              required
              className={control}
            />
          </label>
          <label className="block text-sm font-semibold text-foreground">
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              minLength={12}
              required
              className={control}
            />
          </label>
          <p className="text-xs leading-5 text-muted">
            Use at least 12 characters. A password manager-generated password is
            recommended.
          </p>
          {message ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">
              {message}
            </p>
          ) : null}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Activating…" : "Activate partner account"}
          </button>
        </form>
      )}
    </div>
  );
}
const control =
  "mt-1 h-11 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";
