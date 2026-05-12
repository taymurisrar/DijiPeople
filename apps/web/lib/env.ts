import { getApiBaseUrl as getSharedApiBaseUrl } from "@repo/config";

export const webEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "DijiPeople",
  appOrigin:
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_WEB_APP_URL ||
    process.env.NEXT_PUBLIC_WEB_URL ||
    "http://localhost:3001",
  apiBaseUrl: getSharedApiBaseUrl(process.env),
  sessionIdleTimeoutSeconds: readNumber(
    process.env.SESSION_IDLE_TIMEOUT_SECONDS,
    3600,
  ),
  sessionAbsoluteTimeoutSeconds: readNumber(
    process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    28800,
  ),
  sessionRefreshThresholdSeconds: readNumber(
    process.env.SESSION_REFRESH_THRESHOLD_SECONDS,
    300,
  ),
};

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
