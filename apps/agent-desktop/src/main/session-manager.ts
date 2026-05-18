import { EventEmitter } from "node:events";
import { ApiClient } from "./api-client";
import { ActivityTracker } from "./activity-tracker";
import { ConfigManager } from "./config-manager";
import { OfflineQueue } from "./offline-queue";
import { SecureStore } from "./secure-store";
import { agentEnv } from "../config/env";
import { AgentLogger } from "./logger";
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

const DEFAULT_CONFIG_REFRESH_INTERVAL_SECONDS = 15 * 60;
const MIN_CONFIG_REFRESH_INTERVAL_SECONDS = 60;
const MAX_CONFIG_REFRESH_INTERVAL_SECONDS = 24 * 60 * 60;
const HEARTBEAT_JITTER_MAX_MS = 10_000;
const CONFIG_REFRESH_JITTER_MAX_MS = 60_000;

export class SessionManager extends EventEmitter {
  user: LoginResult["user"] | null = null;
  deviceId: string | null = null;
  sessionId: string | null = null;
  status: AgentState = "AWAY";
  connectionStatus: ConnectionState = "OFFLINE";
  lastHeartbeatSync: Date | null = null;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private configTimer: NodeJS.Timeout | null = null;
  private sessionExpiryTimer: NodeJS.Timeout | null = null;
  private isLoggingOut = false;
  private isApplyingSession = false;
  private isSyncingHeartbeat = false;
  private isRefreshingToken = false;
  private sessionStartedAt: Date | null = null;
  private lastActivityAt: Date | null = null;
  private accessTokenExpiresAt: Date | null = null;

  constructor(
    private readonly apiClient: ApiClient,
    private readonly secureStore: SecureStore,
    private readonly configManager: ConfigManager,
    private readonly activityTracker: ActivityTracker,
    private readonly offlineQueue: OfflineQueue,
    private readonly logger: AgentLogger,
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
      this.logger.info("agent.session.restored", { userId: result.user.id });

      return true;
    } catch (error) {
      await this.safeClearRefreshToken();

      this.resetSessionState();
      this.emit("session-error", this.normalizeSessionError(error));
      this.emit("login-required");
      this.logger.warn("agent.session.restore_failed", { reason: this.normalizeSessionError(error) });

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
      this.logger.info("agent.auth.login_success", {
        userId: result.user.id,
        tenantId: result.tenant.id,
      });
    } catch (error) {
      this.resetSessionState();
      this.logger.warn("agent.auth.login_failed", { reason: this.normalizeSessionError(error) });
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
      this.logger.info("agent.auth.logout", { showLogin });

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

    if (this.isSessionExpiredByEnvPolicy()) {
      await this.logout(true);
      this.emit(
        "session-error",
        "Session expired based on configured agent session policy.",
      );
      return;
    }

    if (this.shouldRefreshTokenByEnvPolicy()) {
      await this.refreshAccessToken();
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
      this.lastActivityAt = new Date();

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
        this.configManager.current.api.offlineQueueEnabled &&
        agentEnv.offlineQueueEnabled
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
      this.accessTokenExpiresAt = readJwtExpiry(result.tokens.accessToken);
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
      this.accessTokenExpiresAt = readJwtExpiry(result.tokens.accessToken);

      this.user = result.user;
      this.deviceId = result.device.id;
      this.sessionId = null;
      this.status = "AWAY";
      this.connectionStatus = "ONLINE";
      this.lastHeartbeatSync = null;
      this.sessionStartedAt = new Date();
      this.lastActivityAt = new Date();

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

    const heartbeatMs = this.resolveHeartbeatIntervalMs();

    if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
      this.emit(
        "session-error",
        "Invalid heartbeat interval configuration received from server or environment.",
      );
      return;
    }

    const heartbeatIntervalWithJitter =
      heartbeatMs + Math.floor(Math.random() * HEARTBEAT_JITTER_MAX_MS);

    this.heartbeatTimer = setInterval(() => {
      void this.syncHeartbeat();
    }, heartbeatIntervalWithJitter);

    const configRefreshMs = this.resolveConfigRefreshIntervalMs();
    const configRefreshIntervalWithJitter =
      configRefreshMs + Math.floor(Math.random() * CONFIG_REFRESH_JITTER_MAX_MS);

    this.configTimer = setInterval(() => {
      void this.refreshConfigWithAuthRecovery();
    }, configRefreshIntervalWithJitter);

    this.sessionExpiryTimer = setInterval(() => {
      void this.enforceSessionPolicy();
    }, 60 * 1000);

    void this.syncHeartbeat();
  }

  private resolveHeartbeatIntervalMs(): number {
    const intervalSeconds =
      this.configManager.current.tracking.heartbeatIntervalSeconds ||
      agentEnv.heartbeatIntervalSeconds;

    return intervalSeconds * 1000;
  }

  private resolveConfigRefreshIntervalMs(): number {
    const envValue = Number(process.env.AGENT_CONFIG_REFRESH_INTERVAL_SECONDS);

    const intervalSeconds =
      Number.isFinite(envValue) && envValue > 0
        ? envValue
        : DEFAULT_CONFIG_REFRESH_INTERVAL_SECONDS;

    const normalizedSeconds = Math.min(
      Math.max(Math.floor(intervalSeconds), MIN_CONFIG_REFRESH_INTERVAL_SECONDS),
      MAX_CONFIG_REFRESH_INTERVAL_SECONDS,
    );

    return normalizedSeconds * 1000;
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

  private async enforceSessionPolicy(): Promise<void> {
    if (!this.sessionId || !this.deviceId) {
      return;
    }

    if (this.isSessionExpiredByEnvPolicy()) {
      await this.logout(true);

      this.emit(
        "session-error",
        "Session expired based on configured agent session policy.",
      );
    }
  }

  private isSessionExpiredByEnvPolicy(): boolean {
    const now = Date.now();

    if (
      this.sessionStartedAt &&
      agentEnv.sessionAbsoluteTimeoutSeconds > 0
    ) {
      const absoluteAgeSeconds =
        (now - this.sessionStartedAt.getTime()) / 1000;

      if (absoluteAgeSeconds >= agentEnv.sessionAbsoluteTimeoutSeconds) {
        return true;
      }
    }

    if (
      this.lastActivityAt &&
      agentEnv.sessionIdleTimeoutSeconds > 0
    ) {
      const idleAgeSeconds =
        (now - this.lastActivityAt.getTime()) / 1000;

      if (idleAgeSeconds >= agentEnv.sessionIdleTimeoutSeconds) {
        return true;
      }
    }

    return false;
  }

  private shouldRefreshTokenByEnvPolicy(): boolean {
    if (!this.accessTokenExpiresAt || agentEnv.sessionRefreshThresholdSeconds <= 0) {
      return false;
    }

    const secondsUntilExpiry =
      (this.accessTokenExpiresAt.getTime() - Date.now()) / 1000;

    return secondsUntilExpiry <= agentEnv.sessionRefreshThresholdSeconds;
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.configTimer) {
      clearInterval(this.configTimer);
    }

    if (this.sessionExpiryTimer) {
      clearInterval(this.sessionExpiryTimer);
    }

    this.heartbeatTimer = null;
    this.configTimer = null;
    this.sessionExpiryTimer = null;
  }

  private resetSessionState(): void {
    this.stopTimers();

    this.user = null;
    this.deviceId = null;
    this.sessionId = null;
    this.status = "AWAY";
    this.connectionStatus = "OFFLINE";
    this.lastHeartbeatSync = null;
    this.sessionStartedAt = null;
    this.lastActivityAt = null;
    this.accessTokenExpiresAt = null;
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
function readJwtExpiry(token: string): Date | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return decoded.exp ? new Date(decoded.exp * 1000) : null;
  } catch {
    return null;
  }
}
