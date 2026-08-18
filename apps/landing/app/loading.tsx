import { PageShell } from "./_components/site-shell";

/**
 * ITEM-0046. Route-level loading state.
 *
 * Announced rather than purely visual: a skeleton that says nothing leaves a
 * screen-reader user on a silent page with no indication anything is happening.
 */
export default function LandingLoading() {
  return (
    <PageShell>
      <section aria-busy="true" aria-live="polite" className="grid gap-6 py-16">
        <p className="sr-only">Loading page content.</p>
        <div
          aria-hidden="true"
          className="h-4 w-40 animate-pulse rounded-full bg-surface-muted"
        />
        <div
          aria-hidden="true"
          className="h-12 w-full max-w-2xl animate-pulse rounded-2xl bg-surface-muted"
        />
        <div
          aria-hidden="true"
          className="h-24 w-full max-w-xl animate-pulse rounded-2xl bg-surface-muted"
        />
      </section>
    </PageShell>
  );
}
