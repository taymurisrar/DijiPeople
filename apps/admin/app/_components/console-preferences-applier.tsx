"use client";

import { useEffect } from "react";
import {
  applyConsolePreferences,
  watchSystemScheme,
  type ConsolePreferences,
} from "@/lib/console-preferences";

/**
 * Apply the operator's preferences to every page, not just the one that sets
 * them.
 *
 * Mounted once in the authenticated layout and fed from the server, so the
 * attributes are written before the first paint an operator notices rather
 * than after a fetch. Without this, theme and density would apply only while
 * the preferences page happened to be open — which is indistinguishable from
 * the preferences not working, and is what they previously did.
 *
 * Renders nothing. It is a side effect with a component's lifecycle, which is
 * the only way to reach `document` from a server-rendered tree.
 */
export function ConsolePreferencesApplier({
  preferences,
}: {
  preferences: ConsolePreferences;
}) {
  useEffect(() => {
    applyConsolePreferences(preferences);
    /*
     * And keep following the machine while the preference is SYSTEM. Resolving
     * once at mount means a laptop that switches to dark at sunset leaves the
     * console light until the next reload — the setting would be right and the
     * screen wrong, which is the failure this whole applier exists to stop.
     */
    return watchSystemScheme(() => preferences.uiTheme);
  }, [preferences]);

  return null;
}
