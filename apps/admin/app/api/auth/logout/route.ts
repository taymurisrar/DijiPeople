import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getApiBaseUrl,
} from "@/lib/auth-config";

export async function POST() {
  const cookieStore = await cookies();

  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  const apiBaseUrl = getApiBaseUrl();

  // Optional: Inform backend to invalidate refresh token
  try {
    if (refreshToken) {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: accessToken ? `Bearer ${accessToken}` : "",
        },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
    }
  } catch {
    // Don't block logout if API fails
  }

  // 🔥 Clear cookies (important)
  cookieStore.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json(
    { ok: true },
    { status: 200 }
  );
}