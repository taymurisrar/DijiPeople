"use client";

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiErrorEventName, normalizeApiError } from "@/lib/api-error";
import { ErrorModal } from "./error-modal";
import type { DisplayableError, ErrorContextValue } from "./types";
import {
  enrichClientError,
  persistClientError,
  shouldReportClientError,
} from "./client-error-log";
import { classifyRuntimeError } from "./runtime-error-classification";

export type ErrorLogUser = {
  roleKeys?: string[];
  accessContext?: {
    isSystemCustomizer?: boolean;
  };
};

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorProvider({
  children,
  user,
}: PropsWithChildren<{ user?: ErrorLogUser | null }>) {
  const [error, setError] = useState<DisplayableError | null>(null);

  const showError = useCallback((input: unknown, retry?: () => void) => {
    const nextError = enrichClientError({
      ...normalizeApiError(input),
      retry,
    });
    if (!shouldReportClientError(nextError)) {
      return;
    }
    setError(nextError);
    void persistClientError(nextError);
  }, []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ error: unknown }>;
      showError(custom.detail?.error);
    };
    window.addEventListener(apiErrorEventName(), handler);
    return () => window.removeEventListener(apiErrorEventName(), handler);
  }, [showError]);

  /*
   * BUG-3496 — errors the browser raised itself go through
   * `classifyRuntimeError` first. A recoverable hydration mismatch used to open
   * this modal with the raw minified React text and log a 500 on every load of
   * a working page; it is now neither shown nor logged. Any other minified React
   * error is still shown and logged, with a message a user can act on in place
   * of React's.
   */
  const showRuntimeError = useCallback(
    (error: unknown) => {
      const disposition = classifyRuntimeError(error);
      if (disposition.kind === "ignore") return;
      if (disposition.userMessage && error instanceof Error) {
        const replaced = new Error(disposition.userMessage);
        replaced.stack = error.stack;
        showError(replaced);
        return;
      }
      showError(error);
    },
    [showError],
  );

  useEffect(() => {
    const handleRuntimeError = (event: ErrorEvent) => {
      showRuntimeError(
        event.error ?? new Error(event.message || "Browser runtime error"),
      );
    };
    const handleRejectedPromise = (event: PromiseRejectionEvent) => {
      showRuntimeError(
        event.reason ?? new Error("Unhandled browser promise rejection"),
      );
    };

    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleRejectedPromise);
    return () => {
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleRejectedPromise);
    };
  }, [showError]);

  const value = useMemo(() => ({ error, showError, clearError }), [clearError, error, showError]);

  return (
    <ErrorContext.Provider value={value}>
      {children}
      {error ? <ErrorModal error={error} user={user} onClose={clearError} /> : null}
    </ErrorContext.Provider>
  );
}

export function useErrorHandler() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error("useErrorHandler must be used inside ErrorProvider.");
  }
  return context;
}

export function canDownloadErrorLog(user?: ErrorLogUser | null) {
  void user;
  return true;
}
