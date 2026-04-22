"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoginResponse = {
  message?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "";

const DEFAULT_ADMIN_ROUTE = "/tenants";

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!API_BASE_URL) {
      setError("API base URL is not configured.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          rememberMe,
        }),
      });

      const data = (await response.json()) as LoginResponse;

      if (!response.ok) {
        setError(
          data.message ??
            "We could not sign you in. Check your credentials and try again.",
        );
        return;
      }

      const nextPath = searchParams.get("next") || DEFAULT_ADMIN_ROUTE;
      router.push(nextPath);
    } catch {
      setError(
        "The login request failed. Check that the API is running and reachable.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-900">Email</label>
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@company.com"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-900">Password</label>
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        Remember me
      </label>

      <button
        className="w-full rounded-xl bg-slate-950 px-4 py-2 font-medium text-white disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}