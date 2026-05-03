import { powerMonitor } from "electron";
import type { AgentConfig, AgentState, HeartbeatEvent } from "./types";

const MAX_IDLE_SECONDS = 24 * 60 * 60;
const MAX_TEXT_LENGTH = 300;

type BuildHeartbeatInput = {
  config: AgentConfig;
  sessionId: string;
  deviceId: string;
  agentVersion: string;
};

type ActiveWindowSnapshot = {
  appName: string | null;
  appPath: string | null;
  windowTitle: string | null;
  browserTabTitle: string | null;
  processId: number | null;
};

const BROWSER_APP_NAMES = [
  "chrome",
  "google chrome",
  "msedge",
  "microsoft edge",
  "firefox",
  "mozilla firefox",
  "brave",
  "brave browser",
  "opera",
  "safari",
];

const BROWSER_TITLE_SUFFIXES = [
  " - Google Chrome",
  " - Microsoft Edge",
  " - Mozilla Firefox",
  " - Brave",
  " - Opera",
  " - Safari",
];

export class ActivityTracker {
  async buildHeartbeat(input: BuildHeartbeatInput): Promise<HeartbeatEvent> {
    this.validateInput(input);

    const tracking = input.config.tracking;
    const idleSeconds = this.getSafeIdleSeconds();

    const state = this.resolveAgentState({
      idleSeconds,
      idleThresholdSeconds: tracking.idleThresholdSeconds,
      awayThresholdSeconds: tracking.awayThresholdSeconds,
      trackingEnabled: tracking.enabled,
    });

    const activeWindow = await this.resolveActiveWindow(input.config);

    return {
      sessionId: input.sessionId.trim(),
      deviceId: input.deviceId.trim(),
      state,
      idleSeconds,
      activeApp: activeWindow.appName,
      windowTitle: activeWindow.windowTitle,
      activeAppPath: activeWindow.appPath,
      browserTabTitle: activeWindow.browserTabTitle,
      activeProcessId: activeWindow.processId,
      agentVersion: input.agentVersion.trim(),
      occurredAt: new Date().toISOString(),
    };
  }

  private resolveAgentState(input: {
    idleSeconds: number;
    idleThresholdSeconds: number;
    awayThresholdSeconds: number;
    trackingEnabled: boolean;
  }): AgentState {
    if (!input.trackingEnabled) {
      return "AWAY";
    }

    const idleThresholdSeconds = this.normalizeThreshold(
      input.idleThresholdSeconds,
      60,
    );

    const awayThresholdSeconds = this.normalizeThreshold(
      input.awayThresholdSeconds,
      300,
    );

    const safeAwayThresholdSeconds = Math.max(
      awayThresholdSeconds,
      idleThresholdSeconds,
    );

    if (input.idleSeconds >= safeAwayThresholdSeconds) {
      return "AWAY";
    }

    if (input.idleSeconds >= idleThresholdSeconds) {
      return "IDLE";
    }

    return "ACTIVE";
  }

  private getSafeIdleSeconds(): number {
    try {
      const idleSeconds = powerMonitor.getSystemIdleTime();

      if (!Number.isFinite(idleSeconds) || idleSeconds < 0) {
        return 0;
      }

      return Math.min(Math.floor(idleSeconds), MAX_IDLE_SECONDS);
    } catch {
      return 0;
    }
  }

  private async resolveActiveWindow(
    config: AgentConfig,
  ): Promise<ActiveWindowSnapshot> {
    const emptySnapshot: ActiveWindowSnapshot = {
      appName: null,
      appPath: null,
      windowTitle: null,
      browserTabTitle: null,
      processId: null,
    };

    if (!config.tracking.enabled) {
      return emptySnapshot;
    }

    const shouldCaptureActiveApp =
      config.features.activeAppTracking && config.tracking.captureActiveApp;

    const shouldCaptureWindowTitle =
      config.features.windowTitleTracking && config.tracking.captureWindowTitle;

    if (!shouldCaptureActiveApp && !shouldCaptureWindowTitle) {
      return emptySnapshot;
    }

    try {
      const { default: activeWin } = await import("active-win");
      const activeWindow = await activeWin();

      if (!activeWindow) {
        return emptySnapshot;
      }

      const appName = shouldCaptureActiveApp
        ? this.sanitizeText(activeWindow.owner?.name)
        : null;

      const appPath = shouldCaptureActiveApp
        ? this.sanitizeText(activeWindow.owner?.path)
        : null;

      const windowTitle = shouldCaptureWindowTitle
        ? this.sanitizeText(activeWindow.title)
        : null;

      const rawProcessId = activeWindow.owner?.processId;
      const processId =
        shouldCaptureActiveApp &&
        typeof rawProcessId === "number" &&
        Number.isFinite(rawProcessId) &&
        rawProcessId > 0
          ? Math.floor(rawProcessId)
          : null;

      return {
        appName,
        appPath,
        windowTitle,
        browserTabTitle: this.resolveBrowserTabTitle(appName, windowTitle),
        processId,
      };
    } catch {
      return emptySnapshot;
    }
  }

  private resolveBrowserTabTitle(
    appName: string | null,
    windowTitle: string | null,
  ): string | null {
    if (!this.isBrowserApp(appName) || !windowTitle) {
      return null;
    }

    let title = windowTitle.trim();

    for (const suffix of BROWSER_TITLE_SUFFIXES) {
      if (title.toLowerCase().endsWith(suffix.toLowerCase())) {
        title = title.slice(0, -suffix.length).trim();
        break;
      }
    }

    return this.sanitizeText(title);
  }

  private isBrowserApp(appName: string | null): boolean {
    if (!appName) {
      return false;
    }

    const normalizedAppName = appName.toLowerCase();

    return BROWSER_APP_NAMES.some((browserName) =>
      normalizedAppName.includes(browserName),
    );
  }

  private validateInput(input: BuildHeartbeatInput): void {
    if (!input.sessionId?.trim()) {
      throw new Error("Cannot build heartbeat without a valid session id.");
    }

    if (!input.deviceId?.trim()) {
      throw new Error("Cannot build heartbeat without a valid device id.");
    }

    if (!input.agentVersion?.trim()) {
      throw new Error("Cannot build heartbeat without a valid agent version.");
    }

    this.validateConfig(input.config);
  }

  private validateConfig(config: AgentConfig): void {
    if (!config) {
      throw new Error("Cannot build heartbeat without agent configuration.");
    }

    const idleThreshold = config.tracking?.idleThresholdSeconds;
    const awayThreshold = config.tracking?.awayThresholdSeconds;

    if (!Number.isFinite(idleThreshold) || idleThreshold <= 0) {
      throw new Error("Invalid idle threshold configuration.");
    }

    if (!Number.isFinite(awayThreshold) || awayThreshold <= 0) {
      throw new Error("Invalid away threshold configuration.");
    }

    if (awayThreshold < idleThreshold) {
      throw new Error(
        "Invalid tracking configuration: away threshold must be greater than or equal to idle threshold.",
      );
    }
  }

  private normalizeThreshold(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return Math.floor(value);
  }

  protected sanitizeText(value: string | null | undefined): string | null {
    if (!value?.trim()) {
      return null;
    }

    return value.trim().slice(0, MAX_TEXT_LENGTH);
  }
}