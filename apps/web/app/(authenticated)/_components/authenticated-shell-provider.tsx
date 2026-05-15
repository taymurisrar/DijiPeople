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

type AuthenticatedShellUser = {
  email: string;
  firstName: string;
  lastName: string;
  permissionKeys: string[];
  profileHref: string;
  roleLabel: string;
  roleKeys?: string[];
  tenantId: string;
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

type PatchedWindow = Window & {
  __dpOriginalFetch?: typeof window.fetch;
  __dpSessionFetchPatched?: boolean;
  __dpAuthRedirectInFlight?: boolean;
  __dpAuthRedirectReason?: string | null;
  __dpFetchPatchConsumers?: number;
  __dpRefreshInFlight?: Promise<boolean> | null;
  __dpLastActivitySyncAt?: number;
};

const SESSION_EXPIRED_REASON = "session-expired";
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
  }, []);

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

          redirectToSessionExpired();
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

    const events: Array<keyof WindowEventMap> = [
      "click",
      "keydown",
      "submit",
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
  }, [inactivityTimeoutMinutes]);

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
              `/api/auth/logout?reason=${encodeURIComponent(
                SESSION_EXPIRED_REASON,
              )}&next=${encodeURIComponent(buildNextPath())}`,
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

function redirectToSessionExpired() {
  if (typeof window === "undefined") {
    return;
  }

  window.location.assign(
    `/api/auth/logout?reason=${encodeURIComponent(
      SESSION_EXPIRED_REASON,
    )}&next=${encodeURIComponent(buildNextPath())}`,
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

  if (!response.ok) {
    await dispatchApiError(response);
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
  const logoutUrl = `/api/auth/logout?reason=${encodeURIComponent(
    reason,
  )}&next=${encodeURIComponent(nextPath)}`;

  window.location.assign(logoutUrl);
  return response;
}

async function dispatchApiError(response: Response) {
  try {
    const data = await response.clone().json();
    window.dispatchEvent(
      new CustomEvent(apiErrorEventName(), {
        detail: { error: normalizeApiError(data, response.status) },
      }),
    );
  } catch {
    window.dispatchEvent(
      new CustomEvent(apiErrorEventName(), {
        detail: { error: normalizeApiError({ statusCode: response.status }, response.status) },
      }),
    );
  }
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

async function attemptSessionRefresh(
  originalFetch: typeof window.fetch,
  globalWindow: PatchedWindow,
) {
  if (globalWindow.__dpRefreshInFlight) {
    return globalWindow.__dpRefreshInFlight;
  }

  globalWindow.__dpRefreshInFlight = (async () => {
    try {
      const response = await originalFetch("/api/auth/refresh", {
        method: "POST",
      });
      return response.ok;
    } catch {
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
