export default function LeaveLoading() {
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-lg">
        <div className="h-4 w-28 animate-pulse rounded bg-surface-strong" />
        <div className="mt-4 h-10 w-72 animate-pulse rounded bg-surface-strong" />
        <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded bg-surface-strong" />
      </section>
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="h-64 animate-pulse rounded-2xl bg-surface-strong" />
      </section>
    </main>
  );
}
