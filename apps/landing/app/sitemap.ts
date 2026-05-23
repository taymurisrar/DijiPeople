import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/plans", "/features", "/about", "/contact", "/subscribe"].map(
    (path) => ({
      url: `https://dijipeople.com${path}`,
      changeFrequency: "weekly",
      priority: path ? 0.8 : 1,
    }),
  );
}
