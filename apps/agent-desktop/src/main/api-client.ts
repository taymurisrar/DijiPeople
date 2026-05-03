import { app } from "electron";
import os from "node:os";
import crypto from "node:crypto";
import type { AgentConfig, HeartbeatEvent, LoginResult } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 20_000;
const MAX_HEARTBEAT_BATCH_SIZE = 1000;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
};

type ApiErrorPayload = {
  message?: string;
  error?: string;
  code?: string;
  statusCode?: number;
};

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
      deviceName: sanitizeDeviceName(os.hostname()),
      os: `${os.type()} ${os.release()}`.trim(),
      platform: process.platform,
      agentVersion: app.getVersion(),
    };
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token?.trim() || null;
  }

  login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new Error("Work email is required.");
    }

    if (!password) {
      throw new Error("Password is required.");
    }

    return this.request<LoginResult>("/agent/auth/login", {
      method: "POST",
      body: {
        email: normalizedEmail,
        password,
        ...this.deviceInfo,
      },
      auth: false,
    });
  }

  refresh(refreshToken: string): Promise<LoginResult> {
    if (!refreshToken?.trim()) {
      throw new Error("Refresh token is required.");
    }

    return this.request<LoginResult>("/agent/auth/refresh", {
      method: "POST",
      body: {
        refreshToken: refreshToken.trim(),
        deviceFingerprint: this.deviceInfo.deviceFingerprint,
        agentVersion: this.deviceInfo.agentVersion,
      },
      auth: false,
    });
  }

  logout(refreshToken: string): Promise<{ ok: boolean }> {
    if (!refreshToken?.trim()) {
      return Promise.resolve({ ok: true });
    }

    return this.request<{ ok: boolean }>("/agent/auth/logout", {
      method: "POST",
      body: {
        refreshToken: refreshToken.trim(),
        deviceFingerprint: this.deviceInfo.deviceFingerprint,
      },
      auth: false,
    });
  }

  registerDevice(): Promise<{ id: string }> {
    return this.request<{ id: string }>("/agent/devices/register", {
      method: "POST",
      body: this.deviceInfo,
    });
  }

  getConfig(): Promise<AgentConfig> {
    const query = new URLSearchParams({
      agentVersion: this.deviceInfo.agentVersion,
      platform: this.deviceInfo.platform,
    });

    return this.request<AgentConfig>(`/agent/config?${query.toString()}`);
  }

  startSession(deviceId: string): Promise<{ id: string }> {
    if (!deviceId?.trim()) {
      throw new Error("Device id is required to start an agent session.");
    }

    return this.request<{ id: string }>("/agent/sessions/start", {
      method: "POST",
      body: {
        deviceId: deviceId.trim(),
        startedAt: new Date().toISOString(),
      },
    });
  }

  heartbeat(events: HeartbeatEvent[]): Promise<{ accepted: number }> {
    if (!Array.isArray(events) || events.length === 0) {
      return Promise.resolve({ accepted: 0 });
    }

    if (events.length > MAX_HEARTBEAT_BATCH_SIZE) {
      throw new Error(
        `Heartbeat batch cannot exceed ${MAX_HEARTBEAT_BATCH_SIZE} events.`,
      );
    }

    return this.request<{ accepted: number }>("/agent/sessions/heartbeat", {
      method: "POST",
      body: { events },
      timeoutMs: HEARTBEAT_TIMEOUT_MS,
    });
  }

  endSession(
    sessionId: string,
    deviceId: string,
  ): Promise<{ ok?: boolean } | null> {
    if (!sessionId?.trim() || !deviceId?.trim()) {
      return Promise.resolve(null);
    }

    return this.request<{ ok?: boolean }>("/agent/sessions/end", {
      method: "POST",
      body: {
        sessionId: sessionId.trim(),
        deviceId: deviceId.trim(),
        endedAt: new Date().toISOString(),
      },
    });
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-DijiPeople-Agent-Version": this.deviceInfo.agentVersion,
      "X-DijiPeople-Agent-Platform": this.deviceInfo.platform,
    };

    if (options.auth !== false) {
      if (!this.accessToken) {
        clearTimeout(timeout);
        throw new Error("Authentication token is missing.");
      }

      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const data = await this.parseResponse(response);

      if (!response.ok) {
        throw this.createApiError(response.status, data);
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(path: string): string {
    if (!path.startsWith("/")) {
      throw new Error("API path must start with '/'.");
    }

    return `${this.baseUrl}${path}`;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";

    if (response.status === 204) {
      return null;
    }

    if (!contentType.includes("application/json")) {
      const text = await response.text().catch(() => "");

      if (!response.ok) {
        return {
          message: text || `API request failed with status ${response.status}.`,
        };
      }

      return text;
    }

    return response.json().catch(() => null);
  }

  private createApiError(status: number, data: unknown): Error {
    const payload = this.toApiErrorPayload(data);

    const message =
      payload.message ||
      payload.error ||
      this.getDefaultErrorMessage(status);

    const error = new Error(message);

    Object.assign(error, {
      status,
      code: payload.code,
      statusCode: payload.statusCode ?? status,
    });

    return error;
  }

  private toApiErrorPayload(data: unknown): ApiErrorPayload {
    if (!data || typeof data !== "object") {
      return {};
    }

    return data as ApiErrorPayload;
  }

  private getDefaultErrorMessage(status: number): string {
    if (status === 400) return "Invalid request.";
    if (status === 401) return "Invalid email or password.";
    if (status === 403) return "You do not have permission to perform this action.";
    if (status === 404) return "Requested resource was not found.";
    if (status === 409) return "Request could not be completed due to a conflict.";
    if (status === 422) return "Validation failed.";
    if (status >= 500) return "Server error. Please try again later.";

    return `API request failed with status ${status}.`;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function resolveBaseUrl(): string {
  const configured =
    process.env.DIJIPEOPLE_API_BASE_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:4000/api";

  const normalized = normalizeBaseUrl(configured);

  try {
    const url = new URL(normalized);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Invalid protocol.");
    }

    return normalized;
  } catch {
    throw new Error(
      "Invalid API base URL. Set DIJIPEOPLE_API_BASE_URL or API_BASE_URL correctly.",
    );
  }
}

function sanitizeDeviceName(value: string): string {
  const cleaned = value.trim();

  if (!cleaned) {
    return "Unknown Device";
  }

  return cleaned.slice(0, 120);
}

function createDeviceFingerprint(): string {
  const username = safeGetUsername();

  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.release(),
    username,
  ]
    .filter(Boolean)
    .join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

function safeGetUsername(): string {
  try {
    return os.userInfo().username;
  } catch {
    return "unknown";
  }
}