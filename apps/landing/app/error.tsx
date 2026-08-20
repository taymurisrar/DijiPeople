"use client";

import { useEffect } from "react";
import Link from "next/link";

import { PageShell } from "./_components/site-shell";

/**
 * ITEM-0046. Route-level error boundary.
 *
 * Before this existed, an unexpected failure fell through to the framework
 * default, which ships no `lang`, no `<title>` and no `main` landmark — so the
 * worst moment on the site was also its least accessible page. BUG-0061 was the
 * failure that kept reaching it.
 *
 * `reset()` is offered because most of what lands here is transient (a fetch
 * that failed once), and re-rendering the segment is genuinely likely to work.
 * The navigation links are the fallback for when it is not.
 */
export default function LandingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle that ties this render to a server log line.
    console.error("[landing] Route error", error.digest ?? "", error);
  }, [error]);

  return (
    <PageShell>
      <section aria-live="polite" className="grid gap-6 py-16" role="status">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Something went wrong
        </p>
        <h1 className="max-w-2xl font-serif text-4xl leading-tight text-foreground sm:text-5xl">
          This page did not load.
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted">
          The problem is on our side, and it is usually temporary. Try again — if
          it keeps happening, get in touch and we will sort it out.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <Link
            className="rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            href="/"
          >
            Back to home
          </Link>
          <Link
            className="rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            href="/contact"
          >
            Contact us
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
