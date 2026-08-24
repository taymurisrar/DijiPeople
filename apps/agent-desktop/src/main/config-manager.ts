import type { AgentConfig, DlpConfig, DlpRuleConfig } from "./types";
import { ApiClient } from "./api-client";
import { agentEnv } from "../config/env";

const MIN_HEARTBEAT_SECONDS = 10;
const MAX_HEARTBEAT_SECONDS = 3600;
const MAX_HEARTBEAT_BATCH_SIZE = 1000;

// DLP capture bounds. The clipboard is polled no faster than every two seconds
// (a tighter loop wakes the machine for no benefit) and no slower than once a
// minute (beyond that a copy-then-paste can slip between samples). The default
// keeps at most 1 MB of clipboard text per sample; a larger paste is recorded by
// metadata only. `MAX_DLP_RULES` bounds a hostile or fat-fingered config.
const MIN_CLIPBOARD_POLL_SECONDS = 2;
const MAX_CLIPBOARD_POLL_SECONDS = 60;
const DEFAULT_CLIPBOARD_POLL_SECONDS = 5;
const MIN_CLIPBOARD_BYTES = 1024;
const MAX_CLIPBOARD_BYTES = 5 * 1024 * 1024;
const DEFAULT_CLIPBOARD_BYTES = 1024 * 1024;
const MIN_TRIGGER_WINDOW_SECONDS = 5;
const MAX_TRIGGER_WINDOW_SECONDS = 600;
const DEFAULT_TRIGGER_WINDOW_SECONDS = 30;
const MAX_DLP_RULES = 200;

const DEFAULT_DLP_CONFIG: DlpConfig = {
  clipboardCaptureEnabled: false,
  screenshotCaptureEnabled: false,
  clipboardFullContent: false,
  clipboardPollIntervalSeconds: DEFAULT_CLIPBOARD_POLL_SECONDS,
  maxClipboardBytes: DEFAULT_CLIPBOARD_BYTES,
  triggerWindowSeconds: DEFAULT_TRIGGER_WINDOW_SECONDS,
  rules: [],
};

export const DEFAULT_CONFIG: AgentConfig = {
  agentVersionPolicy: {
    minimumSupportedVersion: agentEnv.appVersion,
    latestVersion: agentEnv.appVersion,
    forceUpdate: false,
    updateMessage: null,
  },

  policy: {
    mandatory: false,
    allowUserQuit: true,
  },

  tracking: {
    enabled: true,
    heartbeatIntervalSeconds: agentEnv.heartbeatIntervalSeconds,
    idleThresholdSeconds: agentEnv.idleThresholdSeconds,
    awayThresholdSeconds: agentEnv.awayThresholdSeconds,
    captureActiveApp: agentEnv.activeAppTrackingEnabled,
    captureWindowTitle: agentEnv.windowTitleTrackingEnabled,
  },

  privacy: {
    allowScreenshots: false,
    allowClipboardTracking: false,
    allowKeylogging: false,
    allowCameraAccess: false,
    allowMicrophoneAccess: false,
    allowLocationAccess: false,
  },

  api: {
    heartbeatBatchSize: agentEnv.heartbeatBatchSize,
    offlineQueueEnabled: agentEnv.offlineQueueEnabled,
  },

  features: {
    activeAppTracking: agentEnv.activeAppTrackingEnabled,
    windowTitleTracking: agentEnv.windowTitleTrackingEnabled,
    offlineQueue: agentEnv.offlineQueueEnabled,
    autoUpdate: agentEnv.autoUpdateEnabled,
    trayStatus: agentEnv.trayStatusEnabled,
    cameraAccess: false,
    microphoneAccess: false,
    locationAccess: false,
  },

  dlp: DEFAULT_DLP_CONFIG,
};

export class ConfigManager {
  current: AgentConfig = DEFAULT_CONFIG;
  lastConfigSync: Date | null = null;

  private isRefreshing = false;

  constructor(private readonly apiClient: ApiClient) {}

  async refresh(): Promise<AgentConfig> {
    if (this.isRefreshing) {
      return this.current;
    }

    this.isRefreshing = true;

    try {
      const remote = await this.apiClient.getConfig();
      const validated = this.validateAndNormalize(remote);

      this.current = validated;
      this.lastConfigSync = new Date();

      return this.current;
    } catch (error) {
      this.handleConfigError(error);
      return this.current;
    } finally {
      this.isRefreshing = false;
    }
  }

  private validateAndNormalize(config: Partial<AgentConfig>): AgentConfig {
    const idleThresholdSeconds = this.normalizeThreshold(
      config.tracking?.idleThresholdSeconds,
      DEFAULT_CONFIG.tracking.idleThresholdSeconds,
    );

    // The `privacy` booleans are the single master gate for DLP capture; the
    // `dlp` block below carries only the detail and mirrors these two, so there
    // is one source of truth for "may we capture at all" and no way for the two
    // to disagree.
    const allowClipboardTracking =
      config.privacy?.allowClipboardTracking ??
      DEFAULT_CONFIG.privacy.allowClipboardTracking;
    const allowScreenshots =
      config.privacy?.allowScreenshots ??
      DEFAULT_CONFIG.privacy.allowScreenshots;

    return {
      agentVersionPolicy: {
        minimumSupportedVersion:
          config.agentVersionPolicy?.minimumSupportedVersion ||
          DEFAULT_CONFIG.agentVersionPolicy.minimumSupportedVersion,

        latestVersion:
          config.agentVersionPolicy?.latestVersion ||
          DEFAULT_CONFIG.agentVersionPolicy.latestVersion,

        forceUpdate:
          config.agentVersionPolicy?.forceUpdate ??
          DEFAULT_CONFIG.agentVersionPolicy.forceUpdate,

        updateMessage:
          config.agentVersionPolicy?.updateMessage ??
          DEFAULT_CONFIG.agentVersionPolicy.updateMessage,
      },

      policy: {
        mandatory: config.policy?.mandatory ?? DEFAULT_CONFIG.policy.mandatory,
        allowUserQuit:
          config.policy?.allowUserQuit ?? DEFAULT_CONFIG.policy.allowUserQuit,
      },

      tracking: {
        enabled: config.tracking?.enabled ?? DEFAULT_CONFIG.tracking.enabled,

        heartbeatIntervalSeconds: this.clampNumber(
          config.tracking?.heartbeatIntervalSeconds,
          MIN_HEARTBEAT_SECONDS,
          MAX_HEARTBEAT_SECONDS,
          DEFAULT_CONFIG.tracking.heartbeatIntervalSeconds,
        ),

        idleThresholdSeconds,

        awayThresholdSeconds: this.normalizeAwayThreshold(
          config.tracking?.awayThresholdSeconds,
          idleThresholdSeconds,
        ),

        captureActiveApp:
          config.tracking?.captureActiveApp ??
          DEFAULT_CONFIG.tracking.captureActiveApp,

        captureWindowTitle:
          config.tracking?.captureWindowTitle ??
          DEFAULT_CONFIG.tracking.captureWindowTitle,
      },

      privacy: {
        // Screenshots and clipboard capture are now server-controlled (TASK-0020),
        // defaulting off. Keylogging is still refused whatever the server says —
        // the one capability the server may not turn on.
        allowScreenshots,
        allowClipboardTracking,
        allowKeylogging: false,
        allowCameraAccess:
          config.privacy?.allowCameraAccess ??
          DEFAULT_CONFIG.privacy.allowCameraAccess,
        allowMicrophoneAccess:
          config.privacy?.allowMicrophoneAccess ??
          DEFAULT_CONFIG.privacy.allowMicrophoneAccess,
        allowLocationAccess:
          config.privacy?.allowLocationAccess ??
          DEFAULT_CONFIG.privacy.allowLocationAccess,
      },

      api: {
        heartbeatBatchSize: this.clampNumber(
          config.api?.heartbeatBatchSize,
          1,
          MAX_HEARTBEAT_BATCH_SIZE,
          DEFAULT_CONFIG.api.heartbeatBatchSize,
        ),

        offlineQueueEnabled:
          config.api?.offlineQueueEnabled ??
          DEFAULT_CONFIG.api.offlineQueueEnabled,
      },

      features: {
        activeAppTracking:
          config.features?.activeAppTracking ??
          DEFAULT_CONFIG.features.activeAppTracking,

        windowTitleTracking:
          config.features?.windowTitleTracking ??
          DEFAULT_CONFIG.features.windowTitleTracking,

        offlineQueue:
          config.features?.offlineQueue ?? DEFAULT_CONFIG.features.offlineQueue,

        autoUpdate:
          config.features?.autoUpdate ?? DEFAULT_CONFIG.features.autoUpdate,

        trayStatus:
          config.features?.trayStatus ?? DEFAULT_CONFIG.features.trayStatus,

        cameraAccess:
          config.features?.cameraAccess ?? DEFAULT_CONFIG.features.cameraAccess,

        microphoneAccess:
          config.features?.microphoneAccess ??
          DEFAULT_CONFIG.features.microphoneAccess,

        locationAccess:
          config.features?.locationAccess ??
          DEFAULT_CONFIG.features.locationAccess,
      },

      dlp: this.normalizeDlp(
        config.dlp,
        allowClipboardTracking,
        allowScreenshots,
      ),
    };
  }

  /**
   * Normalises the DLP block against bounds, and pins its two capture gates to
   * the resolved `privacy` booleans. A rule with no source or channel pattern is
   * dropped — it would either never fire or fire on everything — and the rule
   * list is bounded so a bad config cannot make the agent evaluate thousands of
   * patterns on every foreground change. Capture is off unless the corresponding
   * privacy gate is on, so an inconsistent server payload (detail present, gate
   * absent) resolves to "do not capture".
   */
  private normalizeDlp(
    dlp: Partial<DlpConfig> | undefined,
    allowClipboardTracking: boolean,
    allowScreenshots: boolean,
  ): DlpConfig {
    const rules: DlpRuleConfig[] = Array.isArray(dlp?.rules)
      ? dlp!.rules
          .filter(
            (rule): rule is DlpRuleConfig =>
              !!rule &&
              typeof rule.id === "string" &&
              rule.id.length > 0 &&
              (Array.isArray(rule.sourceAppPatterns)
                ? rule.sourceAppPatterns.length > 0
                : false) &&
              Array.isArray(rule.channelAppPatterns) &&
              rule.channelAppPatterns.length > 0,
          )
          .slice(0, MAX_DLP_RULES)
          .map((rule) => ({
            id: rule.id,
            name: typeof rule.name === "string" ? rule.name : rule.id,
            enabled: rule.enabled ?? true,
            sourceAppPatterns: rule.sourceAppPatterns
              .filter((p) => typeof p === "string" && p.trim().length > 0)
              .map((p) => p.trim()),
            channelAppPatterns: rule.channelAppPatterns
              .filter((p) => typeof p === "string" && p.trim().length > 0)
              .map((p) => p.trim()),
            action:
              rule.action === "ALERT" || rule.action === "BLOCK"
                ? rule.action
                : "OBSERVE",
          }))
      : [];

    return {
      clipboardCaptureEnabled: allowClipboardTracking,
      screenshotCaptureEnabled: allowScreenshots,
      clipboardFullContent:
        dlp?.clipboardFullContent ?? DEFAULT_DLP_CONFIG.clipboardFullContent,
      clipboardPollIntervalSeconds: this.clampNumber(
        dlp?.clipboardPollIntervalSeconds,
        MIN_CLIPBOARD_POLL_SECONDS,
        MAX_CLIPBOARD_POLL_SECONDS,
        DEFAULT_DLP_CONFIG.clipboardPollIntervalSeconds,
      ),
      maxClipboardBytes: this.clampNumber(
        dlp?.maxClipboardBytes,
        MIN_CLIPBOARD_BYTES,
        MAX_CLIPBOARD_BYTES,
        DEFAULT_DLP_CONFIG.maxClipboardBytes,
      ),
      triggerWindowSeconds: this.clampNumber(
        dlp?.triggerWindowSeconds,
        MIN_TRIGGER_WINDOW_SECONDS,
        MAX_TRIGGER_WINDOW_SECONDS,
        DEFAULT_DLP_CONFIG.triggerWindowSeconds,
      ),
      rules,
    };
  }

  private clampNumber(
    value: number | undefined,
    min: number,
    max: number,
    fallback: number,
  ): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(Math.floor(value!), min), max);
  }

  private normalizeThreshold(
    value: number | undefined,
    fallback: number,
  ): number {
    if (!Number.isFinite(value) || value! <= 0) {
      return fallback;
    }

    return Math.floor(value!);
  }

  private normalizeAwayThreshold(
    away: number | undefined,
    idle: number,
  ): number {
    const safeAway = this.normalizeThreshold(
      away,
      DEFAULT_CONFIG.tracking.awayThresholdSeconds,
    );

    return Math.max(safeAway, idle);
  }

  private handleConfigError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "Unknown config error";

    console.warn("[ConfigManager] Failed to refresh config:", message);
  }
}
