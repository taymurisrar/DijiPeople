import type { AgentConfig } from "./types";
import { ApiClient } from "./api-client";

const MIN_HEARTBEAT_SECONDS = 10;
const MAX_HEARTBEAT_SECONDS = 3600;

export const DEFAULT_CONFIG: AgentConfig = {
  agentVersionPolicy: {
    minimumSupportedVersion: "1.0.0",
    latestVersion: "1.0.0",
    forceUpdate: false,
    updateMessage: null,
  },
  tracking: {
    enabled: true,
    heartbeatIntervalSeconds: 60,
    idleThresholdSeconds: 120,
    awayThresholdSeconds: 600,
    captureActiveApp: true,
    captureWindowTitle: false,
  },
  privacy: {
    allowScreenshots: false,
    allowClipboardTracking: false,
    allowKeylogging: false,
  },
  api: {
    heartbeatBatchSize: 10,
    offlineQueueEnabled: true,
  },
  features: {
    activeAppTracking: true,
    windowTitleTracking: false,
    offlineQueue: true,
    autoUpdate: true,
    trayStatus: true,
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
      // fallback strategy
      this.handleConfigError(error);
      return this.current;
    } finally {
      this.isRefreshing = false;
    }
  }

  // -------------------------
  // Validation Layer
  // -------------------------

  private validateAndNormalize(config: AgentConfig): AgentConfig {
    return {
      agentVersionPolicy: {
        minimumSupportedVersion:
          config.agentVersionPolicy?.minimumSupportedVersion ||
          DEFAULT_CONFIG.agentVersionPolicy.minimumSupportedVersion,

        latestVersion:
          config.agentVersionPolicy?.latestVersion ||
          DEFAULT_CONFIG.agentVersionPolicy.latestVersion,

        forceUpdate: Boolean(config.agentVersionPolicy?.forceUpdate),

        updateMessage:
          config.agentVersionPolicy?.updateMessage ?? null,
      },

      tracking: {
        enabled: Boolean(config.tracking?.enabled),

        heartbeatIntervalSeconds: this.clampNumber(
          config.tracking?.heartbeatIntervalSeconds,
          MIN_HEARTBEAT_SECONDS,
          MAX_HEARTBEAT_SECONDS,
          DEFAULT_CONFIG.tracking.heartbeatIntervalSeconds,
        ),

        idleThresholdSeconds: this.normalizeThreshold(
          config.tracking?.idleThresholdSeconds,
          DEFAULT_CONFIG.tracking.idleThresholdSeconds,
        ),

        awayThresholdSeconds: this.normalizeAwayThreshold(
          config.tracking?.awayThresholdSeconds,
          config.tracking?.idleThresholdSeconds,
        ),

        captureActiveApp: Boolean(config.tracking?.captureActiveApp),
        captureWindowTitle: Boolean(config.tracking?.captureWindowTitle),
      },

      privacy: {
        // force locked values (DO NOT TRUST SERVER HERE)
        allowScreenshots: false,
        allowClipboardTracking: false,
        allowKeylogging: false,
      },

      api: {
        heartbeatBatchSize: this.clampNumber(
          config.api?.heartbeatBatchSize,
          1,
          100,
          DEFAULT_CONFIG.api.heartbeatBatchSize,
        ),

        offlineQueueEnabled: Boolean(config.api?.offlineQueueEnabled),
      },

      features: {
        activeAppTracking: Boolean(config.features?.activeAppTracking),
        windowTitleTracking: Boolean(config.features?.windowTitleTracking),
        offlineQueue: Boolean(config.features?.offlineQueue),
        autoUpdate: Boolean(config.features?.autoUpdate),
        trayStatus: Boolean(config.features?.trayStatus),
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
    idle: number | undefined,
  ): number {
    const safeIdle = this.normalizeThreshold(
      idle,
      DEFAULT_CONFIG.tracking.idleThresholdSeconds,
    );

    const safeAway = this.normalizeThreshold(
      away,
      DEFAULT_CONFIG.tracking.awayThresholdSeconds,
    );

    return Math.max(safeAway, safeIdle);
  }

  // -------------------------
  // Error Handling
  // -------------------------

  private handleConfigError(error: unknown): void {
    // Do NOT crash agent
    // Do NOT wipe config
    // Keep last known good config

    const message =
      error instanceof Error ? error.message : "Unknown config error";

    // You can later hook this into logging / telemetry
    console.warn("[ConfigManager] Failed to refresh config:", message);
  }
}