import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  LOGIN_ROUTE,
  isProtectedRoute,
} from "@/lib/auth-config";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const isAuthenticated = hasValidJwt(accessToken);

  if (isProtectedRoute(pathname) && !isAuthenticated) {
    const loginUrl = new URL(LOGIN_ROUTE, request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

function hasValidJwt(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
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

  if (!hasRequiredSessionClaims(payload)) {
    return false;
  }

  return true;
}

function hasRequiredSessionClaims(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.sub === "string" &&
    typeof payload.userId === "string" &&
    typeof payload.tenantId === "string" &&
    typeof payload.email === "string" &&
    typeof payload.firstName === "string" &&
    typeof payload.lastName === "string" &&
    isStringArray(payload.roleIds) &&
    isStringArray(payload.permissionKeys)
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
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
    const parsed: unknown = JSON.parse(decoded);

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