import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "./_components/site-shell";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * ITEM-0046 / ITEM-0051. Without this file a bad marketing URL fell through to
 * the framework default, which renders no `main` landmark — so the 404 was the
 * least accessible page on the site, at the point where a visitor is already
 * lost. Routing it through `PageShell` gives it the same shell, landmark and
 * skip-link target as every other page.
 */
export default function NotFound() {
  return (
    <PageShell>
      <section className="grid gap-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          404
        </p>
        <h1 className="max-w-2xl font-serif text-4xl leading-tight text-foreground sm:text-5xl">
          We could not find that page.
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted">
          The link may be out of date, or the address may have a typo. Everything
          below still works.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/"
          >
            Back to home
          </Link>
          <Link
            className="rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            href="/plans"
          >
            View plans
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
