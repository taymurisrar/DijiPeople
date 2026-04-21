"use client";

import { useEffect } from "react";

type FaviconSyncProps = {
  faviconUrl?: string | null;
};

export function FaviconSync({ faviconUrl }: FaviconSyncProps) {
  useEffect(() => {
    if (!faviconUrl || typeof document === "undefined") {
      return;
    }

    const head = document.head;
    if (!head) {
      return;
    }

    const relValues = ["icon", "shortcut icon", "apple-touch-icon"];
    const created: HTMLLinkElement[] = [];

    relValues.forEach((relValue) => {
      let link = head.querySelector(
        `link[rel="${relValue}"]`,
      ) as HTMLLinkElement | null;

      if (!link) {
        link = document.createElement("link");
        link.rel = relValue;
        head.appendChild(link);
        created.push(link);
      }

      link.href = faviconUrl;
    });

    return () => {
      created.forEach((link) => {
        if (link.parentElement === head) {
          head.removeChild(link);
        }
      });
    };
  }, [faviconUrl]);

  return null;
}

