import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getApiBaseUrl,
} from "@/lib/auth-config";

type JsonRecord = Record<string, unknown>;

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

type LoginSuccessResponse = JsonRecord & {
  user?: unknown;
  tenant?: unknown;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
};

const DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 15;
const DEFAULT_REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const COOKIE_CLOCK_SKEW_SECONDS = 5;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid request body. Expected valid JSON." },
      { status: 400 },
    );
  }

  const apiBaseUrl = getApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const rawBody = await response.text();
    const data = rawBody ? safeParseJson(rawBody) : null;

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            extractErrorMessage(data) ??
            `Login failed with status ${response.status}.`,
          upstreamStatus: response.status,
        },
        { status: response.status },
      );
    }

    const tokenPair =
      extractAuthTokensFromSetCookie(response) ??
      (isLoginSuccessResponse(data) ? extractTokensFromJson(data) : null);

    if (!tokenPair) {
      return NextResponse.json(
        {
          message:
            "API login response did not include usable auth cookies or token payload.",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const accessTokenMaxAge =
      getJwtCookieMaxAgeSeconds(tokenPair.accessToken) ??
      DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS;

    const refreshTokenMaxAge =
      getJwtCookieMaxAgeSeconds(tokenPair.refreshToken) ??
      DEFAULT_REFRESH_TOKEN_MAX_AGE_SECONDS;

    if (accessTokenMaxAge <= 0 || refreshTokenMaxAge <= 0) {
      return NextResponse.json(
        {
          message: "API returned expired authentication tokens.",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const cookieStore = await cookies();
    const useSecureCookies = process.env.NODE_ENV === "production";

    cookieStore.set(ACCESS_TOKEN_COOKIE, tokenPair.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies,
      path: "/",
      maxAge: accessTokenMaxAge,
    });

    cookieStore.set(REFRESH_TOKEN_COOKIE, tokenPair.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies,
      path: "/",
      maxAge: refreshTokenMaxAge,
    });

    return NextResponse.json(
      {
        ok: true,
        user: isJsonRecord(data) && "user" in data ? data.user : null,
        tenant: isJsonRecord(data) && "tenant" in data ? data.tenant : null,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? `Unable to reach API at ${apiBaseUrl}: ${error.message}`
        : `Unable to reach API at ${apiBaseUrl}.`;

    return NextResponse.json({ message }, { status: 502 });
  }
}

function safeParseJson(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractErrorMessage(data: JsonRecord | null): string | null {
  if (!data) {
    return null;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (
    Array.isArray(data.message) &&
    data.message.every((item) => typeof item === "string")
  ) {
    return data.message.join(", ");
  }

  if (isJsonRecord(data.error)) {
    const nestedMessage = data.error.message;

    if (typeof nestedMessage === "string") {
      return nestedMessage;
    }
  }

  return null;
}

function isLoginSuccessResponse(
  data: JsonRecord | null,
): data is LoginSuccessResponse {
  return Boolean(data && typeof data === "object");
}

function extractTokensFromJson(data: LoginSuccessResponse): TokenPair | null {
  const accessToken = data.tokens?.accessToken;
  const refreshToken = data.tokens?.refreshToken;

  if (!isUsableToken(accessToken) || !isUsableToken(refreshToken)) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

function extractAuthTokensFromSetCookie(response: Response): TokenPair | null {
  const setCookieHeaders = readSetCookieHeaders(response.headers);

  if (setCookieHeaders.length === 0) {
    return null;
  }

  const accessToken = extractCookieValue(setCookieHeaders, ACCESS_TOKEN_COOKIE);
  const refreshToken = extractCookieValue(
    setCookieHeaders,
    REFRESH_TOKEN_COOKIE,
  );

  if (!isUsableToken(accessToken) || !isUsableToken(refreshToken)) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

function readSetCookieHeaders(headers: Headers): string[] {
  const headersWithGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithGetSetCookie.getSetCookie === "function") {
    return headersWithGetSetCookie.getSetCookie();
  }

  const combinedHeader = headers.get("set-cookie");

  if (!combinedHeader) {
    return [];
  }

  return splitSetCookieHeader(combinedHeader);
}

function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,\s]+=)/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractCookieValue(
  setCookieHeaders: string[],
  cookieName: string,
): string | null {
  const prefix = `${cookieName}=`;

  for (const header of setCookieHeaders) {
    if (!header.startsWith(prefix)) {
      continue;
    }

    const firstSegment = header.split(";")[0];
    const rawValue = firstSegment.slice(prefix.length);

    return rawValue ? decodeURIComponent(rawValue) : null;
  }

  return null;
}

function isUsableToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 20;
}

function getJwtCookieMaxAgeSeconds(token: string): number | null {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return null;
  }

  const exp = readNumericClaim(payload.exp);

  if (typeof exp !== "number") {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.max(0, exp - nowSeconds - COOKIE_CLOCK_SKEW_SECONDS);
}

function decodeJwtPayload(token: string): JsonRecord | null {
  const [, payloadSegment] = token.split(".");

  if (!payloadSegment) {
    return null;
  }

  try {
    const normalizedPayload = payloadSegment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");

    const decodedPayload = Buffer.from(normalizedPayload, "base64").toString(
      "utf8",
    );

    const parsed: unknown = JSON.parse(decodedPayload);

    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readNumericClaim(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}