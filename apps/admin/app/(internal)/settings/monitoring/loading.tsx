/**
 * BUG-3220 (monitoring segment). Every monitoring page — this one, error
 * logs, events, integrations, and now health — fetches from the API on the
 * server before rendering. Without this boundary, a slow API left the
 * browser on a blank tab with no chrome until the fetch resolved; Next's
 * unstyled default was the only fallback anywhere in `apps/admin`. This
 * segment-level file covers `monitoring/page.tsx` and every nested route
 * under it (`error-logs`, `events`, `integrations`) that does not define its
 * own.
 */
export default function MonitoringLoading() {
  return (
    <main className="space-y-5">
      <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-11 w-full max-w-md animate-pulse rounded-xl bg-slate-100" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-[24px] border border-slate-200 bg-slate-50" />
    </main>
  );
}
