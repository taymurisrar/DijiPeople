"use client";

import { Button } from "@/app/components/ui/button";

/*
 * The reporting workspace's error boundary.
 *
 * Shaped after `leaves/error.tsx`, with one difference that matters on this
 * route: the message says what a reporting failure usually *is*. A refused
 * query here is far more often a scope or a period than an outage — a source
 * the caller cannot reach, a metric their role does not carry, a period past
 * the 1,100-day maximum, or a filter naming a field the chosen source does not
 * have — and "something went wrong" sends the reader to support for something
 * they can fix by changing a dropdown.
 *
 * The API's own message is rendered rather than replaced, because the reporting
 * engine's errors are specific and useful ("You do not have access to Desktop
 * activity", "Unknown metric: ...") and flattening them would throw that away.
 */
export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid gap-6">
      <section className="rounded-[24px] border border-danger/20 bg-danger/5 p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-danger">
          Reporting error
        </p>
        <h3 className="mt-3 text-3xl font-semibold text-foreground">
          We could not load this report.
        </h3>
        <p className="mt-3 max-w-2xl text-muted">{error.message}</p>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Reporting requests are refused for specific reasons more often than
          they fail: a data source your role cannot reach, a period longer than
          the 1,100-day maximum, or a filter on a field the selected source does
          not have. Narrowing the period or clearing the filters resolves most
          of them.
        </p>

        {error.digest ? (
          <p className="mt-3 inline-block rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
            Support reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset} variant="primary">
            Try again
          </Button>
          <Button href="/reports" variant="secondary">
            Back to the reporting overview
          </Button>
        </div>
      </section>
    </div>
  );
}
