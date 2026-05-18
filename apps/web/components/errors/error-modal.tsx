"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { isSessionExpiredError } from "@/lib/api-error";
import { canDownloadErrorLog, type ErrorLogUser } from "./error-provider";
import { downloadErrorLog } from "./download-error-log";
import type { DisplayableError } from "./types";

type ErrorModalProps = {
  error: DisplayableError;
  user?: ErrorLogUser | null;
  onClose: () => void;
};

export function ErrorModal({ error, user, onClose }: ErrorModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const action = useMemo(() => resolveAction(error), [error]);
  const mayDownload = canDownloadErrorLog(user);
  const shouldShowDescription =
    error.description.trim().toLowerCase() !==
    error.message.trim().toLowerCase();

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="presentation">
      <section
        aria-labelledby="global-error-title"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
        role="dialog"
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Error {error.errorCode}</p>
          <h2 id="global-error-title" className="mt-2 text-xl font-semibold text-slate-950">
            {error.message}
          </h2>
          {shouldShowDescription ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {error.description}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 px-6 py-5 text-sm">
          <Info label="Reference ID" value={error.traceId} mono />
          <Info label="Timestamp" value={error.timestamp} />
          {formatValidationDetails(error.details)}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {mayDownload ? (
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => void downloadErrorLog(error)}
              type="button"
            >
              Download log
            </button>
          ) : null}
          {action.secondary === "go-back" ? (
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => history.back()} type="button">
              Go back
            </button>
          ) : null}
          {action.secondary === "dashboard" ? (
            <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href="/">
              Go to dashboard
            </Link>
          ) : null}
          <button
            ref={closeButtonRef}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <PrimaryAction action={action.primary} error={error} onClose={onClose} />
        </div>
      </section>
    </div>
  );
}

function PrimaryAction({
  action,
  error,
  onClose,
}: {
  action: string;
  error: DisplayableError;
  onClose: () => void;
}) {
  const className = "rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800";
  if (action === "sign-in") {
    return (
      <a className={className} href={`/api/auth/logout?reason=session-expired&next=${encodeURIComponent(location.pathname + location.search)}`}>
        Sign in again
      </a>
    );
  }
  if (action === "go-back") {
    return <button className={className} onClick={() => history.back()} type="button">Go back</button>;
  }
  if (action === "dashboard") {
    return <Link className={className} href="/">Go to dashboard</Link>;
  }
  if (action === "retry" && error.retry) {
    return <button className={className} onClick={error.retry} type="button">Try again</button>;
  }
  return <button className={className} onClick={onClose} type="button">Close</button>;
}

function resolveAction(error: DisplayableError) {
  if (isSessionExpiredError(error)) return { primary: "sign-in", secondary: null };
  if (error.statusCode === 403) return { primary: "close", secondary: "go-back" };
  if (error.statusCode === 404) return { primary: "go-back", secondary: "dashboard" };
  if (error.statusCode >= 500) return { primary: error.retry ? "retry" : "dashboard", secondary: "dashboard" };
  return { primary: "close", secondary: null };
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className={`mt-1 break-all text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function formatValidationDetails(details: unknown) {
  if (!details || typeof details !== "object" || !("fields" in details)) return null;
  const fields = (details as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">Field messages</p>
      <ul className="mt-2 space-y-1 text-slate-700">
        {fields.slice(0, 8).map((field, index) => {
          const item = field as { field?: string; message?: string };
          return <li key={index}>{item.field ? `${item.field}: ` : ""}{item.message ?? String(field)}</li>;
        })}
      </ul>
    </div>
  );
}
