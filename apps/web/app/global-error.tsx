"use client";

import { Button } from "@/app/components/ui/button";
import { downloadErrorLog } from "@/app/components/errors/download-error-log";
import { useEffect } from "react";
import {
  enrichClientError,
  persistClientError,
} from "@/app/components/errors/client-error-log";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const traceId = `client_global_${stableErrorReference(
    error.digest ?? error.message,
  )}`;

  useEffect(() => {
    void persistClientError(
      enrichClientError({
        success: false,
        traceId,
        timestamp: new Date().toISOString(),
        statusCode: 500,
        errorCode: "SYSTEM_UNEXPECTED_ERROR",
        message: error.message || "The app could not load this view.",
        description: "An unexpected client error prevented the application from loading.",
        stack: error.stack,
        details: { digest: error.digest },
        method: "CLIENT",
      }),
    );
  }, [error, traceId]);

  return (
    <html lang="en">
      <body>
        <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-950">
          <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Unexpected error
            </p>

            <h1 className="mt-2 text-2xl font-semibold">
              The app could not load this view.
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Try again. If it keeps happening, share this reference with support.
            </p>

            {error.digest ? (
              <p className="mt-3 break-all font-mono text-xs text-slate-500">
                {error.digest}
              </p>
            ) : null}

            <Button
              className="mt-5"
              onClick={reset}
              type="button"
            >
              Try again
            </Button>
            <Button
              className="mt-5 ml-3"
              onClick={() =>
                void downloadErrorLog({
                  success: false,
                  traceId: error.digest ?? `client_${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  statusCode: 500,
                  errorCode: "SYSTEM_UNEXPECTED_ERROR",
                  message: error.message || "The app could not load this view.",
                  description:
                    "An unexpected client error prevented this view from loading.",
                  stack: error.stack,
                  path:
                    typeof window === "undefined"
                      ? undefined
                      : `${window.location.pathname}${window.location.search}`,
                  method: "CLIENT",
                })
              }
              type="button"
              variant="secondary"
            >
              Download log
            </Button>
          </section>
        </main>
      </body>
    </html>
  );
}

function stableErrorReference(value: string) {
  const normalized = value.replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 100);
  return normalized || "unexpected_error";
}
