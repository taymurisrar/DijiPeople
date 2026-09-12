"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/app/components/ui/button";

/*
 * BUG-3336 — a failed load (a 500, a timeout, a malformed payload) used to
 * render `AccessDeniedState`, the same component shown when the user
 * genuinely lacks the role. Its only action was "Back to settings" and there
 * was no retry, so a transient API failure looked identical to a permissions
 * refusal and sent the tenant admin looking for a role change instead of
 * trying again.
 *
 * This is a distinct, retryable state carrying the trace id. `router.refresh()`
 * re-runs the server component (and its `loadSubscriptionSettingsData` call)
 * without a full navigation.
 */
export function LoadFailureState({
  title = "Unable to load subscription",
  description,
  traceId,
  actionHref = "/settings",
  actionLabel = "Back to settings",
}: {
  title?: string;
  description: string;
  traceId?: string | null;
  actionHref?: string;
  actionLabel?: string;
}) {
  const router = useRouter();

  return (
    <section
      role="alert"
      className="rounded-[24px] border border-danger/20 bg-danger/5 p-10 shadow-sm"
    >
      <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-danger">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Load failed
      </div>

      <h3 className="mt-3 text-2xl font-semibold text-foreground">{title}</h3>

      <p className="mt-3 max-w-3xl text-muted">{description}</p>

      {traceId ? (
        <p className="mt-3 rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted">
          Support reference: <span className="font-mono">{traceId}</span>
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          onClick={() => router.refresh()}
          variant="primary"
          leftIcon={<RefreshCcw className="h-4 w-4" aria-hidden="true" />}
        >
          Retry
        </Button>
        <Button href={actionHref} variant="secondary">
          {actionLabel}
        </Button>
      </div>
    </section>
  );
}
