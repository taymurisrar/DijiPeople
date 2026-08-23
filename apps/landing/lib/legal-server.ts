import { unstable_rethrow } from "next/navigation";

import { landingEnv } from "./env";

/**
 * Published legal documents, resolved server-side.
 *
 * The site never decides what its own terms say. It asks the API, which serves
 * the version currently in force for the visitor's market — or nothing, if no
 * version has been published.
 *
 * "Nothing" is a real and expected answer here, not an error. Documents are
 * drafted first and published deliberately, so an unpublished document is the
 * normal state before launch. The page says so plainly rather than inventing
 * placeholder terms, and the footer links only to what actually exists.
 */

/** A server component awaiting a hung fetch blocks the render — BUG-0061. */
const LEGAL_TIMEOUT_MS = 4000;

export type LegalDocumentView = {
  slug: string;
  title: string;
  version: number;
  contentMarkdown: string;
  effectiveFrom: string;
  publishedAt: string | null;
};

export type LegalIndexEntry = {
  slug: string;
  title: string;
  version: number;
  /**
   * The published version being shown, so an acceptance can name it.
   *
   * Null when the API supplied none, and a document without it is never offered
   * as something to accept: an acknowledgement that cannot say *which* text was
   * agreed to is not evidence, which is why the API takes version ids rather
   * than a boolean.
   */
  versionId: string | null;
};

/**
 * Every legal route the site exposes, with the copy shown while a document is
 * unpublished.
 *
 * The route list is deliberately static rather than derived from what is
 * published: a URL that 404s the moment its document is unpublished would break
 * inbound links and search results every time a version is rotated. The route
 * always exists; the content is what varies.
 */
export const LEGAL_ROUTES = [
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "terms", title: "Terms of Service" },
  { slug: "billing-terms", title: "Subscription and Billing Terms" },
  { slug: "refund-policy", title: "Refund and Cancellation Policy" },
  { slug: "cookie-policy", title: "Cookie Policy" },
  { slug: "acceptable-use", title: "Acceptable Use Policy" },
  { slug: "security", title: "Security" },
  { slug: "subprocessors", title: "Subprocessors" },
  { slug: "data-retention", title: "Data Retention Policy" },
  { slug: "dpa", title: "Data Processing Addendum" },
] as const;

export type LegalSlug = (typeof LEGAL_ROUTES)[number]["slug"];

export function isLegalSlug(value: string): value is LegalSlug {
  return LEGAL_ROUTES.some((route) => route.slug === value);
}

export function legalRouteTitle(slug: string): string {
  return LEGAL_ROUTES.find((route) => route.slug === slug)?.title ?? "Legal";
}

/**
 * The published version of one document, or null.
 *
 * Null covers both "nothing published" and "the API is unreachable". The page
 * renders the same honest message for both, because from a reader's point of
 * view they are the same situation: there is no text to show, and inventing
 * some would be worse than saying so.
 */
export async function fetchLegalDocument(
  slug: string,
): Promise<LegalDocumentView | null> {
  try {
    const response = await fetch(
      `${landingEnv.apiBaseUrl}/public/legal/${encodeURIComponent(slug)}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(LEGAL_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      return null;
    }

    const raw = (await response.json()) as Partial<LegalDocumentView> | null;

    if (!raw || typeof raw.contentMarkdown !== "string") {
      return null;
    }

    return {
      slug: raw.slug ?? slug,
      title: raw.title ?? legalRouteTitle(slug),
      version: typeof raw.version === "number" ? raw.version : 1,
      contentMarkdown: raw.contentMarkdown,
      effectiveFrom: raw.effectiveFrom ?? "",
      publishedAt: raw.publishedAt ?? null,
    };
  } catch (error) {
    // Next's control-flow errors must not be absorbed by a network catch.
    unstable_rethrow(error);
    return null;
  }
}

/**
 * Which documents are actually published.
 *
 * The footer renders from this, so a market with nothing published shows no
 * legal links at all rather than a column of links to pages that have to
 * apologise for themselves.
 */
export async function fetchPublishedLegalIndex(): Promise<LegalIndexEntry[]> {
  try {
    const response = await fetch(`${landingEnv.apiBaseUrl}/public/legal`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(LEGAL_TIMEOUT_MS),
    });

    if (!response.ok) {
      return [];
    }

    const raw = (await response.json()) as { documents?: unknown } | null;
    const documents = Array.isArray(raw?.documents) ? raw.documents : [];

    return documents.flatMap((entry): LegalIndexEntry[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const record = entry as Record<string, unknown>;
      const slug = typeof record.slug === "string" ? record.slug : null;
      if (!slug) return [];
      return [
        {
          slug,
          title:
            typeof record.title === "string"
              ? record.title
              : legalRouteTitle(slug),
          version: typeof record.version === "number" ? record.version : 1,
          versionId:
            typeof record.versionId === "string" ? record.versionId : null,
        },
      ];
    });
  } catch (error) {
    unstable_rethrow(error);
    return [];
  }
}

/**
 * The published Privacy Policy's route, or null if none is published.
 *
 * Both public forms carry a consent notice written around a link to it, and
 * both rendered `privacyPolicyHref` as `null` because neither page ever passed
 * one — so the notice read "We'll use these details to reply to you." with
 * nothing to read. Asking for consent while withholding the document the
 * consent refers to is the one thing that notice exists to avoid.
 *
 * Null when nothing is published rather than a hardcoded `/legal/privacy`: the
 * route renders whether or not a document is behind it, and linking to a page
 * that says "not published yet" from a consent notice is worse than the notice
 * standing alone.
 */
export async function fetchPrivacyPolicyHref(): Promise<string | null> {
  const documents = await fetchPublishedLegalIndex();
  const privacy = documents.find((entry) => entry.slug === "privacy");
  return privacy ? `/legal/${privacy.slug}` : null;
}
