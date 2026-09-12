import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth-config";
import { getApiBaseUrl } from "@/lib/auth";
import { normalizeApiError } from "@/lib/api-error";
import { getClearAuthCookieOptions } from "@/lib/auth-cookies";
import {
  buildAuthSessionCookies,
  type RefreshedSessionTokens,
} from "@/lib/auth-session-cookies";

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

/**
 * BUG-3356 — why a refresh could fail, preserved rather than discarded.
 *
 * `performRefresh` used to collapse every non-success outcome — revoked,
 * expired, a network hiccup — into a bare `null`, which is why the caller had
 * nothing left to tell the user except "no token", and why that came out as
 * `AUTH_TOKEN_MISSING` once the request went out anyway. `status` and `code`
 * are the same fields the API's `/auth/refresh` response already carries; this
 * type just keeps them attached to the failure instead of throwing them away
 * at the point they were most informative.
 */
type RefreshFailure = {
  status: number;
  code?: string;
  message?: string;
  description?: string;
  traceId?: string;
  isNetworkError?: boolean;
};

type RefreshOutcome =
  | { tokens: RefreshedSessionTokens; failure?: undefined }
  | { tokens?: undefined; failure: RefreshFailure };

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
  const authRequired = includeAuth && shouldAttemptServerRefresh(path);
  let refreshFailure: RefreshFailure | undefined;

  if (authRequired && !accessToken && refreshToken) {
    /*
     * BUG-3358 — detect an unwritable cookie store BEFORE spending the
     * refresh token, not after. With rotation enabled (the default and the
     * production setting) a refresh irreversibly revokes the token the
     * browser holds the moment it succeeds; a Server Component render cannot
     * persist the successor, so refreshing there destroys the session for a
     * result nobody keeps. Skipping the refresh entirely leaves the browser
     * holding a working refresh token, which the middleware or a route
     * handler — both of which CAN persist — will use next.
     */
    if (await canPersistCookies()) {
      const outcome = await refreshServerAuthTokens(baseUrl, refreshToken);
      if (outcome.tokens) {
        accessToken = outcome.tokens.accessToken;
        const persisted = await persistRefreshedAuthCookies(outcome.tokens);
        if (!persisted) {
          // Tokens were issued but the write failed anyway (BUG-3358's
          // `persistRefreshedAuthCookies` now reports this rather than
          // swallowing it) — the browser will never see the new refresh
          // token, so the request must not proceed as if it had.
          accessToken = undefined;
          refreshFailure = {
            status: 500,
            code: "AUTH_COOKIE_WRITE_FAILED",
            message: "The refreshed session could not be saved.",
          };
        }
      } else {
        refreshFailure = outcome.failure;
      }
    }
  }

  if (authRequired && !accessToken) {
    /*
     * BUG-3356 — never send a request that is known to be unauthenticatable.
     * This used to fall through to `fetch` with no Authorization header,
     * which the API answered correctly and unhelpfully with
     * `401 AUTH_TOKEN_MISSING` — discarding the real reason (computed one
     * line above, in `refreshFailure`) and, because that code is on the
     * expected-protocol-outcome allowlist, leaving no record an operator
     * could find. Returning a synthetic response here — rather than
     * throwing — keeps `apiRequest`'s contract intact: every caller,
     * `apiRequestJson` and every route handler that proxies the raw
     * `Response` through, already knows how to present a non-ok response.
     */
    return buildSessionEndedResponse(refreshFailure, path, method);
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
      authRequired &&
      refreshToken &&
      // BUG-3358 — same reasoning as the pre-emptive refresh above: a
      // presented access token that the API just rejected is refreshed only
      // where the result can be written back. An unwritable store leaves the
      // caller with the original, genuine 401 from the API, which is
      // informative on its own and was never sent without a header.
      (await canPersistCookies())
    ) {
      const outcome = await refreshServerAuthTokens(baseUrl, refreshToken);
      if (outcome.tokens) {
        const persisted = await persistRefreshedAuthCookies(outcome.tokens);
        if (persisted) {
          response = await fetch(url, {
            ...init,
            method,
            headers: buildRequestHeaders(init, outcome.tokens.accessToken, true),
            signal: mergeAbortSignals(init.signal, controller.signal),
            cache: init.cache ?? "no-store",
          });
        }
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
 * BUG-3358 — a probe cookie name, distinct from any cookie either the API or
 * this app reads. Its value never matters and it is written with `maxAge: 0`
 * (delete semantics), so a context that CAN write cookies is left exactly as
 * it was found.
 */
const COOKIE_WRITE_PROBE_NAME = "__dp_cookie_write_probe";

/**
 * Whether the current request context can persist a cookie right now.
 *
 * A Server Component render cannot — `cookies().set(...)` throws
 * synchronously — while a Route Handler or Server Action can. Next.js does
 * not expose this as a flag to check ahead of time, so it is checked the only
 * way available: attempt a real, harmless write and see whether it throws.
 * The point of doing this *before* refreshing rather than in a `catch` around
 * the refresh itself (the previous shape, in `persistRefreshedAuthCookies`) is
 * that a refresh is not harmless: with rotation enabled it revokes the
 * presented refresh token the instant it succeeds. Probing first means an
 * unwritable context never spends that single-use credential at all.
 */
async function canPersistCookies(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(
      COOKIE_WRITE_PROBE_NAME,
      "",
      getClearAuthCookieOptions(),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The response `apiRequest` returns when it refuses to send a request it
 * knows the API cannot authenticate (BUG-3356), built to match the standard
 * error contract (`services/api/src/common/errors/error-catalog.ts`) so every
 * existing consumer — `apiRequestJson`'s `buildApiRequestError`, a route
 * handler's `proxyApiJsonResponse`, the browser's `normalizeApiError` — reads
 * it exactly like a response the API sent itself. `status` and `code` are
 * `refreshFailure`'s when a refresh was attempted and failed — the same
 * status/code the API already returned (and logged, under this same
 * `traceId`) for `POST /auth/refresh` — so the durable record this failure
 * corresponds to is the refresh's own, findable by the reference id the user
 * is shown. There is no such call to point to when no refresh was possible at
 * all (no refresh token present), so that case gets a local id instead.
 */
function buildSessionEndedResponse(
  failure: RefreshFailure | undefined,
  path: string,
  method: string,
): Response {
  const status = failure?.status ?? 401;
  const errorCode = failure?.code ?? "AUTH_SESSION_MISSING";
  const traceId = failure?.traceId ?? createRequestId();
  const message =
    failure?.message ?? "Your session has ended. Sign in again to continue.";
  const description =
    failure?.description ??
    "No active session could be found for this request.";

  const body = {
    success: false as const,
    traceId,
    timestamp: new Date().toISOString(),
    statusCode: status,
    errorCode,
    message,
    description,
    path,
    method,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": traceId,
      "X-Request-Id": traceId,
    },
  });
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
const inFlightRefreshes = new Map<string, Promise<RefreshOutcome>>();
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
): Promise<RefreshOutcome> {
  const traceId = createRequestId();
  try {
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
        "X-Request-Id": traceId,
        "X-Trace-Id": traceId,
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      /*
       * 401 and 403 mean the session is gone - revoked, expired, or signed out
       * elsewhere. Retrying can never succeed, so it is remembered. Other
       * statuses may be transient and are left retryable.
       */
      if (response.status === 401 || response.status === 403) {
        markRefreshTokenDead(key);
      }
      // This request already carried `traceId` as both `X-Request-Id` and
      // `X-Trace-Id`, so the API's own error log recorded this exact failure
      // under this exact id (`RequestIdMiddleware` prefers the trace header,
      // falls back to the request id, either way it is this value) — the
      // "exactly one durable record" BUG-3356 asks for already exists by the
      // time this line runs; it is not something this function creates.
      return { failure: readRefreshFailure(data, response, traceId) };
    }

    const tokens = readRefreshedAuthTokens(data);
    if (!tokens) {
      return {
        failure: {
          status: response.status,
          code: "AUTH_REFRESH_RESPONSE_INVALID",
          message: "The refresh response was malformed.",
          traceId,
        },
      };
    }

    // The old token is spent; forget any negative marker against it.
    deadRefreshTokens.delete(key);
    return { tokens };
  } catch (error) {
    // A network failure is transient; do not poison the token, but the
    // caller still must not proceed as if it had a session.
    return {
      failure: {
        status: 503,
        code: "NETWORK_ERROR",
        message: extractFetchErrorMessage(error, `${baseUrl}/auth/refresh`, "POST"),
        traceId,
        isNetworkError: true,
      },
    };
  }
}

function readRefreshFailure(
  data: unknown,
  response: Response,
  fallbackTraceId: string,
): RefreshFailure {
  const body = isJsonObject(data) ? data : {};
  const traceId =
    (typeof body.traceId === "string" && body.traceId) ||
    response.headers.get("x-trace-id") ||
    fallbackTraceId;

  return {
    status: response.status,
    code: typeof body.errorCode === "string" ? body.errorCode : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    description:
      typeof body.description === "string" ? body.description : undefined,
    traceId,
  };
}

async function refreshServerAuthTokens(
  baseUrl: string,
  refreshToken: string,
): Promise<RefreshOutcome> {
  const key = refreshTokenKey(refreshToken);

  if (isRefreshTokenKnownDead(key)) {
    return {
      failure: {
        status: 401,
        code: "SESSION_REVOKED",
        message: "This session is no longer active. Please sign in again.",
      },
    };
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

/**
 * Write the refreshed auth cookies back, and say so if it did not work.
 *
 * BUG-3358 — this used to swallow every failure silently, on the reasoning
 * that a Server Component render can still finish with the in-memory access
 * token even though the cookie write is impossible there. That reasoning
 * held only while refresh tokens were reusable; with rotation on, the write
 * *is* the durable half of a refresh; a caller that cannot tell it failed has
 * no way to avoid treating a doomed request as a successful one. Returning
 * `false` — rather than throwing — is deliberate: `apiRequest` now checks
 * this and decides what "the write failed" means for its own caller, and
 * `canPersistCookies()` above is what should stop this from being called at
 * all in a context that cannot write, so a `false` here is itself worth
 * knowing about.
 */
async function persistRefreshedAuthCookies(
  tokens: RefreshedSessionTokens,
): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const cookieValues = buildAuthSessionCookies(tokens);

    cookieStore.set(
      cookieValues.access.name,
      cookieValues.access.value,
      cookieValues.access.options,
    );
    cookieStore.set(
      cookieValues.refresh.name,
      cookieValues.refresh.value,
      cookieValues.refresh.options,
    );

    if (cookieValues.session) {
      cookieStore.set(
        cookieValues.session.name,
        cookieValues.session.value,
        cookieValues.session.options,
      );
    }

    return true;
  } catch (error) {
    // BUG-3358 — reported, not swallowed. There is no server-side logger in
    // this app; `console.error` is the report this fix asks for.
    console.error(
      "[server-api] failed to persist refreshed auth cookies:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

function readRefreshedAuthTokens(data: unknown): RefreshedSessionTokens | null {
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
  const headers = new Headers();

  copyHeaderIfPresent(response.headers, headers, "content-type");
  copyHeaderIfPresent(response.headers, headers, "content-disposition");
  copyHeaderIfPresent(response.headers, headers, "cache-control");
  copyHeaderIfPresent(response.headers, headers, "etag");
  copyHeaderIfPresent(response.headers, headers, "last-modified");

  /*
   * Content-Length is deliberately not forwarded. fetch() transparently decodes
   * a compressed upstream body, so the upstream header describes the encoded
   * payload while `response.body` streams the decoded bytes. Forwarding the
   * smaller encoded-length value makes Node stop writing at that byte count and
   * truncates the download mid-stream. The runtime derives the correct length
   * as the stream is written.
   *
   * The body itself is passed through as the raw upstream ReadableStream rather
   * than buffered into memory first: these responses back file downloads (R2
   * objects and desktop installers up to several hundred MB), and buffering
   * every byte into the Next.js heap before writing any of it out defeats the
   * point of having moved storage off the API host.
   */
  return new NextResponse(response.body, {
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
