import type { MetadataRoute } from "next";

import { landingEnv } from "../lib/env";

/**
 * The site origin comes from configuration, not a literal.
 *
 * This previously hardcoded `https://dijipeople.com`, which meant every
 * non-production deployment published a sitemap advertising production URLs —
 * the same class of defect as BUG-0026, where a cross-app URL was decided in
 * the bundle rather than by configuration.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = landingEnv.appOrigin.replace(/\/+$/, "");

  return ["", "/plans", "/features", "/about", "/contact", "/subscribe"].map(
    (path) => ({
      url: `${origin}${path}`,
      changeFrequency: "weekly",
      priority: path ? 0.8 : 1,
    }),
  );
}
