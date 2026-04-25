"use client";

import { useEffect } from "react";
import { DEFAULT_BRANDING_VALUES } from "./branding-defaults";

type BrandingHeadEffectsProps = {
  faviconUrl?: string | null;
  title?: string | null;
};

export function BrandingHeadEffects({
  faviconUrl,
  title,
}: BrandingHeadEffectsProps) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const nextTitle =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : DEFAULT_BRANDING_VALUES.appTitle;
    document.title = nextTitle;
  }, [title]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const normalizedUrl =
      typeof faviconUrl === "string" && faviconUrl.trim().length > 0
        ? faviconUrl.trim()
        : null;

    const head = document.head;
    if (!head) {
      return;
    }

    const relValues = ["icon", "shortcut icon", "apple-touch-icon"];
    const createdLinks: HTMLLinkElement[] = [];

    relValues.forEach((relValue) => {
      let link = head.querySelector(
        `link[rel="${relValue}"]`,
      ) as HTMLLinkElement | null;

      if (!link) {
        link = document.createElement("link");
        link.rel = relValue;
        head.appendChild(link);
        createdLinks.push(link);
      }

      if (normalizedUrl) {
        link.href = normalizedUrl;
      } else {
        link.removeAttribute("href");
      }
    });

    return () => {
      createdLinks.forEach((link) => {
        if (link.parentElement === head) {
          head.removeChild(link);
        }
      });
    };
  }, [faviconUrl]);

  return null;
}

