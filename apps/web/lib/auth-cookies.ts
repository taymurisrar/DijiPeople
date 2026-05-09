import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const ACCESS_TOKEN_MAX_AGE_SECONDS = Math.floor(
  parseDurationToMilliseconds(
    process.env.JWT_ACCESS_TOKEN_TTL ?? process.env.JWT_ACCESS_TTL ?? "15m",
  ) / 1000,
);
export const REFRESH_TOKEN_MAX_AGE_SECONDS = Math.floor(
  parseDurationToMilliseconds(
    process.env.JWT_REFRESH_TOKEN_TTL ?? process.env.JWT_REFRESH_TTL ?? "7d",
  ) / 1000,
);

export function getAuthCookieOptions(
  maxAge: number,
): Pick<
  ResponseCookie,
  "httpOnly" | "sameSite" | "secure" | "path" | "maxAge" | "domain"
> {
  const isProduction = process.env.NODE_ENV === "production";
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  const sameSite = normalizeSameSite(process.env.AUTH_COOKIE_SAME_SITE);
  const secure = parseBoolean(process.env.AUTH_COOKIE_SECURE, isProduction);
  const httpOnly = parseBoolean(process.env.AUTH_COOKIE_HTTP_ONLY, true);

  return {
    httpOnly,
    sameSite: sameSite ?? (secure ? "none" : "lax"),
    secure,
    path: process.env.AUTH_COOKIE_PATH || "/",
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export function getClearAuthCookieOptions(): Pick<
  ResponseCookie,
  "httpOnly" | "sameSite" | "secure" | "path" | "maxAge" | "domain"
> {
  return getAuthCookieOptions(0);
}

export function parseDurationToMilliseconds(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d+)(ms|s|m|h|d)?$/i);

  if (!match) {
    throw new Error(`Unsupported duration "${value}".`);
  }

  const amount = Number.parseInt(match[1] ?? "0", 10);
  const unit = (match[2] ?? "s").toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * multipliers[unit];
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeSameSite(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (
    normalized === "strict" ||
    normalized === "lax" ||
    normalized === "none"
  ) {
    return normalized;
  }

  return null;
}
