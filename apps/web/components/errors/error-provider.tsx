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
    setError({ ...normalizeApiError(input), retry });
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
  return Boolean(
    user?.accessContext?.isSystemCustomizer ||
      user?.roleKeys?.some((roleKey) => normalizeRole(roleKey) === "system-customizer"),
  );
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}
