/*
 * Route-group-level loading state for every screen under `(internal)`
 * (BUG-3220). Mirrors `apps/web`'s `(authenticated)/loading.tsx` — one file
 * covers every nested segment that does not declare its own, which is the
 * same low-cost/high-coverage shape already proven there. Sits inside
 * `(internal)/layout.tsx`'s `<AdminShell>`, so the nav and topbar render
 * immediately and only the content area shows this skeleton.
 */
export default function InternalLoading() {
  return (
    <div className="grid gap-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
          <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-200" />
      </div>
      <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-50"
          />
        ))}
      </div>
    </div>
  );
}
