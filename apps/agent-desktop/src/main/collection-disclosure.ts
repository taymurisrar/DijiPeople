import type { AgentConfig } from "./types";

/*
 * DP-MASTER/WP-17.S2 (D16, S02). What this app collects, in plain words, derived
 * from the config the server actually sent - never from static copy that could
 * drift from behaviour. Shown to the employee in the tray so nothing here runs
 * invisibly. Keystrokes are never collected, and the line says so.
 */
export function describeCollection(
  config: Pick<AgentConfig, "tracking" | "privacy">,
): string[] {
  const lines: string[] = [];
  if (!config.tracking.enabled) {
    return ["Activity tracking is off for your company."];
  }
  lines.push(
    "Activity: active/idle/away time",
    config.tracking.captureActiveApp
      ? "Application name: collected"
      : "Application name: not collected",
    config.tracking.captureWindowTitle
      ? "Window titles: collected"
      : "Window titles: not collected",
    config.privacy.allowClipboardTracking
      ? "Clipboard: monitored by company security rules"
      : "Clipboard: not collected",
    config.privacy.allowScreenshots
      ? "Screenshots: taken only when a company security rule fires"
      : "Screenshots: not collected",
    "Keystrokes: never collected",
  );
  return lines;
}
