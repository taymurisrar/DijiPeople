import { EventEmitter } from "node:events";
import { ApiClient } from "./api-client";
import { ActivityTracker } from "./activity-tracker";
import { ConfigManager } from "./config-manager";
import { OfflineQueue } from "./offline-queue";
import { SecureStore } from "./secure-store";
import type {
  AgentState,
  ConnectionState,
  HeartbeatEvent,
  LoginResult,
} from "./types";

type SessionManagerEvent =
  | "login-required"
  | "authenticated"
  | "changed"
  | "update-required"
  | "session-error";

export class SessionManager extends EventEmitter {
  user: LoginResult["user"] | null = null;
  deviceId: string | null = null;
  sessionId: string | null = null;
  status: AgentState = "AWAY";
  connectionStatus: ConnectionState = "OFFLINE";
  lastHeartbeatSync: Date | null = null;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private configTimer: NodeJS.Timeout | null = null;
  private isLoggingOut = false;
  private isApplyingSession = false;
  private isSyncingHeartbeat = false;
  private isRefreshingToken = false;

  constructor(
    private readonly apiClient: ApiClient,
    private readonly secureStore: SecureStore,
    private readonly configManager: ConfigManager,
    private readonly activityTracker: ActivityTracker,
    private readonly offlineQueue: OfflineQueue,
  ) {
    super();
  }

  override emit(eventName: SessionManagerEvent, ...args: unknown[]): boolean {
    return super.emit(eventName, ...args);
  }

  async restore(): Promise<boolean> {
    const refreshToken = await this.secureStore.getRefreshToken();

    if (!refreshToken) {
      this.resetSessionState();
      return false;
    }

    try {
      const result = await this.apiClient.refresh(refreshToken);

      await this.applyLoginResult(result);
      await this.secureStore.setRefreshToken(result.tokens.refreshToken);

      return true;
    } catch (error) {
      await this.safeClearRefreshToken();

      this.resetSessionState();
      this.emit("session-error", this.normalizeSessionError(error));
      this.emit("login-required");

      return false;
    }
  }

  async login(email: string, password: string): Promise<void> {
    if (this.isApplyingSession) {
      throw new Error("A sign-in request is already in progress.");
    }

    try {
      const result = await this.apiClient.login(email, password);

      await this.applyLoginResult(result);
      await this.secureStore.setRefreshToken(result.tokens.refreshToken);
    } catch (error) {
      this.resetSessionState();
      throw error;
    }
  }

  async logout(showLogin = true): Promise<void> {
    if (this.isLoggingOut) return;

    this.isLoggingOut = true;

    try {
      const refreshToken = await this.secureStore.getRefreshToken();

      if (this.sessionId && this.deviceId) {
        await this.apiClient
          .endSession(this.sessionId, this.deviceId)
          .catch(() => undefined);
      }

      if (refreshToken) {
        await this.apiClient.logout(refreshToken).catch(() => undefined);
      }

      await this.safeClearRefreshToken();
      await this.offlineQueue.clear().catch(() => undefined);

      this.resetSessionState();

      if (showLogin) {
        this.emit("login-required");
      }

      this.emit("changed");
    } finally {
      this.isLoggingOut = false;
    }
  }

  async syncHeartbeat(): Promise<void> {
    if (!this.sessionId || !this.deviceId) {
      console.warn("[Agent Heartbeat] skipped - missing session/device", {
        sessionId: this.sessionId,
        deviceId: this.deviceId,
      });
      return;
    }

    if (this.isSyncingHeartbeat) {
      console.warn("[Agent Heartbeat] skipped - already in progress");
      return;
    }

    this.isSyncingHeartbeat = true;

    let requeueEvents: HeartbeatEvent[] = [];

    try {
      console.log("[Agent Heartbeat] building event", {
        sessionId: this.sessionId,
        deviceId: this.deviceId,
      });

      const event = await this.activityTracker.buildHeartbeat({
        config: this.configManager.current,
        sessionId: this.sessionId,
        deviceId: this.deviceId,
        agentVersion: this.apiClient.deviceInfo.agentVersion,
      });

      console.log("[Agent Heartbeat] event built", {
        state: event.state,
        idleSeconds: event.idleSeconds,
        activeApp: event.activeApp,
        browserTabTitle: event.browserTabTitle,
      });

      this.status = event.state;

      const queued = await this.offlineQueue.drain(
        this.configManager.current.api.heartbeatBatchSize,
      );

      const validQueued = queued.filter(
        (queuedEvent) =>
          queuedEvent.sessionId === this.sessionId &&
          queuedEvent.deviceId === this.deviceId,
      );

      const droppedQueued = queued.length - validQueued.length;

      if (droppedQueued > 0) {
        console.warn("[Agent Heartbeat] dropped stale queued events", {
          dropped: droppedQueued,
          drained: queued.length,
          currentSessionId: this.sessionId,
          currentDeviceId: this.deviceId,
        });
      }

      requeueEvents = [...validQueued, event];

      await this.sendHeartbeatBatch(requeueEvents, "normal");

      requeueEvents = [];
    } catch (error) {
      const errorMessage = this.normalizeSessionError(error);

      console.error("[Agent Heartbeat] FAILED", {
        error: errorMessage,
        sessionId: this.sessionId,
        deviceId: this.deviceId,
      });

      if (isAuthExpiredError(errorMessage)) {
        console.warn("[Agent Heartbeat] access token expired → refreshing");

        const refreshed = await this.refreshAccessToken();

        if (refreshed && requeueEvents.length > 0) {
          try {
            await this.sendHeartbeatBatch(requeueEvents, "after-refresh");
            requeueEvents = [];
            return;
          } catch (retryError) {
            console.error("[Agent Heartbeat] retry failed after refresh", {
              error: this.normalizeSessionError(retryError),
            });
          }
        }
      }

      this.connectionStatus = "OFFLINE";

      if (
        requeueEvents.length > 0 &&
        this.configManager.current.api.offlineQueueEnabled
      ) {
        await this.offlineQueue.prepend(requeueEvents).catch(() => {
          console.error("[Agent Heartbeat] failed to persist offline queue");

          this.emit(
            "session-error",
            "Unable to save offline heartbeat events.",
          );
        });
      }

      this.emit("session-error", errorMessage);
    } finally {
      this.isSyncingHeartbeat = false;

      console.log("[Agent Heartbeat] finished", {
        connectionStatus: this.connectionStatus,
        lastHeartbeatSync: this.lastHeartbeatSync,
      });

      this.emit("changed");
    }
  }

  private async sendHeartbeatBatch(
    events: HeartbeatEvent[],
    mode: "normal" | "after-refresh",
  ): Promise<void> {
    console.log("[Agent Heartbeat] sending batch", {
      mode,
      totalEvents: events.length,
    });

    const response = await this.apiClient.heartbeat(events);

    console.log("[Agent Heartbeat] success", {
      mode,
      accepted: response.accepted,
    });

    this.connectionStatus = "ONLINE";
    this.lastHeartbeatSync = new Date();
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (this.isRefreshingToken) {
      return false;
    }

    this.isRefreshingToken = true;

    try {
      const refreshToken = await this.secureStore.getRefreshToken();

      if (!refreshToken) {
        this.resetSessionState();
        this.emit("login-required");
        return false;
      }

      const result = await this.apiClient.refresh(refreshToken);

      this.apiClient.setAccessToken(result.tokens.accessToken);
      this.user = result.user;
      this.deviceId = result.device.id;

      await this.secureStore.setRefreshToken(result.tokens.refreshToken);

      console.log("[Agent Session] access token refreshed");

      return true;
    } catch (error) {
      console.error("[Agent Session] token refresh failed", error);

      await this.safeClearRefreshToken();
      this.resetSessionState();
      this.emit("login-required");

      return false;
    } finally {
      this.isRefreshingToken = false;
    }
  }

  private async applyLoginResult(result: LoginResult): Promise<void> {
    this.isApplyingSession = true;

    try {
      console.log("[Agent Session] applying login result");

      this.stopTimers();

      this.apiClient.setAccessToken(result.tokens.accessToken);

      this.user = result.user;
      this.deviceId = result.device.id;
      this.sessionId = null;
      this.status = "AWAY";
      this.connectionStatus = "ONLINE";
      this.lastHeartbeatSync = null;

      this.emit("changed");

      console.log("[Agent Session] refreshing config");

      await this.configManager.refresh().catch((error) => {
        console.error("[Agent Session] config refresh failed", error);
      });

      console.log("[Agent Session] config loaded", {
        trackingEnabled: this.configManager.current.tracking.enabled,
        heartbeatIntervalSeconds:
          this.configManager.current.tracking.heartbeatIntervalSeconds,
        captureActiveApp: this.configManager.current.tracking.captureActiveApp,
        captureWindowTitle:
          this.configManager.current.tracking.captureWindowTitle,
      });

      console.log("[Agent Session] registering device");

      const registered = await this.apiClient.registerDevice();

      console.log("[Agent Session] device registered", {
        deviceId: registered.id,
      });

      this.deviceId = registered.id;

      if (
        isVersionBlocked(
          this.apiClient.deviceInfo.agentVersion,
          this.configManager.current,
        )
      ) {
        console.warn("[Agent Session] agent version is blocked", {
          currentVersion: this.apiClient.deviceInfo.agentVersion,
          policy: this.configManager.current.agentVersionPolicy,
        });

        this.connectionStatus = "ONLINE";

        this.emit(
          "update-required",
          this.configManager.current.agentVersionPolicy,
        );
        this.emit("authenticated");
        this.emit("changed");

        return;
      }

      console.log("[Agent Session] starting work session", {
        deviceId: this.deviceId,
      });

      const session = await this.apiClient.startSession(this.deviceId);

      console.log("[Agent Session] work session started", {
        sessionId: session.id,
      });

      this.sessionId = session.id;
      this.connectionStatus = "ONLINE";
      this.status = "ACTIVE";

      await this.offlineQueue.clear().catch(() => undefined);

      this.emit("authenticated");
      this.emit("changed");

      this.startTimers();
    } catch (error) {
      console.error("[Agent Session] apply login result failed", error);

      this.resetSessionState();
      throw error;
    } finally {
      this.isApplyingSession = false;
    }
  }

  private startTimers(): void {
    this.stopTimers();

    const heartbeatMs =
      this.configManager.current.tracking.heartbeatIntervalSeconds * 1000;

    if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
      this.emit(
        "session-error",
        "Invalid heartbeat interval configuration received from server.",
      );
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      void this.syncHeartbeat();
    }, heartbeatMs);

    this.configTimer = setInterval(() => {
      void this.refreshConfigWithAuthRecovery();
    }, 15 * 60 * 1000);

    void this.syncHeartbeat();
  }

  private async refreshConfigWithAuthRecovery(): Promise<void> {
    try {
      await this.configManager.refresh();
    } catch (error) {
      const message = this.normalizeSessionError(error);

      if (isAuthExpiredError(message)) {
        const refreshed = await this.refreshAccessToken();

        if (refreshed) {
          await this.configManager.refresh().catch(() => undefined);
        }
      }
    } finally {
      this.emit("changed");
    }
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.configTimer) {
      clearInterval(this.configTimer);
    }

    this.heartbeatTimer = null;
    this.configTimer = null;
  }

  private resetSessionState(): void {
    this.stopTimers();

    this.user = null;
    this.deviceId = null;
    this.sessionId = null;
    this.status = "AWAY";
    this.connectionStatus = "OFFLINE";
    this.lastHeartbeatSync = null;
    this.isSyncingHeartbeat = false;
  }

  private async safeClearRefreshToken(): Promise<void> {
    await this.secureStore.clearRefreshToken().catch(() => undefined);
  }

  private normalizeSessionError(error: unknown): string {
    return error instanceof Error ? error.message : "Unexpected session error.";
  }
}

function isVersionBlocked(
  currentVersion: string,
  config: ConfigManager["current"],
): boolean {
  return (
    config.agentVersionPolicy.forceUpdate ||
    compareVersions(
      currentVersion,
      config.agentVersionPolicy.minimumSupportedVersion,
    ) < 0
  );
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);

    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function isAuthExpiredError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("access token is invalid or expired") ||
    normalized.includes("access token is invalid") ||
    normalized.includes("access token is required") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401")
  );
}