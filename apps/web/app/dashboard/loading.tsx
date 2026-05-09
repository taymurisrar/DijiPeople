export default function DashboardLoading() {
  return (
    <main className="dp-theme-scope grid gap-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <div className="h-4 w-28 rounded bg-muted/20" />
          <div className="h-8 w-56 rounded bg-muted/20" />
          <div className="h-4 w-96 max-w-full rounded bg-muted/20" />
        </div>
        <div className="h-10 w-24 rounded-xl bg-muted/20" />
      </div>
      <div className="h-20 rounded-xl border border-border bg-surface" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            className="h-36 rounded-xl border border-border bg-surface p-5"
            key={index}
          >
            <div className="h-4 w-32 rounded bg-muted/20" />
            <div className="mt-4 h-9 w-20 rounded bg-muted/20" />
            <div className="mt-4 h-4 w-full rounded bg-muted/20" />
          </div>
        ))}
      </div>
    </main>
  );
}
