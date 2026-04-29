import { app } from "electron";
import os from "node:os";
import crypto from "node:crypto";
import type { AgentConfig, HeartbeatEvent, LoginResult } from "./types";

export class ApiClient {
  private accessToken: string | null = null;
  readonly baseUrl: string;
  readonly deviceInfo: {
    deviceFingerprint: string;
    deviceName: string;
    os: string;
    platform: string;
    agentVersion: string;
  };

  constructor() {
    this.baseUrl = resolveBaseUrl();
    this.deviceInfo = {
      deviceFingerprint: createDeviceFingerprint(),
      deviceName: os.hostname(),
      os: `${os.type()} ${os.release()}`,
      platform: process.platform,
      agentVersion: app.getVersion(),
    };
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  login(email: string, password: string) {
    return this.request<LoginResult>("/agent/auth/login", {
      method: "POST",
      body: { email, password, ...this.deviceInfo },
      auth: false,
    });
  }

  refresh(refreshToken: string) {
    return this.request<LoginResult>("/agent/auth/refresh", {
      method: "POST",
      body: {
        refreshToken,
        deviceFingerprint: this.deviceInfo.deviceFingerprint,
        agentVersion: this.deviceInfo.agentVersion,
      },
      auth: false,
    });
  }

  logout(refreshToken: string) {
    return this.request<{ ok: boolean }>("/agent/auth/logout", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    });
  }

  registerDevice() {
    return this.request<{ id: string }>("/agent/devices/register", {
      method: "POST",
      body: this.deviceInfo,
    });
  }

  getConfig() {
    const query = new URLSearchParams({
      agentVersion: this.deviceInfo.agentVersion,
      platform: this.deviceInfo.platform,
    });
    return this.request<AgentConfig>(`/agent/config?${query.toString()}`);
  }

  startSession(deviceId: string) {
    return this.request<{ id: string }>("/agent/sessions/start", {
      method: "POST",
      body: { deviceId, startedAt: new Date().toISOString() },
    });
  }

  heartbeat(events: HeartbeatEvent[]) {
    return this.request<{ accepted: number }>("/agent/sessions/heartbeat", {
      method: "POST",
      body: { events },
    });
  }

  endSession(sessionId: string, deviceId: string) {
    return this.request("/agent/sessions/end", {
      method: "POST",
      body: { sessionId, deviceId, endedAt: new Date().toISOString() },
    });
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      auth?: boolean;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (options.auth !== false && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.message ?? `API request failed: ${response.status}`,
      );
    }

    return data as T;
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveBaseUrl() {
  const configured =
    process.env.DIJIPEOPLE_API_BASE_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:4000/api";

  return normalizeBaseUrl(configured);
}

function createDeviceFingerprint() {
  const raw = [os.hostname(), os.platform(), os.arch(), os.userInfo().username]
    .filter(Boolean)
    .join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}
