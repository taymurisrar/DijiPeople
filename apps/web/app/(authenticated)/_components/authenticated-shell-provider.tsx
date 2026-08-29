"use client";

import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  hasAnyPermission,
  hasPermission,
  isSelfServiceUser,
} from "@/lib/permissions";
import { SessionExpiredDialog } from "@/app/components/feedback/session-expired-dialog";
import { apiErrorEventName, normalizeApiError } from "@/lib/api-error";
import { BusinessUnitAccessSummary } from "../_lib/business-unit-access";

export type AuthenticatedShellUser = {
  email: string;
  firstName: string;
  lastName: string;
  permissionKeys: string[];
  profileHref: string;
  roleLabel: string;
  roleKeys?: string[];
  tenantId: string;
  tenantSlug?: string | null;
  businessUnitAccess?: BusinessUnitAccessSummary | null;
  avatarSrc?: string | null;
  avatarCacheKey?: string | null;
};

type CurrentUserAccess = {
  user: AuthenticatedShellUser;
  can: (permissionKey: string) => boolean;
  cannot: (permissionKey: string) => boolean;
  canAny: (permissionKeys: readonly string[]) => boolean;
  canAll: (permissionKeys: readonly string[]) => boolean;
  isSelfService: boolean;
  hasPermissions: readonly string[];
  businessUnitAccess: BusinessUnitAccessSummary | null;
  hasBusinessUnitScope: boolean;
  requiresSelfScope: boolean;
};

const AuthenticatedShellContext = createContext<AuthenticatedShellUser | null>(
  null,
);

type AuthenticatedShellProviderProps = PropsWithChildren<{
  inactivityTimeoutMinutes?: number;
  user: AuthenticatedShellUser;
}>;

type AuthenticatedAccessBoundaryProps = PropsWithChildren<{
  fallbackUser: AuthenticatedShellUser;
}>;

type PatchedWindow = Window & {
  __dpOriginalFetch?: typeof window.fetch;
  __dpSessionFetchPatched?: boolean;
  __dpAuthRedirectInFlight?: boolean;
  __dpAuthRedirectReason?: string | null;
  __dpFetchPatchConsumers?: number;
  __dpRefreshInFlight?: Promise<boolean> | null;
  /* When the session was found to be unrecoverable, so we stop retrying. */
  __dpRefreshDeadUntil?: number | null;
  __dpLastActivitySyncAt?: number;
};

const SESSION_EXPIRED_REASON = "session-expired";
const API_ERROR_HANDLING_HEADER = "x-dijipeople-error-handling";
const SESSION_WARNING_SECONDS = getPublicNumber(
  process.env.NEXT_PUBLIC_SESSION_WARNING_SECONDS,
  120,
);
const SESSION_ACTIVITY_THROTTLE_MS =
  getPublicNumber(
    process.env.NEXT_PUBLIC_SESSION_ACTIVITY_THROTTLE_SECONDS,
    60,
  ) * 1000;
const SESSION_WARNING_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SESSION_WARNING_MODAL !== "false";

/**
 * Keeps access-dependent client components renderable when Next.js renders a
 * nested route segment without its shared authenticated layout. In a normal
 * render the outer shell user wins, preserving its complete access scope.
 */
export function AuthenticatedAccessBoundary({
  children,
  fallbackUser,
}: AuthenticatedAccessBoundaryProps) {
  const authenticatedShellUser = useContext(AuthenticatedShellContext);

  return (
    <AuthenticatedShellContext.Provider
      value={authenticatedShellUser ?? fallbackUser}
    >
      {children}
    </AuthenticatedShellContext.Provider>
  );
}

export function AuthenticatedShellProvider({
  children,
  inactivityTimeoutMinutes = 15,
  user,
}: AuthenticatedShellProviderProps) {
  const [showSessionExpiredDialog, setShowSessionExpiredDialog] =
    useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const isDialogOpenRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const globalWindow = window as PatchedWindow;
    globalWindow.__dpFetchPatchConsumers =
      (globalWindow.__dpFetchPatchConsumers ?? 0) + 1;

    if (!globalWindow.__dpSessionFetchPatched) {
      const originalFetch = window.fetch.bind(window);

      globalWindow.__dpOriginalFetch = originalFetch;
      globalWindow.__dpSessionFetchPatched = true;
      globalWindow.__dpAuthRedirectInFlight =
        globalWindow.__dpAuthRedirectInFlight ?? false;
      globalWindow.__dpAuthRedirectReason =
        globalWindow.__dpAuthRedirectReason ?? null;

      window.fetch = async (...args) => {
        try {
          const firstResponse = await originalFetch(...args);
          const handled = await handleAuthFailureResponse(
            firstResponse,
            args,
            originalFetch,
            globalWindow,
            user.tenantSlug,
          );
          return handled;
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }

          throw error;
        }
      };
    }

    return () => {
      if (typeof window === "undefined") {
        return;
      }

      const currentWindow = window as PatchedWindow;
      const nextConsumers = Math.max(
        (currentWindow.__dpFetchPatchConsumers ?? 1) - 1,
        0,
      );

      currentWindow.__dpFetchPatchConsumers = nextConsumers;

      if (nextConsumers === 0) {
        if (currentWindow.__dpOriginalFetch) {
          window.fetch = currentWindow.__dpOriginalFetch;
        }

        currentWindow.__dpOriginalFetch = undefined;
        currentWindow.__dpSessionFetchPatched = false;
        currentWindow.__dpAuthRedirectInFlight = false;
        currentWindow.__dpAuthRedirectReason = null;
        currentWindow.__dpFetchPatchConsumers = 0;
      }
    };
  }, [user.tenantSlug]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timeoutMs = Math.max(1, inactivityTimeoutMinutes) * 60_000;
    const warningMs = Math.max(
      0,
      timeoutMs - Math.max(0, SESSION_WARNING_SECONDS) * 1000,
    );

    const clearIdleTimer = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const scheduleIdleTimeout = () => {
      clearIdleTimer();
      idleTimerRef.current = window.setTimeout(
        () => {
          if (SESSION_WARNING_ENABLED && warningMs > 0) {
            isDialogOpenRef.current = true;
            setShowSessionExpiredDialog(true);
            return;
          }

          redirectToSessionExpired(user.tenantSlug);
        },
        SESSION_WARNING_ENABLED ? warningMs : timeoutMs,
      );
    };

    const handleActivity = () => {
      if (isDialogOpenRef.current) {
        return;
      }
      scheduleIdleTimeout();
      void syncSessionActivity();
    };

    scheduleIdleTimeout();
    void syncSessionActivity();

    const events: Array<keyof WindowEventMap> = [
      "click",
      "keydown",
      "input",
      "pointerdown",
      "scroll",
      "submit",
      "touchstart",
      "wheel",
      "focus",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      clearIdleTimer();
      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      isDialogOpenRef.current = false;
      setShowSessionExpiredDialog(false);
    };
  }, [inactivityTimeoutMinutes, user.tenantSlug]);

  const stableUser = useMemo<AuthenticatedShellUser>(
    () => ({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      permissionKeys: Array.isArray(user.permissionKeys)
        ? [...new Set(user.permissionKeys.filter(Boolean))]
        : [],
      profileHref: user.profileHref,
      roleLabel: user.roleLabel,
      roleKeys: Array.isArray(user.roleKeys)
        ? [...new Set(user.roleKeys.filter(Boolean))]
        : [],
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug ?? null,
      businessUnitAccess: user.businessUnitAccess ?? null,
      avatarSrc: user.avatarSrc ?? null,
      avatarCacheKey: user.avatarCacheKey ?? null,
    }),
    [user],
  );

  return (
    <AuthenticatedShellContext.Provider value={stableUser}>
      {children}
      {showSessionExpiredDialog ? (
        <SessionExpiredDialog
          onLoginAgain={() => {
            if (typeof window === "undefined") {
              return;
            }
            window.location.assign(
              buildLogoutUrl(
                SESSION_EXPIRED_REASON,
                buildNextPath(),
                user.tenantSlug,
              ),
            );
          }}
        />
      ) : null}
    </AuthenticatedShellContext.Provider>
  );
}

async function syncSessionActivity() {
  if (typeof window === "undefined") {
    return;
  }

  const globalWindow = window as PatchedWindow;
  const now = Date.now();
  if (
    globalWindow.__dpLastActivitySyncAt &&
    now - globalWindow.__dpLastActivitySyncAt < SESSION_ACTIVITY_THROTTLE_MS
  ) {
    return;
  }

  globalWindow.__dpLastActivitySyncAt = now;

  await fetch("/api/auth/activity", {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}

function redirectToSessionExpired(tenantSlug?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.location.assign(
    buildLogoutUrl(SESSION_EXPIRED_REASON, buildNextPath(), tenantSlug),
  );
}

export function useCurrentUserAccess(): CurrentUserAccess {
  const user = useContext(AuthenticatedShellContext);

  if (!user) {
    throw new Error(
      "useCurrentUserAccess must be used inside AuthenticatedShellProvider.",
    );
  }

  return useMemo(() => {
    const permissionKeys = Array.isArray(user.permissionKeys)
      ? user.permissionKeys
      : [];

    return {
      user,
      hasPermissions: permissionKeys,
      businessUnitAccess: user.businessUnitAccess ?? null,
      hasBusinessUnitScope:
        (user.businessUnitAccess?.accessibleBusinessUnitIds.length ?? 0) > 0,
      requiresSelfScope: Boolean(user.businessUnitAccess?.requiresSelfScope),
      can: (permissionKey: string) =>
        hasPermission(permissionKeys, permissionKey),
      cannot: (permissionKey: string) =>
        !hasPermission(permissionKeys, permissionKey),
      canAny: (permissionKeysToCheck: readonly string[]) =>
        hasAnyPermission(permissionKeys, permissionKeysToCheck),
      canAll: (permissionKeysToCheck: readonly string[]) =>
        permissionKeysToCheck.every((permissionKey) =>
          hasPermission(permissionKeys, permissionKey),
        ),
      isSelfService: isSelfServiceUser(permissionKeys),
    };
  }, [user]);
}

export function useBusinessUnitAccess() {
  const { businessUnitAccess, hasBusinessUnitScope, requiresSelfScope } =
    useCurrentUserAccess();

  return {
    businessUnitAccess,
    hasBusinessUnitScope,
    requiresSelfScope,
    accessibleBusinessUnitIds:
      businessUnitAccess?.accessibleBusinessUnitIds ?? [],
    effectiveAccessLevel: businessUnitAccess?.effectiveAccessLevel ?? null,
  };
}

async function handleAuthFailureResponse(
  response: Response,
  fetchArgs: Parameters<typeof window.fetch>,
  originalFetch: typeof window.fetch,
  globalWindow: PatchedWindow,
  tenantSlug?: string | null,
) {
  const input = fetchArgs[0];
  const requestUrl = resolveRequestUrl(input);

  if (!isInternalApiRequest(requestUrl)) {
    return response;
  }

  if (response.status === 401 && !isRefreshEndpoint(requestUrl)) {
    const refreshed = await attemptSessionRefresh(originalFetch, globalWindow);
    if (refreshed) {
      const retryResponse = await originalFetch(...fetchArgs);
      if (retryResponse.status !== 401) {
        return retryResponse;
      }
    }
  }

  if (
    !response.ok &&
    !usesInlineErrorHandling(fetchArgs) &&
    !usesInlineErrorHandlingByDefault(response)
  ) {
    await dispatchApiError(response, fetchArgs);
  }

  if (globalWindow.__dpAuthRedirectInFlight) {
    return response;
  }

  const reason = await resolveRedirectReason(response);

  if (!reason) {
    return response;
  }

  if (reason === SESSION_EXPIRED_REASON) {
    return response;
  }

  globalWindow.__dpAuthRedirectInFlight = true;
  globalWindow.__dpAuthRedirectReason = reason;

  const nextPath = buildNextPath();
  const logoutUrl = buildLogoutUrl(reason, nextPath, tenantSlug);

  window.location.assign(logoutUrl);
  return response;
}

function buildLogoutUrl(
  reason: string,
  nextPath: string,
  tenantSlug?: string | null,
) {
  const params = new URLSearchParams({
    reason,
    next: nextPath,
  });

  if (tenantSlug) {
    params.set("tenant", tenantSlug);
  }

  return `/api/auth/logout?${params.toString()}`;
}

function usesInlineErrorHandling(fetchArgs: Parameters<typeof window.fetch>) {
  const [input, init] = fetchArgs;
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );

  return headers.get(API_ERROR_HANDLING_HEADER)?.toLowerCase() === "inline";
}

function usesInlineErrorHandlingByDefault(response: Response) {
  return [400, 405, 409, 422].includes(response.status);
}

async function dispatchApiError(
  response: Response,
  fetchArgs: Parameters<typeof window.fetch>,
) {
  const requestUrl = resolveRequestUrl(fetchArgs[0]);
  const requestMethod =
    fetchArgs[1]?.method ??
    (fetchArgs[0] instanceof Request ? fetchArgs[0].method : undefined) ??
    "GET";

  try {
    const data = await response.clone().json();
    window.dispatchEvent(
      new CustomEvent(apiErrorEventName(), {
        detail: {
          error: normalizeApiError(
            addResponseDiagnostics(data, response, requestUrl, requestMethod),
            response.status,
          ),
        },
      }),
    );
  } catch {
    const responseText = await response
      .clone()
      .text()
      .catch(() => "");

    /*
     * BUG-1955 — this used to pass `responseText` as the error's `message`,
     * so a response the client could not parse as the error contract was
     * rendered to the customer verbatim: a gateway's whole HTML error page,
     * `<!DOCTYPE html…`, as the body of a modal.
     *
     * The body is diagnostic, not a message. It stays in `details`, which is
     * what reaches the console and `/api/error-logs/client`, and the user gets
     * the written sentence for the status instead. `errorCode` is left to
     * `normalizeApiError`, which maps a status with no envelope to a transport
     * code rather than to DATABASE_RECORD_NOT_FOUND.
     */
    if (typeof console !== "undefined") {
      console.warn(
        `[dijipeople] ${requestMethod} ${requestUrl} failed with ${response.status} and an unparsable body`,
        responseText.slice(0, 4000),
      );
    }

    window.dispatchEvent(
      new CustomEvent(apiErrorEventName(), {
        detail: {
          error: normalizeApiError(
            {
              statusCode: response.status,
              path: requestUrl,
              method: requestMethod,
              details: {
                responseStatus: response.status,
                responseStatusText: response.statusText || null,
                responseText: responseText.slice(0, 4000) || null,
              },
            },
            response.status,
          ),
        },
      }),
    );
  }
}

function addResponseDiagnostics(
  data: unknown,
  response: Response,
  path: string,
  method: string,
) {
  if (!isRecord(data)) {
    return {
      statusCode: response.status,
      message: response.statusText || "Request failed.",
      path,
      method,
      details: {
        responseStatus: response.status,
        responseStatusText: response.statusText || null,
        responseBody: data,
      },
    };
  }

  return {
    ...data,
    statusCode:
      typeof data.statusCode === "number" ? data.statusCode : response.status,
    status: typeof data.status === "number" ? data.status : response.status,
    path: readString(data.path) ?? path,
    method: readString(data.method) ?? method,
    details:
      data.details ??
      ({
        responseStatus: response.status,
        responseStatusText: response.statusText || null,
      } satisfies Record<string, unknown>),
  };
}

async function resolveRedirectReason(
  response: Response,
): Promise<string | null> {
  if (response.status === 401) {
    return SESSION_EXPIRED_REASON;
  }

  if (response.status !== 403) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    const cloned = response.clone();
    const data = (await cloned.json()) as unknown;

    if (!isRecord(data)) {
      return null;
    }

    const nestedError = isRecord(data.error) ? data.error : null;
    const errorCode = readString(data.errorCode);
    const code = readString(data.code) ?? readString(nestedError?.code);
    const message = readString(data.message);

    const normalizedValues = [errorCode, code, message]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    const looksUnauthenticated = normalizedValues.some((value) =>
      [
        "unauthorized",
        "unauthenticated",
        "invalid_token",
        "invalid token",
        "token_expired",
        "access_token_expired",
        "refresh_token_expired",
        "session_expired",
        "session_revoked",
        "jwt_expired",
      ].some((keyword) => value.includes(keyword)),
    );

    return looksUnauthenticated ? SESSION_EXPIRED_REASON : null;
  } catch {
    return null;
  }
}

function buildNextPath() {
  if (typeof window === "undefined") {
    return "/";
  }

  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

function resolveRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function isInternalApiRequest(url: string) {
  if (!url) {
    return false;
  }

  if (url.startsWith("/api/")) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    const resolved = new URL(url, window.location.origin);

    return (
      resolved.origin === window.location.origin &&
      resolved.pathname.startsWith("/api/")
    );
  } catch {
    return false;
  }
}

function isRefreshEndpoint(url: string) {
  return url === "/api/auth/refresh" || url.endsWith("/api/auth/refresh");
}

/*
 * A revoked or expired session cannot be refreshed back into existence, so once
 * the server says so we stop asking for a short while. Without this, every new
 * wave of requests started another refresh: the in-flight guard below only
 * merges calls that overlap, not ones that arrive a moment apart, which is how
 * a single revoked session turned into a burst of refresh traffic.
 */
const REFRESH_DEAD_WINDOW_MS = 30_000;

function isRefreshKnownDead(globalWindow: PatchedWindow) {
  const deadUntil = globalWindow.__dpRefreshDeadUntil;
  if (!deadUntil) return false;

  if (Date.now() >= deadUntil) {
    globalWindow.__dpRefreshDeadUntil = null;
    return false;
  }

  return true;
}

async function attemptSessionRefresh(
  originalFetch: typeof window.fetch,
  globalWindow: PatchedWindow,
) {
  if (isRefreshKnownDead(globalWindow)) {
    return false;
  }

  if (globalWindow.__dpRefreshInFlight) {
    return globalWindow.__dpRefreshInFlight;
  }

  globalWindow.__dpRefreshInFlight = (async () => {
    try {
      const response = await originalFetch("/api/auth/refresh", {
        method: "POST",
      });

      if (response.ok) {
        globalWindow.__dpRefreshDeadUntil = null;
        return true;
      }

      /*
       * 401 and 403 are terminal: the session is gone. Anything else may be a
       * transient server problem and stays retryable.
       */
      if (response.status === 401 || response.status === 403) {
        globalWindow.__dpRefreshDeadUntil = Date.now() + REFRESH_DEAD_WINDOW_MS;
      }

      return false;
    } catch {
      // Network failure; the session may still be fine once connectivity returns.
      return false;
    } finally {
      globalWindow.__dpRefreshInFlight = null;
    }
  })();

  return globalWindow.__dpRefreshInFlight;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getPublicNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
