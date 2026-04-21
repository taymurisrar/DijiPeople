import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  LOGIN_ROUTE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth-config";

export async function POST() {
  await clearAuthCookies();

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  await clearAuthCookies();

  const requestUrl = new URL(request.url);
  const nextPath = requestUrl.searchParams.get("next") || "/dashboard";
  const reason = requestUrl.searchParams.get("reason");

  const redirectUrl = new URL(LOGIN_ROUTE, requestUrl.origin);
  redirectUrl.searchParams.set("next", nextPath);

  if (reason) {
    redirectUrl.searchParams.set("reason", reason);
  }

  return NextResponse.redirect(redirectUrl);
}

async function clearAuthCookies() {
  const cookieStore = await cookies();
  const useSecureCookies = process.env.NODE_ENV === "production";

  cookieStore.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}
