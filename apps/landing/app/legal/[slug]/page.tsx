import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "../../_components/site-shell";
import {
  LEGAL_ROUTES,
  fetchLegalDocument,
  isLegalSlug,
  legalRouteTitle,
} from "../../../lib/legal-server";
import { LegalDocumentBody } from "../_components/legal-document-body";

/**
 * One route serving every legal document.
 *
 * The ten documents differ only in content, so ten near-identical page files
 * would be ten places to forget to update. `generateStaticParams` still gives
 * each slug its own build-time entry, so `/privacy` is a real route with real
 * metadata rather than a client-side lookup.
 */
export function generateStaticParams() {
  return LEGAL_ROUTES.map((route) => ({ slug: route.slug }));
}

/**
 * A slug that is not one of the ten is refused by the router, not by the page.
 *
 * `notFound()` below says the same thing and could not deliver it.
 * `app/loading.tsx` puts a Suspense boundary above every route, so Next flushes
 * the shell — with a **200** — before this segment runs. The status can no
 * longer be changed and the not-found UI never replaces the loading fallback,
 * so `/legal/anything` answered `200 OK` and sat on "Loading" forever: a soft
 * 404 that a crawler indexes as a real page and a visitor reads as a hang.
 *
 * Established by experiment rather than inference — with `app/loading.tsx`
 * removed the same URL returns 404 and renders "Page not found"; with it
 * restored and this flag set, it returns 404 and the boundary still serves the
 * routes that want it.
 *
 * `dynamicParams = false` moves the decision to the routing layer, where
 * `generateStaticParams` above already enumerates every legitimate slug. An
 * unknown one is then refused exactly as `/this-page-does-not-exist` is.
 */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  if (!isLegalSlug(slug)) {
    return { title: "Legal" };
  }

  const title = legalRouteTitle(slug);
  const document = await fetchLegalDocument(slug);

  return {
    title,
    description: document
      ? `${title} — version ${document.version}.`
      : `${title} for the DijiPeople platform.`,
    // An unpublished document must not be indexed. A search result leading to
    // "not yet published" is worse than no search result.
    robots: document ? undefined : { index: false, follow: true },
  };
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // An unknown slug is a genuine 404. A known slug whose document is not
  // published is not — the route exists, the text does not yet.
  if (!isLegalSlug(slug)) {
    notFound();
  }

  const title = legalRouteTitle(slug);
  const document = await fetchLegalDocument(slug);

  return (
    <PageShell>
      <article className="mx-auto max-w-3xl py-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Legal
        </p>
        <h1 className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">
          {title}
        </h1>

        {document ? (
          <>
            <p className="mt-3 text-sm text-muted">
              Version {document.version}
              {document.effectiveFrom
                ? ` · in force since ${new Date(document.effectiveFrom).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}`
                : null}
            </p>
            <LegalDocumentBody markdown={document.contentMarkdown} />
          </>
        ) : (
          <NotPublishedYet title={title} />
        )}

        <nav
          aria-label="Other legal documents"
          className="mt-12 border-t border-border pt-6"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
            Other documents
          </h2>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {LEGAL_ROUTES.filter((route) => route.slug !== slug).map((route) => (
              <li key={route.slug}>
                <Link
                  className="inline-flex min-h-[24px] items-center rounded-lg px-1 py-2 text-sm text-muted underline-offset-4 transition hover:text-foreground hover:underline"
                  href={`/legal/${route.slug}`}
                >
                  {route.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </PageShell>
  );
}

/**
 * Shown when the document has no published version.
 *
 * It says what is true and offers the one thing that actually helps — a way to
 * ask. Filling the page with placeholder legal text would be worse than an
 * empty page, because a reader cannot tell placeholder terms from real ones.
 */
function NotPublishedYet({ title }: { title: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-white/70 p-6">
      <h2 className="font-serif text-2xl text-foreground">
        Not published yet
      </h2>
      <p className="mt-3 text-base leading-7 text-muted">
        The {title.toLowerCase()} is drafted but has not been published. We do
        not put legal text on this page before it has been reviewed, and we do
        not fill the gap with a placeholder — a document you cannot rely on is
        worse than one that is honestly absent.
      </p>
      <p className="mt-3 text-base leading-7 text-muted">
        If you need this document before it is published, ask us and we will
        tell you where it stands.
      </p>
      <Link
        className="mt-5 inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white"
        href="/contact"
      >
        Ask about this document
      </Link>
    </div>
  );
}
