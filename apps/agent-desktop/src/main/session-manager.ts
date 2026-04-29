import { EventEmitter } from "node:events";
import { ApiClient } from "./api-client";
import { ActivityTracker } from "./activity-tracker";
import { ConfigManager } from "./config-manager";
import { OfflineQueue } from "./offline-queue";
import { SecureStore } from "./secure-store";
import type { AgentState, ConnectionState, LoginResult } from "./types";

export class SessionManager extends EventEmitter {
  user: LoginResult["user"] | null = null;
  deviceId: string | null = null;
  sessionId: string | null = null;
  status: AgentState = "AWAY";
  connectionStatus: ConnectionState = "OFFLINE";
  lastHeartbeatSync: Date | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private configTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly apiClient: ApiClient,
    private readonly secureStore: SecureStore,
    private readonly configManager: ConfigManager,
    private readonly activityTracker: ActivityTracker,
    private readonly offlineQueue: OfflineQueue,
  ) {
    super();
  }

  async restore() {
    const refreshToken = await this.secureStore.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const result = await this.apiClient.refresh(refreshToken);
      await this.applyLoginResult(result);
      await this.secureStore.setRefreshToken(result.tokens.refreshToken);
      return true;
    } catch {
      await this.secureStore.clearRefreshToken();
      this.emit("login-required");
      return false;
    }
  }

  async login(email: string, password: string) {
    const result = await this.apiClient.login(email, password);
    await this.applyLoginResult(result);
    await this.secureStore.setRefreshToken(result.tokens.refreshToken);
  }

  async logout(showLogin = true) {
    const refreshToken = await this.secureStore.getRefreshToken();
    if (this.sessionId && this.deviceId) {
      await this.apiClient
        .endSession(this.sessionId, this.deviceId)
        .catch(() => undefined);
    }
    if (refreshToken) {
      await this.apiClient.logout(refreshToken).catch(() => undefined);
    }
    await this.secureStore.clearRefreshToken();
    this.stopTimers();
    this.user = null;
    this.deviceId = null;
    this.sessionId = null;
    if (showLogin) {
      this.emit("login-required");
    }
    this.emit("changed");
  }

  async syncHeartbeat() {
    if (!this.sessionId || !this.deviceId) return;
    const event = this.activityTracker.buildHeartbeat({
      config: this.configManager.current,
      sessionId: this.sessionId,
      deviceId: this.deviceId,
      agentVersion: this.apiClient.deviceInfo.agentVersion,
    });
    this.status = event.state;
    let queued: ReturnType<typeof this.activityTracker.buildHeartbeat>[] = [];

    try {
      queued = await this.offlineQueue.drain(
        this.configManager.current.api.heartbeatBatchSize,
      );
      const events = [...queued, event];
      await this.apiClient.heartbeat(events);
      this.connectionStatus = "ONLINE";
      this.lastHeartbeatSync = new Date();
    } catch {
      this.connectionStatus = "OFFLINE";
      if (this.configManager.current.api.offlineQueueEnabled) {
        await this.offlineQueue.prepend([...queued, event]);
      }
    }

    this.emit("changed");
  }

  private async applyLoginResult(result: LoginResult) {
    this.apiClient.setAccessToken(result.tokens.accessToken);
    this.user = result.user;
    this.deviceId = result.device.id;
    await this.configManager.refresh().catch(() => undefined);
    const registered = await this.apiClient.registerDevice();
    this.deviceId = registered.id;
    if (
      isVersionBlocked(
        this.apiClient.deviceInfo.agentVersion,
        this.configManager.current,
      )
    ) {
      this.stopTimers();
      this.connectionStatus = "ONLINE";
      this.emit(
        "update-required",
        this.configManager.current.agentVersionPolicy,
      );
      this.emit("authenticated");
      this.emit("changed");
      return;
    }
    const session = await this.apiClient.startSession(this.deviceId);
    this.sessionId = session.id;
    this.connectionStatus = "ONLINE";
    this.startTimers();
    this.emit("authenticated");
    this.emit("changed");
  }

  private startTimers() {
    this.stopTimers();
    const heartbeatMs =
      this.configManager.current.tracking.heartbeatIntervalSeconds * 1000;
    this.heartbeatTimer = setInterval(() => {
      void this.syncHeartbeat();
    }, heartbeatMs);
    this.configTimer = setInterval(
      () => {
        void this.configManager.refresh().finally(() => this.emit("changed"));
      },
      15 * 60 * 1000,
    );
    void this.syncHeartbeat();
  }

  private stopTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.configTimer) clearInterval(this.configTimer);
    this.heartbeatTimer = null;
    this.configTimer = null;
  }
}

function isVersionBlocked(
  currentVersion: string,
  config: ConfigManager["current"],
) {
  return (
    config.agentVersionPolicy.forceUpdate ||
    compareVersions(
      currentVersion,
      config.agentVersionPolicy.minimumSupportedVersion,
    ) < 0
  );
}

function compareVersions(a: string, b: string) {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}
