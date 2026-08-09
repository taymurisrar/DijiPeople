"use client";

import { useEffect } from "react";
import {
  applyTheme,
  readStoredThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";

/*
 * Re-asserts the user's theme after hydration, everywhere in the app.
 *
 * The inline script in the root layout sets the theme before paint, but React
 * regenerates the tree from the server HTML whenever hydration fails — and the
 * server HTML has no theme attribute, so the page silently reverts to light.
 * Any DOM-injecting browser extension is enough to trigger that.
 *
 * Renders nothing. It exists to own the one side effect that has to outlive a
 * hydration failure, and it lives in the root layout so it is mounted on every
 * route rather than only where the toggle happens to be.
 */
export function ThemeApplier() {
  useEffect(() => {
    const choice: ThemeChoice = readStoredThemeChoice() ?? "system";
    applyTheme(choice);

    /*
     * React can rewrite the attribute a moment after this effect when it
     * recovers from a mismatch, so the document is watched and corrected
     * rather than set once and trusted.
     */
    const observer = new MutationObserver(() => {
      const expected = readStoredThemeChoice() ?? "system";
      applyTheme(expected);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    /* Keep following the operating system while "System" is selected. */
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if ((readStoredThemeChoice() ?? "system") === "system") {
        applyTheme("system");
      }
    };
    query.addEventListener("change", onSystemChange);

    return () => {
      observer.disconnect();
      query.removeEventListener("change", onSystemChange);
    };
  }, []);

  return null;
}
