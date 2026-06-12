"use client";

import { Button } from "@/app/components/ui/button";
import { downloadErrorLog } from "@/app/components/errors/download-error-log";

type AccessDeniedStateProps = {
  title?: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  traceId?: string | null;
  statusCode?: number;
  errorCode?: string;
  requestPath?: string;
};

export function AccessDeniedState({
  title = "You do not have access to this area.",
  description = "Your session is valid, but your current role does not include permission for this page or feature.",
  actionHref = "",
  actionLabel = "Back to dashboard",
  traceId,
  statusCode = 403,
  errorCode = "ACCESS_DENIED",
  requestPath,
}: AccessDeniedStateProps) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-10 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Access denied
      </p>

      <h3 className="mt-3 text-2xl font-semibold text-foreground">{title}</h3>

      <p className="mt-3 max-w-3xl text-muted">{description}</p>
      {traceId ? (
        <p className="mt-3 rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted">
          Support reference: <span className="font-mono">{traceId}</span>
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button href={actionHref} variant="secondary">
          {actionLabel}
        </Button>
        {traceId ? (
          <Button
            onClick={() =>
              void downloadErrorLog({
                success: false,
                traceId,
                timestamp: new Date().toISOString(),
                errorCode,
                statusCode,
                message: title,
                description,
                method: "GET",
                path: requestPath,
                browserInfo:
                  typeof navigator === "undefined"
                    ? undefined
                    : navigator.userAgent,
              })
            }
            variant="secondary"
          >
            Download support log
          </Button>
        ) : null}
      </div>
    </section>
  );
}
