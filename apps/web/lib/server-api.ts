import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth-config";
import { getApiBaseUrl } from "@/lib/auth";

type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonArray = JsonValue[];

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  includeAuth?: boolean;
};

type ParsedResponseBody =
  | JsonObject
  | JsonValue[]
  | string
  | null
  | undefined;

const DEFAULT_TIMEOUT_MS = 30_000;
const JSON_CONTENT_TYPES = [
  "application/json",
  "application/problem+json",
  "application/vnd.api+json",
];

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  body?: ParsedResponseBody;
  url?: string;
  method?: string;
  responseHeaders?: Record<string, string>;
  isNetworkError?: boolean;
  isTimeout?: boolean;

  constructor(params: {
    status: number;
    message: string;
    code?: string;
    body?: ParsedResponseBody;
    url?: string;
    method?: string;
    responseHeaders?: Record<string, string>;
    isNetworkError?: boolean;
    isTimeout?: boolean;
  }) {
    super(params.message);
    this.name = "ApiRequestError";
    this.status = params.status;
    this.code = params.code;
    this.body = params.body;
    this.url = params.url;
    this.method = params.method;
    this.responseHeaders = params.responseHeaders;
    this.isNetworkError = params.isNetworkError;
    this.isTimeout = params.isTimeout;
  }
}

export async function apiRequest(
  path: string,
  init: ApiRequestOptions = {},
): Promise<Response> {
  validateRequestPath(path);

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  const baseUrl = normalizeBaseUrl(getApiBaseUrl());
  const url = buildRequestUrl(baseUrl, path);

  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  const includeAuth = init.includeAuth !== false;

  if (includeAuth && accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  applyContentTypeHeader(headers, init.body);

  const timeoutMs =
    typeof init.timeoutMs === "number" && init.timeoutMs > 0
      ? init.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      method,
      headers,
      signal: mergeAbortSignals(init.signal, controller.signal),
      cache: init.cache ?? "no-store",
    });

    return response;
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiRequestError({
        status: 408,
        code: "REQUEST_TIMEOUT",
        message: `Request timed out after ${timeoutMs}ms.`,
        url,
        method,
        isTimeout: true,
        isNetworkError: true,
      });
    }

    throw new ApiRequestError({
      status: 503,
      code: "NETWORK_ERROR",
      message: extractFetchErrorMessage(error, url, method),
      url,
      method,
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiRequestJson<T>(
  path: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const response = await apiRequest(path, init);
  const data = await parseResponseBody(response);

  if (!response.ok) {
    throw buildApiRequestError(response, data, path, init.method);
  }

  return data as T;
}

export async function proxyApiJsonResponse(
  response: Response,
): Promise<NextResponse> {
  const data = await parseResponseBody(response);

  if (response.status === 204 || response.status === 205) {
    return new NextResponse(null, { status: response.status });
  }

  if (typeof data === "string") {
    const message = data.trim();

    return NextResponse.json(
      {
        message: response.ok
          ? message || "Request completed successfully."
          : message || response.statusText || "Request failed.",
      },
      { status: response.status },
    );
  }

  if (isJsonLike(data)) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(
    {
      message: response.ok
        ? "Request succeeded without a response body."
        : response.statusText || "Request failed.",
    },
    { status: response.status },
  );
}

export async function proxyApiFileResponse(
  response: Response,
): Promise<NextResponse> {
  const body = await response.arrayBuffer();
  const headers = new Headers();

  copyHeaderIfPresent(response.headers, headers, "content-type");
  copyHeaderIfPresent(response.headers, headers, "content-disposition");
  copyHeaderIfPresent(response.headers, headers, "content-length");
  copyHeaderIfPresent(response.headers, headers, "cache-control");
  copyHeaderIfPresent(response.headers, headers, "etag");
  copyHeaderIfPresent(response.headers, headers, "last-modified");

  return new NextResponse(body, {
    status: response.status,
    headers,
  });
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong.",
): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function buildApiRequestError(
  response: Response,
  data: ParsedResponseBody,
  path: string,
  method?: string,
): ApiRequestError {
const message =
  extractErrorMessage(data) ??
  (response.statusText || `Request failed with status ${response.status}.`);

  const errorCode =
    extractErrorCode(data) ??
    (response.status === 400
      ? "BAD_REQUEST"
      : response.status === 401
        ? "UNAUTHORIZED"
        : response.status === 403
          ? "FORBIDDEN"
          : response.status === 404
            ? "NOT_FOUND"
            : response.status === 409
              ? "CONFLICT"
              : response.status === 422
                ? "VALIDATION_ERROR"
                : response.status >= 500
                  ? "SERVER_ERROR"
                  : "REQUEST_FAILED");

  return new ApiRequestError({
    status: response.status,
    message,
    code: errorCode,
    body: data,
    url: path,
    method: method?.toUpperCase() ?? "GET",
    responseHeaders: headersToObject(response.headers),
  });
}

async function parseResponseBody(
  response: Response,
): Promise<ParsedResponseBody> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const contentType = getContentType(response.headers);

  try {
    if (isJsonContentType(contentType)) {
      const text = await response.text();
      if (!text.trim()) {
        return null;
      }

      return safeParseJson(text) ?? text;
    }

    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    const parsedJson = safeParseJson(text);
    return parsedJson ?? text;
  } catch {
    return null;
  }
}

function extractErrorMessage(data: ParsedResponseBody): string | null {
  if (!data) {
    return null;
  }

  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed || null;
  }

  if (Array.isArray(data)) {
    const messages = data
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        if (isJsonObject(item) && typeof item.message === "string") {
          return item.message.trim();
        }

        return null;
      })
      .filter((value): value is string => Boolean(value));

    return messages.length ? messages.join(", ") : null;
  }

  const directMessageCandidates = [
    data.message,
    data.error,
    data.title,
    data.detail,
    data.description,
  ];

  for (const candidate of directMessageCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

if (Array.isArray(data.message)) {
  const messageArray = data.message as unknown[];

  const messages = messageArray.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );

  if (messages.length) {
    return messages.join(", ");
  }
}

  if (isJsonObject(data.errors)) {
    const nestedMessages = flattenValidationErrors(data.errors);
    if (nestedMessages.length) {
      return nestedMessages.join(", ");
    }
  }

  return null;
}

function extractErrorCode(data: ParsedResponseBody): string | undefined {
  if (!data || typeof data === "string" || Array.isArray(data)) {
    return undefined;
  }

  const candidates = [data.code, data.errorCode, data.error_code];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function flattenValidationErrors(
  value: JsonValue | Record<string, unknown>,
): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenValidationErrors(item as JsonValue));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([field, fieldValue]) => {
    if (typeof fieldValue === "string" && fieldValue.trim()) {
      return [`${field}: ${fieldValue.trim()}`];
    }

    if (Array.isArray(fieldValue)) {
      const messages = fieldValue
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((message) => `${field}: ${message.trim()}`);

      if (messages.length) {
        return messages;
      }
    }

    const nested = flattenValidationErrors(fieldValue as JsonValue);
    if (nested.length) {
      return nested.map((message) => `${field}: ${message}`);
    }

    return [];
  });
}

function safeParseJson(value: string): JsonObject | JsonValue[] | null {
  try {
    return JSON.parse(value) as JsonObject | JsonValue[];
  } catch {
    return null;
  }
}

function validateRequestPath(path: string) {
  if (typeof path !== "string" || !path.trim()) {
    throw new Error("API request path is required.");
  }

  if (/^\s+$/.test(path)) {
    throw new Error("API request path cannot be empty.");
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    throw new Error("API base URL is not configured.");
  }

  return baseUrl.replace(/\/+$/, "");
}

function buildRequestUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return path.startsWith("/") ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
}

function applyContentTypeHeader(headers: Headers, body: BodyInit | null | undefined) {
  if (!body || headers.has("Content-Type")) {
    return;
  }

  if (typeof body === "string") {
    const trimmed = body.trim();

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      headers.set("Content-Type", "application/json");
      return;
    }

    headers.set("Content-Type", "text/plain;charset=UTF-8");
    return;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return;
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    return;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob && body.type) {
    headers.set("Content-Type", body.type);
  }
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();

  return (
    JSON_CONTENT_TYPES.some((type) => normalized.includes(type)) ||
    normalized.endsWith("+json")
  );
}

function getContentType(headers: Headers): string | null {
  return headers.get("content-type");
}

function copyHeaderIfPresent(
  source: Headers,
  target: Headers,
  headerName: string,
) {
  const value = source.get(headerName);
  if (value) {
    target.set(headerName, value);
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonLike(value: ParsedResponseBody): value is JsonObject | JsonValue[] {
  return Boolean(value) && (Array.isArray(value) || isJsonObject(value));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function extractFetchErrorMessage(
  error: unknown,
  url?: string,
  method?: string,
): string {
  const fallbackBaseMessage = "Unable to connect to the server.";

  if (error instanceof Error) {
    const rawMessage = error.message.trim();
    if (rawMessage) {
      // Node/undici often returns only "fetch failed", which is not actionable.
      if (rawMessage.toLowerCase() === "fetch failed") {
        const requestTarget = url ? `${method ?? "GET"} ${url}` : "API request";
        return `${fallbackBaseMessage} Could not reach ${requestTarget}. Ensure services/api is running on port 4000.`;
      }
      return rawMessage;
    }
  }

  return fallbackBaseMessage;
}

function mergeAbortSignals(
  externalSignal: AbortSignal | null | undefined,
  internalSignal: AbortSignal,
): AbortSignal {
  if (!externalSignal) {
    return internalSignal;
  }

  if (externalSignal.aborted) {
    return externalSignal;
  }

  const controller = new AbortController();

  const abort = () => controller.abort();

  externalSignal.addEventListener("abort", abort, { once: true });
  internalSignal.addEventListener("abort", abort, { once: true });

  return controller.signal;
}
