import type { Metadata } from "next";

const DEFAULT_FAVICON_HREF = "/favicon.svg";

export function buildFaviconMetadata(
  faviconUrl?: string | null,
  cacheSeed?: string | null,
): NonNullable<Metadata["icons"]> {
  const href = withFaviconCacheKey(faviconUrl || DEFAULT_FAVICON_HREF, cacheSeed);

  return {
    icon: href,
    shortcut: href,
    apple: href,
  };
}

function withFaviconCacheKey(value: string, cacheSeed?: string | null) {
  const seed = cacheSeed?.trim() || value;
  const version = stableHash(seed);
  const separator = value.includes("?") ? "&" : "?";

  return `${value}${separator}v=${version}`;
}

function stableHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
