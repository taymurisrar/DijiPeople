"use client";

import { BrandingHeadEffects } from "./branding-head-effects";

type FaviconSyncProps = {
  faviconUrl?: string | null;
};

export function FaviconSync({ faviconUrl }: FaviconSyncProps) {
  return <BrandingHeadEffects faviconUrl={faviconUrl} />;
}
