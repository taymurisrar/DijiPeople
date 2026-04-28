"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/auth-config";
import { CheckboxField, TextField } from "@/app/components/ui/form-control";

type LoginPayload = {
  email: string;
  password: string;
  rememberMe: boolean;
};

type LoginFieldErrors = {
  email?: string;
  password?: string;
};

type LoginResponse = {
  message?: string;
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<LoginPayload>({
    email: "",
    password: "",
    rememberMe: false,
  });

  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const authNotice = useMemo(
    () => getAuthNotice(searchParams.get("reason")),
    [searchParams],
  );

  function validateForm(values: LoginPayload) {
    const nextErrors: LoginFieldErrors = {};
    const email = values.email.trim();
    const password = values.password;

    if (!email) {
      nextErrors.email = "Work email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    return nextErrors;
  }

  function updateField<K extends keyof LoginPayload>(
    key: K,
    value: LoginPayload[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    setFieldErrors((current) => ({
      ...current,
      [key]: undefined,
    }));

    if (error) {
      setError(null);
    }
  }

async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  setError(null);

  const validationErrors = validateForm(form);
  setFieldErrors(validationErrors);

  if (Object.keys(validationErrors).length > 0) {
    return;
  }

  setIsSubmitting(true);

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        rememberMe: form.rememberMe,
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

    const nextPath =
      searchParams.get("next") || DEFAULT_AUTHENTICATED_ROUTE;
    const nextUrl = resolveNextUrl(nextPath);

    if (!nextUrl) {
      router.push(DEFAULT_AUTHENTICATED_ROUTE);
      return;
    }

    const currentOrigin = window.location.origin;
    const nextPathnameWithQuery = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    const isLoginRoute =
      nextUrl.pathname === "/login" || nextUrl.pathname.startsWith("/login/");

    if (nextUrl.origin === currentOrigin) {
      router.push(
        isLoginRoute
          ? DEFAULT_AUTHENTICATED_ROUTE
          : nextPathnameWithQuery || DEFAULT_AUTHENTICATED_ROUTE,
      );
      return;
    }

    window.location.assign(nextUrl.toString());
  } catch {
    setError(
      "The login request failed. Check that the web app and API are running.",
    );
  } finally {
    setIsSubmitting(false);
  }
}

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      {authNotice ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {authNotice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block space-y-2 text-sm">
          <span className="flex items-center gap-1 font-medium text-foreground">
            Work email
          </span>
          <input
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            className="block w-full min-w-0 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
            inputMode="email"
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="you@company.com"
            spellCheck={false}
            type="email"
            value={form.email}
          />
        </label>
        {fieldErrors.email ? (
          <p className="text-sm text-red-600">{fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground">
            Password
          </span>
<span className="text-sm font-medium text-muted">
  Forgot password?
</span>
        </div>

        <div className="relative">
          <TextField
            label=""
            placeholder="Enter your password"
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(value) => updateField("password", value)}
            className="[&>span]:hidden"
          />

          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-[calc(50%+2px)] -translate-y-1/2 rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground"
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        {fieldErrors.password ? (
          <p className="text-sm text-red-600">{fieldErrors.password}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="max-w-max">
          <CheckboxField
            checked={form.rememberMe}
            label="Remember me"
            onChange={(checked) => updateField("rememberMe", checked)}
          />
        </div>

        <Link
          className="text-sm text-muted transition hover:text-foreground"
          href="/activate-account"
        >
          Activate account
        </Link>
      </div>

      <button
        className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

function resolveNextUrl(rawNext: string) {
  const nextValue = rawNext.trim();
  if (!nextValue) {
    return null;
  }

  try {
    return new URL(nextValue, window.location.origin);
  } catch {
    return null;
  }
}

function getAuthNotice(reason: string | null) {
  if (reason === "session-expired") {
    return "Your session expired. Please sign in again to continue.";
  }

  if (reason === "signed-out") {
    return "You have been signed out successfully.";
  }

  if (reason === "password-reset-success") {
    return "Your password was reset successfully. Sign in with your new password.";
  }

  return null;
}
