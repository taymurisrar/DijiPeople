"use client";

import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";

/**
 * BUG-3220 (monitoring segment). Covers `monitoring/page.tsx` and every
 * nested route under it that does not define its own `error.tsx`. Before this
 * file existed, a failed server-side fetch on any monitoring page — the exact
 * surface an operator opens *because* something else is broken — fell
 * straight through to Next's generic, unstyled error screen, with no way back
 * into the rest of monitoring short of editing the URL.
 *
 * The trace id shown here is the same "Reference: <traceId>" convention the
 * rest of the admin app already uses for a failed fetch (see the dashboard
 * page's own ad hoc error card) — kept, not reinvented, per AGENTS.md.
 */
export default function MonitoringError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="space-y-5">
      <MonitoringNav current="" />
      <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">
          Monitoring
        </p>
        <h1 className="mt-3 text-xl font-semibold">
          This monitoring page could not load.
        </h1>
        <p className="mt-2 text-sm">{error.message || "Unexpected error."}</p>
        {error.digest ? (
          <p className="mt-1 font-mono text-xs text-rose-600">
            Reference: {error.digest}
          </p>
        ) : null}
        <button
          className="mt-5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800"
          onClick={reset}
          type="button"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
