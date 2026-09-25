"use client";

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";
import { describeInternalError } from "./_lib/classify-internal-error";

/*
 * Route-group-level error boundary for every screen under `(internal)`
 * (BUG-3220). Before this, a thrown error anywhere in the platform admin
 * console — 88 `page.tsx` files, none with their own boundary — fell through
 * to Next's unstyled default error screen, with no DijiPeople chrome and no
 * actionable message.
 *
 * This sits inside `(internal)/layout.tsx`'s `<AdminShell>`, so the nav and
 * topbar stay mounted; only the content area is replaced. Do not add a
 * competing boundary under `operations/monitoring` — WP-06 owns that segment
 * and may give it a more specific one, which Next lets override this one.
 */
type InternalErrorProps = {
  error: Error & {
    digest?: string;
    status?: number;
    statusCode?: number;
    code?: string;
    traceId?: string;
  };
  reset: () => void;
};

export default function InternalError({ error, reset }: InternalErrorProps) {
  const { title, description, referenceId } = describeInternalError(error);

  useEffect(() => {
    console.error("[AdminInternalErrorBoundary]", {
      message: error.message,
      digest: error.digest,
      status: error.status ?? error.statusCode,
      code: error.code,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Page error
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        {referenceId ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Error reference
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">
              {referenceId}
            </p>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      </section>
    </div>
  );
}
