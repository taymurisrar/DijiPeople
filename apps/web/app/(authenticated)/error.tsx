"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Home,
  Download,
  Lock,
  LogIn,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import { Button } from "@/app/components/ui/button";
import { downloadErrorLog } from "@/app/components/errors/download-error-log";
import {
  enrichClientError,
  persistClientError,
} from "@/app/components/errors/client-error-log";
import {
  classifyDashboardError,
  getDashboardErrorStatus,
  type DashboardErrorVariant,
} from "./_lib/classify-dashboard-error";

type DashboardErrorProps = {
  error: Error & {
    digest?: string;
    status?: number;
    statusCode?: number;
    code?: string;
  };
  reset: () => void;
};

/*
 * Variant -> icon. The classification itself lives in `_lib/classify-dashboard-error`
 * so it can be unit-tested without jsdom; only the icon needs React. BUG-2013.
 */
const VARIANT_ICONS: Record<DashboardErrorVariant, typeof AlertTriangle> = {
  "session-expired": LogIn,
  "access-denied": Lock,
  "not-found": ShieldAlert,
  "api-error": AlertTriangle,
  "server-error": AlertTriangle,
  unexpected: AlertTriangle,
};

function getCurrentPath() {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.pathname}${window.location.search}`;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const config = useMemo(() => classifyDashboardError(error), [error]);
  const Icon = VARIANT_ICONS[config.variant];

  const errorReference = error.digest ?? error.code ?? undefined;
  const clientTraceId = `client_boundary_${stableErrorReference(
    error.digest ?? error.code ?? error.message,
  )}`;
  const status = getDashboardErrorStatus(error);

  useEffect(() => {
    console.error("[DashboardErrorBoundary]", {
      message: error.message,
      name: error.name,
      digest: error.digest,
      code: error.code,
      status,
      stack: error.stack,
    });
    void persistClientError(
      enrichClientError({
        success: false,
        traceId: clientTraceId,
        timestamp: new Date().toISOString(),
        statusCode: status ?? 500,
        errorCode: error.code ?? "SYSTEM_UNEXPECTED_ERROR",
        message: error.message || config.title,
        description: config.description,
        stack: error.stack,
        details: { digest: error.digest },
        path: getCurrentPath(),
        method: "CLIENT",
      }),
    );
  }, [clientTraceId, config.description, config.title, error, status]);

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
              <Button
                href={loginHref}
                leftIcon={<LogIn className="h-4 w-4" />}
              >
                Go to sign in
              </Button>
            ) : (
              <Button
                onClick={reset}
                type="button"
                leftIcon={<RefreshCcw className="h-4 w-4" />}
              >
                Try again
              </Button>
            )}

            <Button
              href="/"
              variant="secondary"
              leftIcon={<Home className="h-4 w-4" />}
            >
              Back to dashboard
            </Button>

            <Button
              variant="secondary"
              onClick={() => window.history.back()}
              type="button"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Go back
            </Button>

            <Button
              variant="secondary"
              onClick={() =>
                void downloadErrorLog({
                  success: false,
                  traceId:
                    errorReference ??
                    `client_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                  timestamp: new Date().toISOString(),
                  statusCode: status ?? 500,
                  errorCode: error.code ?? "SYSTEM_UNEXPECTED_ERROR",
                  message: error.message || config.title,
                  description: config.description,
                  stack: error.stack,
                  path: getCurrentPath(),
                  method: "CLIENT",
                })
              }
              type="button"
              leftIcon={<Download className="h-4 w-4" />}
            >
              Download log
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function stableErrorReference(value: string) {
  const normalized = value.replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 100);
  return normalized || "unexpected_error";
}
