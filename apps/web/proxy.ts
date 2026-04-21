import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DEFAULT_AUTHENTICATED_ROUTE,
  isProtectedRoute,
  LOGIN_ROUTE,
  ACCESS_TOKEN_COOKIE,
} from "@/lib/auth-config";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const isAuthenticated = hasValidJwt(accessToken);

  if (isProtectedRoute(pathname) && !isAuthenticated) {
    const loginUrl = new URL(LOGIN_ROUTE, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith(LOGIN_ROUTE) && isAuthenticated) {
    return NextResponse.redirect(new URL(DEFAULT_AUTHENTICATED_ROUTE, request.url));
  }

  return NextResponse.next();
}

function hasValidJwt(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const clockSkewSeconds = 5;
  const exp = readNumericClaim(payload.exp);
  const nbf = readNumericClaim(payload.nbf);

  if (typeof exp === "number" && exp <= nowSeconds + clockSkewSeconds) {
    return false;
  }

  if (typeof nbf === "number" && nbf > nowSeconds + clockSkewSeconds) {
    return false;
  }

  return true;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) {
      return null;
    }

    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readNumericClaim(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
