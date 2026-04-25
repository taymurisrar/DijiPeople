"use client";

import { useEffect } from "react";
import { BrandingFontKey, getFontOptionByKey } from "@/lib/branding";

type TenantFontSyncProps = {
  fontFamily: BrandingFontKey;
};

export function TenantFontSync({ fontFamily }: TenantFontSyncProps) {
  useEffect(() => {
    const fontStack = getFontOptionByKey(fontFamily).stack;
    document.documentElement.style.setProperty("--dp-font-family", fontStack);
  }, [fontFamily]);

  return null;
}

