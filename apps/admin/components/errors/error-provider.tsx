"use client";

import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiErrorEventName, isSessionExpiredError, normalizeApiError, type StandardApiError } from "@/lib/api-error";

type DisplayableError = StandardApiError;
type User = { roleKeys?: string[] };

const ErrorContext = createContext<{
  error: DisplayableError | null;
  showError: (error: unknown) => void;
  clearError: () => void;
} | null>(null);

export function ErrorProvider({ children, user }: PropsWithChildren<{ user?: User | null }>) {
  const [error, setError] = useState<DisplayableError | null>(null);
  const showError = useCallback((input: unknown) => setError(normalizeApiError(input)), []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    const handler = (event: Event) => showError((event as CustomEvent<{ error: unknown }>).detail?.error);
    window.addEventListener(apiErrorEventName(), handler);
    return () => window.removeEventListener(apiErrorEventName(), handler);
  }, [showError]);

  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].toString() : args[0].url;
      if (response.ok || !url.includes("/api/")) return response;
      const data = await response.clone().json().catch(() => ({ statusCode: response.status }));
      window.dispatchEvent(new CustomEvent(apiErrorEventName(), { detail: { error: normalizeApiError(data, response.status) } }));
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

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
  if (!context) throw new Error("useErrorHandler must be used inside ErrorProvider.");
  return context;
}

function ErrorModal({ error, user, onClose }: { error: DisplayableError; user?: User | null; onClose: () => void }) {
  const canDownload = user?.roleKeys?.some((role) => role.trim().toLowerCase().replace(/\s+/g, "-") === "system-customizer");
  const primary = isSessionExpiredError(error) ? "sign-in" : error.statusCode === 404 ? "go-back" : "close";
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section aria-modal="true" role="dialog" className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Error {error.errorCode}</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">{error.message}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error.description}</p>
        </div>
        <div className="grid gap-3 px-6 py-5 text-sm">
          <p><span className="font-semibold">Reference ID:</span> <span className="font-mono">{error.traceId}</span></p>
          <p><span className="font-semibold">Timestamp:</span> {error.timestamp}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {canDownload ? <button className="rounded-md border px-4 py-2 text-sm" onClick={() => void downloadLog(error)} type="button">Download log</button> : null}
          <button className="rounded-md border px-4 py-2 text-sm" onClick={onClose} type="button">Close</button>
          {primary === "sign-in" ? <a className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/api/auth/logout?reason=session-expired">Sign in again</a> : null}
          {primary === "go-back" ? <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={() => history.back()} type="button">Go back</button> : null}
        </div>
      </section>
    </div>
  );
}

async function downloadLog(error: DisplayableError) {
  const response = await fetch(`/api/error-logs/${encodeURIComponent(error.traceId)}/download`);
  const text = response.ok ? await response.text() : `${error.errorCode}\n${error.message}\n${error.traceId}`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dijipeople-error-${error.traceId}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
