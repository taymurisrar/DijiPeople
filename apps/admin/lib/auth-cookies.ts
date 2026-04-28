import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 15;
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function getAuthCookieOptions(
  maxAge: number,
): Pick<ResponseCookie, "httpOnly" | "sameSite" | "secure" | "path" | "maxAge" | "domain"> {
  const isProduction = process.env.NODE_ENV === "production";
  const domain = isProduction ? process.env.AUTH_COOKIE_DOMAIN : undefined;

  return {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    path: "/",
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
