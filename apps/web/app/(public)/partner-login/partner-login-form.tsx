"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function PartnerLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null); const data = new FormData(event.currentTarget);
    startTransition(async () => { const response = await fetch("/api/partner/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }); const payload = await response.json().catch(() => null); if (!response.ok) { setMessage(payload?.message ?? "Unable to sign in."); return; } router.replace(params.get("returnTo") || "/partner"); router.refresh(); });
  }
  return <form onSubmit={submit} className="w-full space-y-5"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Partner portal</p><h2 className="mt-2 text-3xl font-semibold text-slate-950">Sign in</h2><p className="mt-2 text-sm text-slate-500">Use the account activated for your partner organization.</p></div><label className="grid gap-2 text-sm font-semibold text-slate-700">Email<input name="email" required type="email" autoComplete="email" className="h-12 rounded-xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label><label className="grid gap-2 text-sm font-semibold text-slate-700">Password<input name="password" required type="password" autoComplete="current-password" className="h-12 rounded-xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>{message ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{message}</p> : null}<button disabled={pending} className="h-12 w-full rounded-xl bg-blue-700 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">{pending ? "Signing in…" : "Sign in securely"}</button><a href="http://localhost:3000/partners" className="block text-center text-sm font-semibold text-blue-700">Interested in becoming a partner?</a></form>;
}
