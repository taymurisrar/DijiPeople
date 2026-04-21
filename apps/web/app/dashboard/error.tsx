"use client";

import Link from "next/link";
import { useEffect } from "react";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = error.message || "";
  const sessionExpired =
    message.includes("Access token") ||
    message.includes("session expired") ||
    message.includes("invalid or expired");
  const accessDenied =
    !sessionExpired &&
    (message.includes("permission") ||
      message.includes("Forbidden") ||
      message.includes("forbidden") ||
      message.includes("access"));

  if (sessionExpired) {
    const nextPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/dashboard";

    return (
      <main className="grid gap-6">
        <section className="rounded-[24px] border border-border bg-surface p-10 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Session expired
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            Your session is no longer valid.
          </h2>
          <p className="mt-3 max-w-3xl text-muted">
            Please sign in again to continue working safely in your workspace.
          </p>
          <a
            className="mt-6 inline-flex rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href={`/api/auth/logout?reason=session-expired&next=${encodeURIComponent(nextPath)}`}
          >
            Go to sign in
          </a>
        </section>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="grid gap-6">
        <section className="rounded-[24px] border border-border bg-surface p-10 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Access denied
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            You do not have access to this page.
          </h2>
          <p className="mt-3 max-w-3xl text-muted">
            Your account is still active, but this feature is not available for
            your current role or permission set.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
              onClick={reset}
              type="button"
            >
              Try again
            </button>
            <Link
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
              href="/dashboard"
            >
              Back to dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid gap-6">
      <section className="rounded-[24px] border border-border bg-surface p-10 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Something went wrong
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-foreground">
          We hit an unexpected problem while loading this page.
        </h2>
        <p className="mt-3 max-w-3xl text-muted">
          Please try again. If the problem keeps showing up, the API or your
          current session may need attention.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <Link
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
