import type { AgentConfig } from "./types";
import { ApiClient } from "./api-client";
import { agentEnv } from "../config/env";

const MIN_HEARTBEAT_SECONDS = 10;
const MAX_HEARTBEAT_SECONDS = 3600;
const MAX_HEARTBEAT_BATCH_SIZE = 1000;

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
    idleThresholdSeconds: agentEnv.sessionIdleTimeoutSeconds,
    awayThresholdSeconds: agentEnv.sessionIdleTimeoutSeconds,
    captureActiveApp: agentEnv.activeAppTrackingEnabled,
    captureWindowTitle: agentEnv.windowTitleTrackingEnabled,
  },

  privacy: {
    allowScreenshots: false,
    allowClipboardTracking: false,
    allowKeylogging: false,
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
  },
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
        mandatory:
          config.policy?.mandatory ??
          DEFAULT_CONFIG.policy.mandatory,
        allowUserQuit:
          config.policy?.allowUserQuit ??
          DEFAULT_CONFIG.policy.allowUserQuit,
      },

      tracking: {
        enabled:
          config.tracking?.enabled ??
          DEFAULT_CONFIG.tracking.enabled,

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
        allowScreenshots: false,
        allowClipboardTracking: false,
        allowKeylogging: false,
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
          config.features?.offlineQueue ??
          DEFAULT_CONFIG.features.offlineQueue,

        autoUpdate:
          config.features?.autoUpdate ??
          DEFAULT_CONFIG.features.autoUpdate,

        trayStatus:
          config.features?.trayStatus ??
          DEFAULT_CONFIG.features.trayStatus,
      },
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