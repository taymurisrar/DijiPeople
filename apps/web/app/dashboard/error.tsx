"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Home,
  Lock,
  LogIn,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo } from "react";

type DashboardErrorProps = {
  error: Error & {
    digest?: string;
    status?: number;
    statusCode?: number;
    code?: string;
  };
  reset: () => void;
};

type ErrorVariant = "session-expired" | "access-denied" | "not-found" | "api-error" | "unexpected";

type ErrorConfig = {
  variant: ErrorVariant;
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof AlertTriangle;
  toneClassName: string;
  primaryAction: "login" | "retry" | "dashboard";
};

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function getErrorStatus(error: DashboardErrorProps["error"]) {
  return error.status ?? error.statusCode;
}

function classifyDashboardError(error: DashboardErrorProps["error"]): ErrorConfig {
  const message = normalize(error.message);
  const code = normalize(error.code);
  const status = getErrorStatus(error);

  const sessionExpired =
    status === 401 ||
    code.includes("unauthorized") ||
    code.includes("token_expired") ||
    message.includes("access token") ||
    message.includes("refresh token") ||
    message.includes("jwt expired") ||
    message.includes("session expired") ||
    message.includes("invalid or expired") ||
    message.includes("unauthorized");

  if (sessionExpired) {
    return {
      variant: "session-expired",
      eyebrow: "Session expired",
      title: "Your session is no longer valid.",
      description:
        "Please sign in again to continue working safely in your workspace. Any unsaved changes may need to be re-entered.",
      icon: LogIn,
      toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
      primaryAction: "login",
    };
  }

  const accessDenied =
    status === 403 ||
    code.includes("forbidden") ||
    message.includes("forbidden") ||
    message.includes("permission") ||
    message.includes("access denied") ||
    message.includes("not allowed") ||
    message.includes("not authorized");

  if (accessDenied) {
    return {
      variant: "access-denied",
      eyebrow: "Access denied",
      title: "You do not have access to this page.",
      description:
        "Your account is active, but this feature is not available for your current role, permission set, business unit, or tenant scope.",
      icon: Lock,
      toneClassName: "border-red-200 bg-red-50 text-red-700",
      primaryAction: "dashboard",
    };
  }

  const notFound =
    status === 404 ||
    code.includes("not_found") ||
    message.includes("not found") ||
    message.includes("record does not exist");

  if (notFound) {
    return {
      variant: "not-found",
      eyebrow: "Record not found",
      title: "The requested page or record could not be found.",
      description:
        "It may have been deleted, moved, archived, or you may no longer have visibility based on your current access scope.",
      icon: ShieldAlert,
      toneClassName: "border-slate-200 bg-slate-50 text-slate-700",
      primaryAction: "dashboard",
    };
  }

  const apiError =
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("api") ||
    message.includes("timeout");

  if (apiError) {
    return {
      variant: "api-error",
      eyebrow: "Service unavailable",
      title: "The system could not load this page right now.",
      description:
        "This usually happens when the API, database, network, or authentication service is temporarily unavailable.",
      icon: AlertTriangle,
      toneClassName: "border-orange-200 bg-orange-50 text-orange-700",
      primaryAction: "retry",
    };
  }

  return {
    variant: "unexpected",
    eyebrow: "Unexpected error",
    title: "We hit an unexpected problem while loading this page.",
    description:
      "Please try again. If this keeps happening, share the error reference with your administrator or support team.",
    icon: AlertTriangle,
    toneClassName: "border-slate-200 bg-slate-50 text-slate-700",
    primaryAction: "retry",
  };
}

function getCurrentPath() {
  if (typeof window === "undefined") {
    return "/dashboard";
  }

  return `${window.location.pathname}${window.location.search}`;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const config = useMemo(() => classifyDashboardError(error), [error]);
  const Icon = config.icon;

  const errorReference = error.digest ?? error.code ?? undefined;
  const status = getErrorStatus(error);

  useEffect(() => {
    console.error("[DashboardErrorBoundary]", {
      message: error.message,
      name: error.name,
      digest: error.digest,
      code: error.code,
      status,
      stack: error.stack,
    });
  }, [error, status]);

  const loginHref = `/api/auth/logout?reason=${config.variant}&next=${encodeURIComponent(
    getCurrentPath(),
  )}`;

  return (
    <main className="grid min-h-[calc(100vh-180px)] place-items-center gap-6">
      <section className="w-full max-w-4xl overflow-hidden rounded-[32px] border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${config.toneClassName}`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                  {config.eyebrow}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {config.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                  {config.description}
                </p>
              </div>
            </div>

            {status ? (
              <span className="w-fit rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm">
                HTTP {status}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:px-8">
          {errorReference ? (
            <div className="rounded-3xl border border-border bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Error reference
              </p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">
                {errorReference}
              </p>
              <p className="mt-2 text-sm text-muted">
                Share this reference with support if the issue continues.
              </p>
            </div>
          ) : null}

          {config.variant === "access-denied" ? (
            <div className="rounded-3xl border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground">
                What to check
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Confirm the user role, business unit visibility, tenant access,
                feature permissions, and whether the record is assigned or shared
                with the current user.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {config.primaryAction === "login" ? (
              <a
                className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
                href={loginHref}
              >
                <LogIn className="h-4 w-4" />
                Go to sign in
              </a>
            ) : (
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
                onClick={reset}
                type="button"
              >
                <RefreshCcw className="h-4 w-4" />
                Try again
              </button>
            )}

            <Link
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
              href="/dashboard"
            >
              <Home className="h-4 w-4" />
              Back to dashboard
            </Link>

            <button
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
              onClick={() => window.history.back()}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
              Go back
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}