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
import {
  apiErrorEventName,
  isSessionExpiredError,
  normalizeApiError,
  type StandardApiError,
} from "@/lib/api-error";
import type { PlatformRole } from "@/lib/platform-rbac";

type DisplayableError = StandardApiError;
type User = { role?: PlatformRole; roleKeys?: string[] };

// Sign-out is a GET navigation, so /api/auth/logout must keep exporting GET.
const SIGN_IN_AGAIN_HREF = "/api/auth/logout?reason=session-expired";

const ErrorContext = createContext<{
  error: DisplayableError | null;
  showError: (error: unknown) => void;
  clearError: () => void;
} | null>(null);

export function ErrorProvider({
  children,
  user,
}: PropsWithChildren<{ user?: User | null }>) {
  const [error, setError] = useState<DisplayableError | null>(null);
  const showError = useCallback((input: unknown) => {
    const normalized = normalizeApiError(input);
    const clientGenerated = normalized.traceId.startsWith("client_");
    const nextError = clientGenerated
      ? {
          ...normalized,
          traceId: normalized.traceId.replace(/^client_/, "admin_"),
        }
      : normalized;
    setError(nextError);
    if (clientGenerated) void persistAdminError(nextError);
  }, []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    const handler = (event: Event) =>
      showError((event as CustomEvent<{ error: unknown }>).detail?.error);
    window.addEventListener(apiErrorEventName(), handler);
    return () => window.removeEventListener(apiErrorEventName(), handler);
  }, [showError]);

  useEffect(() => {
    const handleRuntimeError = (event: ErrorEvent) => {
      if (event.message?.includes("ResizeObserver loop")) return;
      showError(
        event.error ??
          new Error(event.message || "Admin browser runtime error"),
      );
    };
    const handleRejectedPromise = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      showError(
        reason ?? new Error("Unhandled admin browser promise rejection"),
      );
    };
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleRejectedPromise);
    return () => {
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleRejectedPromise);
    };
  }, [showError]);

  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args);
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof URL
            ? args[0].toString()
            : args[0].url;
      if (
        response.ok ||
        !url.includes("/api/") ||
        url.includes("/api/error-logs/client") ||
        url.includes("/api/error-logs/")
      )
        return response;
      const data = await response
        .clone()
        .json()
        .catch(() => ({ statusCode: response.status }));
      window.dispatchEvent(
        new CustomEvent(apiErrorEventName(), {
          detail: { error: normalizeApiError(data, response.status) },
        }),
      );
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  const value = useMemo(
    () => ({ error, showError, clearError }),
    [clearError, error, showError],
  );
  return (
    <ErrorContext.Provider value={value}>
      {children}
      {error ? (
        <ErrorModal error={error} user={user} onClose={clearError} />
      ) : null}
    </ErrorContext.Provider>
  );
}

export function useErrorHandler() {
  const context = useContext(ErrorContext);
  if (!context)
    throw new Error("useErrorHandler must be used inside ErrorProvider.");
  return context;
}

function ErrorModal({
  error,
  user,
  onClose,
}: {
  error: DisplayableError;
  user?: User | null;
  onClose: () => void;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const canDownload = Boolean(error.traceId && user);
  const primary = isSessionExpiredError(error)
    ? "sign-in"
    : error.statusCode === 404
      ? "go-back"
      : "close";
  // Resolved in an effect because `window` is unavailable while this client
  // component is rendered on the server; the base href stays valid until then.
  const [signInHref, setSignInHref] = useState(SIGN_IN_AGAIN_HREF);

  useEffect(() => {
    if (primary !== "sign-in") return;
    setSignInHref(
      `${SIGN_IN_AGAIN_HREF}&next=${encodeURIComponent(
        `${window.location.pathname}${window.location.search}`,
      )}`,
    );
  }, [primary]);
  async function handleDownload() {
    setIsDownloading(true);
    try {
      await downloadLog(error);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section
        aria-modal="true"
        role="dialog"
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Error {error.errorCode}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {error.message}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {error.description}
          </p>
        </div>
        <div className="grid gap-3 px-6 py-5 text-sm">
          <p>
            <span className="font-semibold">Reference ID:</span>{" "}
            <span className="font-mono">{error.traceId}</span>
          </p>
          <p>
            <span className="font-semibold">Timestamp:</span> {error.timestamp}
          </p>
          {error.details !== undefined ? (
            <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Technical details
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs font-normal text-slate-700">
                {formatJson(error.details)}
              </pre>
            </details>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {canDownload ? (
            <button
              className="rounded-md border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              disabled={isDownloading}
              onClick={() => void handleDownload()}
              type="button"
            >
              {isDownloading ? "Downloading..." : "Download log"}
            </button>
          ) : null}
          <button
            className="rounded-md border px-4 py-2 text-sm"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          {primary === "sign-in" ? (
            <a
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              href={signInHref}
            >
              Sign in again
            </a>
          ) : null}
          {primary === "go-back" ? (
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => history.back()}
              type="button"
            >
              Go back
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

async function downloadLog(error: DisplayableError) {
  let response: Response | null = null;
  for (const delayMs of [0, 150, 400]) {
    if (delayMs) await delay(delayMs);
    const candidate = await fetch(
      `/api/error-logs/${encodeURIComponent(error.traceId)}/download`,
    );
    if (candidate.ok) {
      response = candidate;
      break;
    }
  }
  const blob = response
    ? await response.blob()
    : new Blob([formatLocalErrorLog(error)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    readDownloadFileName(
      response?.headers.get("content-disposition") ?? null,
    ) ?? `dijipeople-error-${error.traceId}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatLocalErrorLog(error: DisplayableError) {
  return [
    "DijiPeople HRM Error Log",
    "========================",
    "",
    "Reference ID:",
    error.traceId,
    "",
    "Timestamp:",
    error.timestamp,
    "",
    "Error Code:",
    error.errorCode,
    "",
    "Status Code:",
    String(error.statusCode),
    "",
    "Message:",
    error.message,
    "",
    "Description:",
    error.description,
    "",
    "Request:",
    `${error.method ?? "N/A"} ${error.path ?? "N/A"}`,
    "",
    "Details:",
    formatJson(error.details),
    "",
    "Persistence note:",
    "The server copy was unavailable, so this file contains the complete error response received by the browser.",
    "",
    "--- End of error log ---",
    "",
  ].join("\n");
}

function formatJson(value: unknown) {
  if (value === undefined || value === null) return "N/A";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readDownloadFileName(header: string | null) {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? null;
}

async function persistAdminError(error: DisplayableError) {
  try {
    await fetch("/api/error-logs/client", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...error,
        severity: error.statusCode >= 500 ? "ERROR" : "WARNING",
        method: "CLIENT",
        path: `${window.location.pathname}${window.location.search}`,
        browserInfo: navigator.userAgent,
      }),
    });
  } catch {
    // The original UI error remains visible even when diagnostics are offline.
  }
}
