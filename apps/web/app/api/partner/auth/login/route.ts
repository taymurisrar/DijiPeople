import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth";
import {
  PARTNER_ACCESS_COOKIE,
  PARTNER_REFRESH_COOKIE,
  partnerCookieOptions,
} from "@/lib/partner-auth";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

export async function POST(request: Request) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/partner-auth/login`, {
      method: "POST",
      headers: { ...forwardedClientHeaders(request), "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      return NextResponse.json(payload ?? { message: "Sign in failed." }, {
        status: response.status,
      });
    const next = NextResponse.json({ user: payload.user });
    next.cookies.set(
      PARTNER_ACCESS_COOKIE,
      payload.accessToken,
      partnerCookieOptions(payload.expiresIn ?? 1800),
    );
    next.cookies.set(
      PARTNER_REFRESH_COOKIE,
      payload.refreshToken,
      partnerCookieOptions(30 * 86_400),
    );
    return next;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Partner sign in is unavailable.",
      },
      { status: 502 },
    );
  }
}
