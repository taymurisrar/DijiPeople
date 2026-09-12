"use client";

import { RefreshCcw } from "lucide-react";
import { Button } from "@/app/components/ui/button";

/*
 * BUG-3336 — the subscription routes had no route-level `error.tsx`. This
 * catches a thrown rendering error close to its source; the more common
 * failure mode on this route — `loadSubscriptionSettingsData` catching its
 * own request errors and returning `{ ok: false }` rather than throwing — is
 * handled inside `SubscriptionSettingsPage` via `LoadFailureState`, since a
 * caught error never reaches this boundary.
 */
export default function SubscriptionSettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-danger/20 bg-danger/5 p-6 text-danger">
      <p className="text-sm uppercase tracking-[0.18em]">Subscription Error</p>
      <h3 className="mt-3 text-2xl font-semibold text-foreground">
        We could not load subscription settings.
      </h3>
      <p className="mt-3 text-sm">{error.message}</p>
      {error.digest ? (
        <p className="mt-3 rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted">
          Support reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
      <Button
        onClick={reset}
        variant="primary"
        className="mt-5"
        leftIcon={<RefreshCcw className="h-4 w-4" aria-hidden="true" />}
      >
        Retry
      </Button>
    </div>
  );
}
