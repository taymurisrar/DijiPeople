import type { AgentConfig } from "./types";
import { ApiClient } from "./api-client";

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
  current = DEFAULT_CONFIG;
  lastConfigSync: Date | null = null;

  constructor(private readonly apiClient: ApiClient) {}

  async refresh() {
    this.current = await this.apiClient.getConfig();
    this.lastConfigSync = new Date();
    return this.current;
  }
}
