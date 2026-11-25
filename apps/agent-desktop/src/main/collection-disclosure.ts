import type { AgentConfig } from "./types";

/*
 * DP-MASTER/WP-17.S2 (D16, S02). What this app collects, in plain words, derived
 * from the config the server actually sent - never from static copy that could
 * drift from behaviour. Shown to the employee in the tray so nothing here runs
 * invisibly. Keystrokes are never collected, and the line says so.
 */
/** The employee must acknowledge the current policy before content capture can start. */
export function awaitingAcknowledgement(
  config: Pick<AgentConfig, "dlpConsent">,
): boolean {
  return config.dlpConsent.required && !config.dlpConsent.granted;
}

/** Truthful one-line status for the tray, derived from the synced config. */
export function contentMonitoringLabel(
  config: Pick<AgentConfig, "dlpConsent">,
  captureActive: boolean,
): string {
  if (awaitingAcknowledgement(config)) {
    return "Content monitoring: off until you acknowledge the policy";
  }
  return captureActive
    ? "Content monitoring: ON (clipboard/screenshots)"
    : "Content monitoring: off";
}

export function describeCollection(
  config: Pick<AgentConfig, "tracking" | "privacy" | "dlpConsent">,
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
  if (awaitingAcknowledgement(config)) {
    lines.push("Content capture: waiting for your acknowledgement of the policy");
  }
  return lines;
}
