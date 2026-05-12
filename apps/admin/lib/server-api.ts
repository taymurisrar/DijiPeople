import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
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

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
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

export async function proxyApiJsonResponse(response: Response) {
  const rawBody = await response.text();
  const data = rawBody ? safeParseJson(rawBody) : null;

  if (data) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(
    {
      message: response.ok
        ? "Request succeeded without a JSON body."
        : response.statusText || "Request failed.",
    },
    { status: response.status },
  );
}

export async function proxyApiFileResponse(response: Response) {
  const body = await response.arrayBuffer();
  const headers = new Headers();

  copyHeaderIfPresent(response.headers, headers, "content-type");
  copyHeaderIfPresent(response.headers, headers, "content-disposition");
  copyHeaderIfPresent(response.headers, headers, "content-length");
  copyHeaderIfPresent(response.headers, headers, "cache-control");

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
