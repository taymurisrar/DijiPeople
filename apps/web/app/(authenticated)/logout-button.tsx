"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/app/components/ui/button";

type LogoutButtonProps = {
  className?: string;
  label?: string;
  onLoggedOut?: () => void;
  variant?: "pill" | "menu";
  redirectTo?: string;
};

const LOGOUT_TIMEOUT_MS = 8_000;

export function LogoutButton({
  className,
  label = "Sign out",
  onLoggedOut,
  variant = "pill",
  redirectTo,
}: LogoutButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleLogout() {
    if (isPending) {
      return;
    }

    setIsPending(true);
    setHasError(false);

    const controller = new AbortController();
    abortRef.current = controller;

    const nextPath = getCurrentPath();

    try {
      timeoutRef.current = window.setTimeout(() => {
        controller.abort();
      }, LOGOUT_TIMEOUT_MS);

      const response = await fetch(
        `/api/auth/logout?next=${encodeURIComponent(nextPath)}`,
        {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Logout failed with status ${response.status}`,
        );
      }

      const data = (await response.json().catch(() => null)) as
        | {
            redirectUrl?: unknown;
          }
        | null;

      const redirectUrl =
        getRedirectUrl(data?.redirectUrl, redirectTo) ?? "/login";

      /*
       * At this point the server has confirmed logout.
       *
       * Close transient UI before leaving so the interface does not briefly
       * retain an open account menu while navigation begins.
       */
      onLoggedOut?.();

      /*
       * Use a hard navigation instead of router.replace().
       *
       * Authentication is cookie-backed server state. After revoking that
       * state, a document navigation gives us a clean boundary and avoids
       * retaining authenticated RSC/router cache from the previous session.
       *
       * It also supports a legitimate absolute redirect URL if the auth
       * service returns one.
       */
      window.location.replace(redirectUrl);
    } catch (error) {
      /*
       * Do not navigate to /login when logout fails.
       *
       * A failed request may mean the server-side session is still completely
       * valid. Redirecting anyway would make the application appear logged out
       * while leaving the real authenticated session alive.
       */
      if (isAbortError(error)) {
        console.error(
          `[Logout] Request timed out after ${LOGOUT_TIMEOUT_MS}ms.`,
        );
      } else {
        console.error("[Logout] Failed:", error);
      }

      setHasError(true);
      setIsPending(false);
    } finally {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      abortRef.current = null;
    }
  }

  if (variant === "menu") {
    return (
      <div>
        <Button
          aria-busy={isPending}
          className={className}
          disabled={isPending}
          fullWidth
          loading={isPending}
          loadingText="Signing out..."
          onClick={handleLogout}
          type="button"
          variant="ghost"
        >
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <LogoutIcon />

            <span className="min-w-0 flex-1 text-left">
              {hasError ? "Try signing out again" : label}
            </span>
          </span>
        </Button>

        {hasError ? (
          <p
            aria-live="polite"
            className="sr-only"
            role="status"
          >
            Sign out failed. Your session is still active. Please try again.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Button
      aria-busy={isPending}
      className={className}
      disabled={isPending}
      loading={isPending}
      loadingText="Signing out..."
      onClick={handleLogout}
      type="button"
      variant="pill"
    >
      {hasError ? "Try again" : label}
    </Button>
  );
}

function LogoutIcon() {
  return (
    <span
      aria-hidden="true"
      className="
        flex h-8 w-8 shrink-0
        items-center justify-center
        rounded-lg
        border border-border
        bg-background
        text-muted
        transition-colors
        group-hover:border-accent/20
        group-hover:text-accent
      "
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 20 20"
      >
        <path
          d="M8 4.5H5.75A1.75 1.75 0 0 0 4 6.25v7.5a1.75 1.75 0 0 0 1.75 1.75H8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />

        <path
          d="M12.5 6.5 16 10l-3.5 3.5M8 10h8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  );
}

function getCurrentPath(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.pathname}${window.location.search}`;
}

function getRedirectUrl(
  responseRedirect: unknown,
  configuredRedirect?: string,
): string | null {
  if (
    typeof responseRedirect === "string" &&
    responseRedirect.trim()
  ) {
    return responseRedirect;
  }

  if (configuredRedirect?.trim()) {
    return configuredRedirect;
  }

  return null;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}