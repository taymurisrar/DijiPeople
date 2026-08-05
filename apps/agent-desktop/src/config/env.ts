import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { app } from "electron";

loadAgentEnv();

const apiBaseUrl = normalizeBaseUrl(
  readRequiredString(
    [
      "AGENT_API_BASE_URL",
      "DIJIPEOPLE_AGENT_API_BASE_URL",
      "DIJIPEOPLE_API_BASE_URL",
      "API_BASE_URL",
    ],
    "Agent API base URL",
  ),
);

export const agentEnv = {
  appName: readRequiredString(["AGENT_APP_NAME"], "Agent app name"),

  apiBaseUrl,

  apiOrigin:
    readOptionalString(["AGENT_API_ORIGIN", "API_ORIGIN"]) ||
    getOriginFromBaseUrl(apiBaseUrl),

  appVersion: readRequiredString(["AGENT_APP_VERSION"], "Agent app version"),

  deviceRegistrationEnabled: readBoolean(
    process.env.AGENT_DEVICE_REGISTRATION_ENABLED,
    true,
  ),

  accessTokenTtl: readRequiredString(
    ["AGENT_ACCESS_TOKEN_TTL"],
    "Agent access token TTL",
  ),

  refreshTokenTtl: readRequiredString(
    ["AGENT_REFRESH_TOKEN_TTL"],
    "Agent refresh token TTL",
  ),

  sessionIdleTimeoutSeconds: readNumber(
    process.env.AGENT_SESSION_IDLE_TIMEOUT_SECONDS,
    2592000,
  ),

  sessionAbsoluteTimeoutSeconds: readNumber(
    process.env.AGENT_SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    2592000,
  ),

  sessionRefreshThresholdSeconds: readNumber(
    process.env.AGENT_SESSION_REFRESH_THRESHOLD_SECONDS,
    300,
  ),

  heartbeatIntervalSeconds: readNumber(
    process.env.AGENT_HEARTBEAT_INTERVAL_SECONDS,
    60,
  ),

  heartbeatBatchSize: readNumber(
    process.env.AGENT_HEARTBEAT_BATCH_SIZE,
    1000,
  ),

  offlineQueueEnabled: readBoolean(
    process.env.AGENT_OFFLINE_QUEUE_ENABLED,
    true,
  ),

  offlineQueueMaxItems: readNumber(
    process.env.AGENT_OFFLINE_QUEUE_MAX_ITEMS,
    5000,
  ),

  activeAppTrackingEnabled: readBoolean(
    process.env.AGENT_ACTIVE_APP_TRACKING_ENABLED,
    true,
  ),

  windowTitleTrackingEnabled: readBoolean(
    process.env.AGENT_WINDOW_TITLE_TRACKING_ENABLED,
    true,
  ),

  trayStatusEnabled: readBoolean(
    process.env.AGENT_TRAY_STATUS_ENABLED,
    true,
  ),

  updateUrl: readRequiredString(
    ["DIJIPEOPLE_AGENT_UPDATE_URL", "AGENT_UPDATE_URL"],
    "Agent update URL",
  ),

  autoUpdateEnabled: readBoolean(
    process.env.AGENT_AUTO_UPDATE_ENABLED,
    true,
  ),

  logsPath: readOptionalString(["AGENT_LOGS_PATH"]) || "",

  logMaxBytes: readNumber(
    process.env.AGENT_LOG_MAX_BYTES,
    5 * 1024 * 1024,
  ),

  logMaxFiles: readNumber(process.env.AGENT_LOG_MAX_FILES, 5),

  installerUrl: readOptionalString(["AGENT_INSTALLER_URL"]) || "",
};

export function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  const withApi = normalized.endsWith("/api") ? normalized : `${normalized}/api`;

  try {
    const url = new URL(withApi);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Invalid protocol.");
    }

    return withApi;
  } catch {
    throw new Error(
      "Invalid agent API base URL. Set AGENT_API_BASE_URL to a valid http(s) URL.",
    );
  }
}

function loadAgentEnv(): void {
  const candidateEnvPaths = getCandidateEnvPaths();

  for (const envPath of candidateEnvPaths) {
    if (!envPath || !fs.existsSync(envPath)) continue;

    const result = dotenv.config({
      path: envPath,
      override: false,
    });

    if (!result.error) {
      return;
    }
  }
}

function getCandidateEnvPaths(): string[] {
  const paths = new Set<string>();

  paths.add(path.join(process.cwd(), ".env"));
  paths.add(path.resolve(__dirname, "../../.env"));
  paths.add(path.resolve(__dirname, "../../../.env"));

  try {
    paths.add(path.join(app.getAppPath(), ".env"));
  } catch {
    // Electron app may not be ready in some test/runtime contexts.
  }

  if (process.resourcesPath) {
    paths.add(path.join(process.resourcesPath, ".env"));
  }

  if (process.execPath) {
    paths.add(path.join(path.dirname(process.execPath), ".env"));
  }

  return [...paths];
}

function getOriginFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "https://dijipeople.onrender.com";
  }
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalString(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return "";
}

function readRequiredString(keys: string[], label: string): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  throw new Error(`${label} is required. Set one of: ${keys.join(", ")}.`);
}
