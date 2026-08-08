import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
} from "@/lib/auth-config";
import { getApiBaseUrl } from "@/lib/auth";
import { normalizeApiError } from "@/lib/api-error";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  getAuthCookieOptions,
  parseDurationToMilliseconds,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth-cookies";

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

type ParsedResponseBody = JsonObject | JsonValue[] | string | null | undefined;

const DEFAULT_TIMEOUT_MS = 30_000;
const JSON_CONTENT_TYPES = [
  "application/json",
  "application/problem+json",
  "application/vnd.api+json",
];

type RefreshedAuthTokens = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresIn?: string;
  rememberMe?: boolean;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  body?: ParsedResponseBody;
  url?: string;
  method?: string;
  responseHeaders?: Record<string, string>;
  isNetworkError?: boolean;
  isTimeout?: boolean;
  traceId?: string;
  errorCode?: string;
  description?: string;
  details?: unknown;

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
    traceId?: string;
    description?: string;
    details?: unknown;
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
    this.traceId = params.traceId;
    this.errorCode = params.code;
    this.description = params.description;
    this.details = params.details;
  }
}

export async function apiRequest(
  path: string,
  init: ApiRequestOptions = {},
): Promise<Response> {
  validateRequestPath(path);

  const cookieStore = await cookies();
  let accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  const baseUrl = normalizeBaseUrl(getApiBaseUrl());
  const url = buildRequestUrl(baseUrl, path);

  const method = (init.method ?? "GET").toUpperCase();
  const includeAuth = init.includeAuth !== false;

  if (
    includeAuth &&
    !accessToken &&
    refreshToken &&
    shouldAttemptServerRefresh(path)
  ) {
    const refreshed = await refreshServerAuthTokens(baseUrl, refreshToken);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      await persistRefreshedAuthCookies(refreshed);
    }
  }

  const timeoutMs =
    typeof init.timeoutMs === "number" && init.timeoutMs > 0
      ? init.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = buildRequestHeaders(init, accessToken, includeAuth);

  try {
    let response = await fetch(url, {
      ...init,
      method,
      headers,
      signal: mergeAbortSignals(init.signal, controller.signal),
      cache: init.cache ?? "no-store",
    });

    if (
      response.status === 401 &&
      includeAuth &&
      refreshToken &&
      shouldAttemptServerRefresh(path)
    ) {
      const refreshed = await refreshServerAuthTokens(baseUrl, refreshToken);
      if (refreshed) {
        await persistRefreshedAuthCookies(refreshed);
        response = await fetch(url, {
          ...init,
          method,
          headers: buildRequestHeaders(init, refreshed.accessToken, true),
          signal: mergeAbortSignals(init.signal, controller.signal),
          cache: init.cache ?? "no-store",
        });
      }
    }

    return response;
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiRequestError({
        status: 408,
        code: "REQUEST_TIMEOUT",
        message: `Request timed out after ${timeoutMs}ms.`,
        url,
        method,
        traceId: undefined,
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
      traceId: undefined,
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildRequestHeaders(
  init: ApiRequestOptions,
  accessToken: string | undefined,
  includeAuth: boolean,
) {
  const headers = new Headers(init.headers);

  if (includeAuth && accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("X-DijiPeople-App")) {
    headers.set("X-DijiPeople-App", AUTH_APP_CLIENT_ID);
  }
  if (!headers.has("X-Request-Id")) {
    const requestId = createRequestId();
    headers.set("X-Request-Id", requestId);
    headers.set("X-Trace-Id", requestId);
  }

  applyContentTypeHeader(headers, init.body);

  return headers;
}

/*
 * Refreshing is de-duplicated and short-circuited.
 *
 * Every server-side fetch that saw a 401 used to fire its own POST /auth/refresh,
 * so one page with eight parallel data loads produced eight refresh calls. When
 * the session was genuinely gone they all failed identically, which turned a
 * single revoked session into a burst of pointless auth traffic.
 *
 * Both maps are keyed by the refresh token, so one user's dead session can never
 * suppress another's refresh.
 */
const inFlightRefreshes = new Map<string, Promise<RefreshedAuthTokens | null>>();
const deadRefreshTokens = new Map<string, number>();

/*
 * A revoked or expired session stays dead for this long. Long enough to cover
 * the render it was discovered in, short enough that signing in again is picked
 * up immediately.
 */
const DEAD_TOKEN_TTL_MS = 30_000;
const MAX_DEAD_TOKENS = 500;

/* Keyed on a suffix so the full credential is not held in a long-lived map. */
function refreshTokenKey(refreshToken: string) {
  return refreshToken.slice(-24);
}

function markRefreshTokenDead(key: string) {
  if (deadRefreshTokens.size >= MAX_DEAD_TOKENS) {
    // Bounded: drop the oldest rather than grow without limit.
    const oldest = deadRefreshTokens.keys().next().value;
    if (oldest) deadRefreshTokens.delete(oldest);
  }
  deadRefreshTokens.set(key, Date.now());
}

function isRefreshTokenKnownDead(key: string) {
  const markedAt = deadRefreshTokens.get(key);
  if (!markedAt) return false;

  if (Date.now() - markedAt > DEAD_TOKEN_TTL_MS) {
    deadRefreshTokens.delete(key);
    return false;
  }

  return true;
}

async function performRefresh(
  baseUrl: string,
  refreshToken: string,
  key: string,
): Promise<RefreshedAuthTokens | null> {
  try {
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
        "X-Request-Id": createRequestId(),
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    if (!response.ok) {
      /*
       * 401 and 403 mean the session is gone - revoked, expired, or signed out
       * elsewhere. Retrying can never succeed, so it is remembered. Other
       * statuses may be transient and are left retryable.
       */
      if (response.status === 401 || response.status === 403) {
        markRefreshTokenDead(key);
      }
      return null;
    }

    const data = await response.json();
    const tokens = readRefreshedAuthTokens(data);
    if (!tokens) return null;

    // The old token is spent; forget any negative marker against it.
    deadRefreshTokens.delete(key);
    return tokens;
  } catch {
    // A network failure is transient; do not poison the token.
    return null;
  }
}

async function refreshServerAuthTokens(
  baseUrl: string,
  refreshToken: string,
): Promise<RefreshedAuthTokens | null> {
  const key = refreshTokenKey(refreshToken);

  if (isRefreshTokenKnownDead(key)) {
    return null;
  }

  const existing = inFlightRefreshes.get(key);
  if (existing) {
    // Concurrent callers share the one request rather than each making their own.
    return existing;
  }

  const pending = performRefresh(baseUrl, refreshToken, key).finally(() => {
    inFlightRefreshes.delete(key);
  });

  inFlightRefreshes.set(key, pending);
  return pending;
}

async function persistRefreshedAuthCookies(tokens: RefreshedAuthTokens) {
  try {
    const cookieStore = await cookies();
    const accessMaxAge = tokens.rememberMe
      ? durationSeconds(
          tokens.accessTokenExpiresIn,
          ACCESS_TOKEN_MAX_AGE_SECONDS,
        )
      : undefined;
    const refreshMaxAge = tokens.rememberMe
      ? durationSeconds(
          tokens.refreshTokenExpiresIn,
          REFRESH_TOKEN_MAX_AGE_SECONDS,
        )
      : undefined;

    cookieStore.set(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      getAuthCookieOptions(accessMaxAge),
    );
    cookieStore.set(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      getAuthCookieOptions(refreshMaxAge),
    );

    if (tokens.sessionId) {
      cookieStore.set(
        SESSION_COOKIE,
        tokens.sessionId,
        getAuthCookieOptions(refreshMaxAge),
      );
    }
  } catch {
    // Server Components cannot mutate cookies; route handlers can. In either
    // case the current request can continue with the refreshed access token.
  }
}

function readRefreshedAuthTokens(data: unknown): RefreshedAuthTokens | null {
  if (!isJsonObject(data)) {
    return null;
  }

  const tokens = data.tokens;
  if (!isJsonObject(tokens)) {
    return null;
  }

  if (
    typeof tokens.accessToken !== "string" ||
    typeof tokens.refreshToken !== "string"
  ) {
    return null;
  }

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId:
      typeof tokens.sessionId === "string" ? tokens.sessionId : undefined,
    accessTokenExpiresIn:
      typeof tokens.accessTokenExpiresIn === "string"
        ? tokens.accessTokenExpiresIn
        : undefined,
    refreshTokenExpiresIn:
      typeof tokens.refreshTokenExpiresIn === "string"
        ? tokens.refreshTokenExpiresIn
        : undefined,
    rememberMe: tokens.rememberMe === true,
  };
}

function durationSeconds(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  try {
    return Math.floor(parseDurationToMilliseconds(value) / 1000);
  } catch {
    return fallback;
  }
}

function shouldAttemptServerRefresh(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return ![
    "/auth/login",
    "/auth/logout",
    "/auth/refresh",
    "/auth/signup",
    "/auth/activate-account",
    "/auth/reset-password",
  ].some(
    (authPath) =>
      normalizedPath === authPath || normalizedPath.startsWith(`${authPath}?`),
  );
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
    const nextResponse = NextResponse.json(data, { status: response.status });
    copyHeaderIfPresent(response.headers, nextResponse.headers, "x-request-id");
    return nextResponse;
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
  const standardError = normalizeApiError(data, response.status);
  const message = standardError.message;
  const errorCode = standardError.errorCode;

  const traceId =
    standardError.traceId ??
    response.headers.get("x-trace-id") ??
    response.headers.get("x-request-id") ??
    response.headers.get("X-Request-Id") ??
    undefined;

  return new ApiRequestError({
    status: response.status,
    message,
    code: errorCode,
    body: data,
    url: path,
    method: method?.toUpperCase() ?? "GET",
    responseHeaders: headersToObject(response.headers),
    traceId,
    description: standardError.description,
    details: standardError.details,
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
    isJsonObject(data.error) ? data.error.message : undefined,
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

  const candidates = [
    isJsonObject(data.error) ? data.error.code : undefined,
    data.code,
    data.errorCode,
    data.error_code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function extractTraceId(data: ParsedResponseBody): string | undefined {
  if (!data || typeof data === "string" || Array.isArray(data)) {
    return undefined;
  }

  const candidates = [
    isJsonObject(data.error) ? data.error.traceId : undefined,
    data.traceId,
    data.requestId,
  ];

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
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
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

function applyContentTypeHeader(
  headers: Headers,
  body: BodyInit | null | undefined,
) {
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

  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    headers.set(
      "Content-Type",
      "application/x-www-form-urlencoded;charset=UTF-8",
    );
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

function isJsonLike(
  value: ParsedResponseBody,
): value is JsonObject | JsonValue[] {
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

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `web_${crypto.randomUUID()}`;
  }

  return `web_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
