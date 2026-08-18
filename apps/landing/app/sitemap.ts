import type { MetadataRoute } from "next";

import { landingEnv } from "../lib/env";
import { fetchPublishedLegalIndex } from "../lib/legal-server";

/**
 * The site origin comes from configuration, not a literal.
 *
 * This previously hardcoded `https://dijipeople.com`, which meant every
 * non-production deployment published a sitemap advertising production URLs —
 * the same class of defect as BUG-0026, where a cross-app URL was decided in
 * the bundle rather than by configuration.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = landingEnv.appOrigin.replace(/\/+$/, "");

  const marketing = [
    "",
    "/plans",
    "/features",
    "/about",
    "/contact",
    "/subscribe",
  ];

  /*
   * Only PUBLISHED legal documents are listed.
   *
   * The routes exist regardless — an inbound link to /legal/privacy must not
   * 404 while a version is rotated — but a sitemap is an invitation to index,
   * and inviting a crawler to a page that says "not published yet" earns a
   * search result that helps nobody. The page sets `robots: noindex` while it
   * is empty for the same reason.
   */
  const legal = await fetchPublishedLegalIndex();

  return [
    ...marketing.map((path) => ({
      url: `${origin}${path}`,
      changeFrequency: "weekly" as const,
      priority: path ? 0.8 : 1,
    })),
    ...legal.map((document) => ({
      url: `${origin}/legal/${document.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
