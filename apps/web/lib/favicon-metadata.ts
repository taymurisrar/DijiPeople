import type { Metadata } from "next";

export const DEFAULT_FAVICON_HREF = "/favicon.ico";

/**
 * The single source of every favicon href in the app.
 *
 * Server metadata and the client branding effect used to build the `?v=` key
 * from different seeds (tenant id, company display name, or the bare URL), so
 * hydration and each route-group change swapped the icon URL and the browser
 * repainted the tab icon. Seeding only on the favicon URL keeps every call site
 * in agreement; the branded asset route already serves an ETag with
 * `max-age=300`, so a re-uploaded favicon is still picked up.
 */
export function buildFaviconHref(faviconUrl?: string | null): string {
  const value = faviconUrl?.trim() || DEFAULT_FAVICON_HREF;
  const separator = value.includes("?") ? "&" : "?";

  return `${value}${separator}v=${stableHash(value)}`;
}

export function buildFaviconMetadata(
  faviconUrl?: string | null,
): NonNullable<Metadata["icons"]> {
  const href = buildFaviconHref(faviconUrl);

  return {
    icon: href,
    shortcut: href,
    apple: href,
  };
}

function stableHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
