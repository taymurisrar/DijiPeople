import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
  REFRESH_TOKEN_COOKIE,
  getApiBaseUrl,
} from "@/lib/auth-config";

type JsonRecord = Record<string, unknown>;

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  traceId?: string;
  description?: string;

  constructor(status: number, message: string, options: { code?: string; traceId?: string; description?: string } = {}) {
    super(message);
    this.status = status;
    this.code = options.code;
    this.traceId = options.traceId;
    this.description = options.description;
  }
}

export async function apiRequest(path: string, init?: RequestInit) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const headers = new Headers(init?.headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  headers.set("X-DijiPeople-App", AUTH_APP_CLIENT_ID);
  if (!headers.has("X-Request-Id")) {
    const requestId = createRequestId();
    headers.set("X-Request-Id", requestId);
    headers.set("X-Trace-Id", requestId);
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status !== 401 || !refreshToken || path === "/auth/refresh") {
    return response;
  }

  const refreshedAccessToken = await refreshAccessToken(refreshToken);
  if (!refreshedAccessToken) {
    return response;
  }

  const retryHeaders = new Headers(headers);
  retryHeaders.set("Authorization", `Bearer ${refreshedAccessToken}`);

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: retryHeaders,
    cache: "no-store",
  });
}

export async function apiRequestJson<T>(path: string, init?: RequestInit) {
  const response = await apiRequest(path, init);
  const rawBody = await response.text();
  const data = rawBody ? safeParseJson(rawBody) : null;

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      extractErrorMessage(data) ?? `Request failed with status ${response.status}.`,
      {
        code: extractErrorCode(data),
        traceId:
          extractTraceId(data) ??
          response.headers.get("x-trace-id") ??
          response.headers.get("x-request-id") ??
          undefined,
        description: extractErrorDescription(data),
      },
    );
  }

  return data as T;
}

/**
 * Forward an API response, and never turn a failure into a contextless one.
 *
 * The API always answers with the standard error envelope, so the usual case is
 * a straight pass-through. What matters is the other case: when the upstream
 * replies with no body — it is restarting, or a gateway in front of it answered
 * instead — this used to emit `{ message: "Bad Gateway" }`. The browser then had
 * a 502 with no trace id, no path and no method, which is exactly as much as
 * "something went wrong" and cost a round trip with a downloaded log file to
 * diagnose. A synthesised envelope keeps the shape the client already
 * understands and names the request that failed.
 */
export async function proxyApiJsonResponse(
  response: Response,
  context?: { path?: string; method?: string },
) {
  const rawBody = await response.text();
  const data = rawBody ? safeParseJson(rawBody) : null;

  if (data) {
    return NextResponse.json(data, { status: response.status });
  }

  if (response.ok) {
    return NextResponse.json(
      { message: "Request succeeded without a JSON body." },
      { status: response.status },
    );
  }

  return NextResponse.json(
    buildProxyErrorEnvelope({
      status: response.status,
      message: `The API returned ${response.status}${
        response.statusText ? ` ${response.statusText}` : ""
      } with no response body.`,
      description:
        response.status >= 502
          ? "The API did not answer. It may be restarting, or a gateway in front of it responded instead."
          : "The API rejected the request without explaining why.",
      context,
      upstreamStatus: response.status,
    }),
    { status: response.status },
  );
}

/**
 * The envelope for a failure that never reached the API at all.
 *
 * Distinguishing "could not reach the API" from "the API said no" is the whole
 * point: they have different causes and different fixes, and collapsing both
 * into a bare 502 tells the operator neither.
 */
export function proxyUnreachableResponse(
  error: unknown,
  context?: { path?: string; method?: string },
) {
  const cause = error instanceof Error ? error.message : String(error);
  return NextResponse.json(
    buildProxyErrorEnvelope({
      status: 502,
      message: `The DijiPeople API could not be reached (${cause}).`,
      description:
        "The request never reached the API. Check that the API service is running and reachable from the admin app.",
      context,
      cause,
    }),
    { status: 502 },
  );
}

function buildProxyErrorEnvelope(input: {
  status: number;
  message: string;
  description: string;
  context?: { path?: string; method?: string };
  upstreamStatus?: number;
  cause?: string;
}) {
  const traceId = createRequestId();
  return {
    success: false as const,
    /*
     * Prefixed like a server trace id so it reads as a real reference. It is
     * generated here because the request produced no server-side trace to quote.
     */
    traceId,
    timestamp: new Date().toISOString(),
    statusCode: input.status,
    errorCode: input.status === 504 ? "INTEGRATION_TIMEOUT" : "INTEGRATION_FAILED",
    message: input.message,
    description: input.description,
    path: input.context?.path,
    method: input.context?.method,
    details: {
      origin: "admin-proxy",
      apiBaseUrl: getApiBaseUrl(),
      upstreamStatus: input.upstreamStatus,
      cause: input.cause,
    },
    support: {
      reference: traceId,
      message:
        "Quote this reference. It identifies the admin request; the API has no matching log because it did not answer.",
    },
  };
}

export async function proxyApiFileResponse(response: Response) {
  const body = await response.arrayBuffer();
  const headers = new Headers();

  copyHeaderIfPresent(response.headers, headers, "content-type");
  copyHeaderIfPresent(response.headers, headers, "content-disposition");
  copyHeaderIfPresent(response.headers, headers, "cache-control");

  /*
   * Content-Length is deliberately not forwarded. fetch() transparently decodes
   * a compressed upstream body, so the upstream header describes the encoded
   * payload while `body` holds the decoded bytes. Forwarding the smaller value
   * makes Node stop writing at that byte count and truncates the download
   * mid-stream. The runtime derives the correct length from the buffer.
   */
  return new NextResponse(body, {
    status: response.status,
    headers,
  });
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as JsonRecord;
  } catch {
    return null;
  }
}

function extractErrorMessage(data: JsonRecord | null) {
  if (!data) {
    return null;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (data.error && typeof data.error === "object" && "message" in data.error) {
    const message = (data.error as JsonRecord).message;
    if (typeof message === "string") return message;
  }

  if (Array.isArray(data.message) && data.message.every((item) => typeof item === "string")) {
    return data.message.join(", ");
  }

  return null;
}

function extractErrorDescription(data: JsonRecord | null) {
  if (!data) return undefined;
  return typeof data.description === "string" ? data.description : undefined;
}

function extractErrorCode(data: JsonRecord | null) {
  if (!data) return undefined;
  if (typeof data.errorCode === "string") return data.errorCode;
  if (typeof data.code === "string") return data.code;
  if (data.error && typeof data.error === "object") {
    const code = (data.error as JsonRecord).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function extractTraceId(data: JsonRecord | null) {
  if (!data) return undefined;
  if (typeof data.traceId === "string") return data.traceId;
  if (typeof data.requestId === "string") return data.requestId;
  return undefined;
}

function copyHeaderIfPresent(source: Headers, target: Headers, headerName: string) {
  const value = source.get(headerName);
  if (value) target.set(headerName, value);
}

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `admin_${crypto.randomUUID()}`;
  }
  return `admin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) return null;

  const data = (await response.json().catch(() => null)) as
    | { tokens?: { accessToken?: unknown } }
    | null;

  return typeof data?.tokens?.accessToken === "string"
    ? data.tokens.accessToken
    : null;
}
