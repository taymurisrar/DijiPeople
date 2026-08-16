import {
  getApiBaseUrl as getSharedApiBaseUrl,
  resolveAppUrls,
} from "@repo/config";

// Cross-app URLs resolve through @repo/config, which fails a production build
// rather than falling back to a loopback origin. See packages/config/index.js.
const appUrls = resolveAppUrls(process.env);

export const adminEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "DijiPeople Admin",
  appOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || appUrls.admin,
  /** The tenant workspace operators deep-link into. */
  workspaceUrl: appUrls.web,
  landingUrl: appUrls.landing,
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
