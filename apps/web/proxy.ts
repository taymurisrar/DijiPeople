import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  LOGIN_ROUTE,
  REFRESH_TOKEN_COOKIE,
  isProtectedRoute,
} from "@/lib/auth-config";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie =
    Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value) ||
    Boolean(request.cookies.get(REFRESH_TOKEN_COOKIE)?.value);

  if (isProtectedRoute(pathname) && !hasSessionCookie) {
    const loginUrl = new URL(LOGIN_ROUTE, request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === LOGIN_ROUTE && hasSessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
