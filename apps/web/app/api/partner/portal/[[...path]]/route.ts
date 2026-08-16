import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth";
import {
  PARTNER_ACCESS_COOKIE,
  PARTNER_REFRESH_COOKIE,
  partnerCookieOptions,
} from "@/lib/partner-auth";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

type Context = { params: Promise<{ path?: string[] }> };

async function forward(request: Request, context: Context, method: string) {
  const jar = await cookies();
  const { path = [] } = await context.params;
  const suffix = path.map(encodeURIComponent).join("/");
  const url = new URL(request.url);
  const body = method === "GET" ? undefined : await request.text();
  let accessToken = jar.get(PARTNER_ACCESS_COOKIE)?.value;
  if (!accessToken)
    return NextResponse.json(
      { message: "Partner sign in is required." },
      { status: 401 },
    );

  let response = await callApi(request, accessToken, suffix, url.search, method, body);
  let refreshed: {
    accessToken: string;
    refreshToken: string;
    expiresIn?: number;
  } | null = null;
  if (response.status === 401) {
    const refreshToken = jar.get(PARTNER_REFRESH_COOKIE)?.value;
    if (refreshToken) {
      const refreshResponse = await fetch(
        `${getApiBaseUrl()}/partner-auth/refresh`,
        {
          method: "POST",
          headers: { ...forwardedClientHeaders(request), "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
          cache: "no-store",
        },
      );
      if (refreshResponse.ok) {
        refreshed = await refreshResponse.json();
        accessToken = refreshed!.accessToken;
        response = await callApi(request, accessToken, suffix, url.search, method, body);
      }
    }
  }
  const text = await response.text();
  const next = new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
  if (refreshed) {
    next.cookies.set(
      PARTNER_ACCESS_COOKIE,
      refreshed.accessToken,
      partnerCookieOptions(refreshed.expiresIn ?? 1800),
    );
    next.cookies.set(
      PARTNER_REFRESH_COOKIE,
      refreshed.refreshToken,
      partnerCookieOptions(30 * 86_400),
    );
  }
  if (response.status === 401) {
    next.cookies.delete(PARTNER_ACCESS_COOKIE);
    next.cookies.delete(PARTNER_REFRESH_COOKIE);
  }
  return next;
}

function callApi(
  request: Request,
  token: string,
  suffix: string,
  search: string,
  method: string,
  body?: string,
) {
  return fetch(
    `${getApiBaseUrl()}/partner-portal${suffix ? `/${suffix}` : ""}${search}`,
    {
      method,
      headers: {
        ...forwardedClientHeaders(request),
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    },
  );
}

export const GET = (request: Request, context: Context) =>
  forward(request, context, "GET");
export const POST = (request: Request, context: Context) =>
  forward(request, context, "POST");
export const PATCH = (request: Request, context: Context) =>
  forward(request, context, "PATCH");
