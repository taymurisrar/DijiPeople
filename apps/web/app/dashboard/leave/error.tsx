"use client";

export default function LeaveError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="grid gap-6">
      <section className="rounded-[24px] border border-danger/20 bg-danger/5 p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-danger">
          Leave module error
        </p>
        <h3 className="mt-3 text-3xl font-semibold text-foreground">
          We could not load the leave workspace.
        </h3>
        <p className="mt-3 max-w-2xl text-muted">{error.message}</p>
        <button
          className="mt-6 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
