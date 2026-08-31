/*
 * The reporting workspace's loading state.
 *
 * Mandatory per `apps/web/AGENTS.md` ("loading, error and empty states are
 * mandatory for every data surface") and previously absent from this route
 * entirely. It matters more here than on a list screen: an analytics query runs
 * several aggregates and a bucketed trend, so there is a real, visible wait
 * during which the alternative is a blank page that reads as a broken link.
 *
 * The skeleton mirrors the shape of the surface underneath — filter bar, four
 * KPI tiles, a trend, a breakdown — so the layout does not jump when the data
 * lands.
 */
export default function ReportsLoading() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <span className="sr-only" role="status">
        Loading the reporting workspace
      </span>

      <section className="rounded-[22px] border border-border bg-surface p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-xl bg-surface-strong"
            />
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-[22px] border border-border bg-surface"
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-[24px] border border-border bg-surface" />
        <div className="h-80 animate-pulse rounded-[24px] border border-border bg-surface" />
      </div>

      <div className="h-64 animate-pulse rounded-[24px] border border-border bg-surface" />
    </div>
  );
}
