"use client";

import { useEffect, useMemo, useRef } from "react";
import React from "react";

import { isSessionExpiredError } from "@/lib/api-error";
import { Button } from "@/app/components/ui/button";

import { canDownloadErrorLog, type ErrorLogUser } from "./error-provider";
import { downloadErrorLog } from "./download-error-log";
import type { DisplayableError } from "./types";

type ErrorModalProps = {
  error: DisplayableError;
  user?: ErrorLogUser | null;
  onClose: () => void;
};

type ErrorModalAction = "close" | "sign-in" | "dashboard" | "retry";

type ResolvedErrorAction = {
  primary: ErrorModalAction;
};

export function ErrorModal({ error, user, onClose }: ErrorModalProps) {
  const primaryButtonRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(
    null,
  );

  const action = useMemo(() => resolveAction(error), [error]);
  const mayDownload = canDownloadErrorLog(user);

  const shouldShowDescription =
    error.description.trim().toLowerCase() !==
    error.message.trim().toLowerCase();

  useEffect(() => {
    primaryButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <section
        aria-labelledby="global-error-title"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
        role="dialog"
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Error {error.errorCode}
          </p>

          <h2
            id="global-error-title"
            className="mt-2 text-xl font-semibold text-slate-950"
          >
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadErrorLog(error)}
              type="button"
            >
              Download log
            </Button>
          ) : null}

          <PrimaryAction
            ref={primaryButtonRef}
            action={action.primary}
            error={error}
            onClose={onClose}
          />
        </div>
      </section>
    </div>
  );
}

const PrimaryAction = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  {
    action: ErrorModalAction;
    error: DisplayableError;
    onClose: () => void;
  }
>(function PrimaryAction({ action, error, onClose }, ref) {
  if (action === "sign-in") {
    return (
      <Button
        ref={ref}
        href={`/api/auth/logout?reason=session-expired&next=${encodeURIComponent(
          location.pathname + location.search,
        )}`}
        size="sm"
      >
        Sign in again
      </Button>
    );
  }

  if (action === "dashboard") {
    return (
      <Button ref={ref} href="/" size="sm">
        Go to dashboard
      </Button>
    );
  }

  if (action === "retry" && error.retry) {
    return (
      <Button ref={ref} onClick={error.retry} type="button" size="sm">
        Try again
      </Button>
    );
  }

  return (
    <Button ref={ref} onClick={onClose} type="button" size="sm">
      Close
    </Button>
  );
});

PrimaryAction.displayName = "PrimaryAction";

function resolveAction(error: DisplayableError): ResolvedErrorAction {
  if (isSessionExpiredError(error)) {
    return { primary: "sign-in" };
  }

  if (error.statusCode === 404) {
    return { primary: "dashboard" };
  }

  if (error.statusCode >= 500) {
    return { primary: error.retry ? "retry" : "dashboard" };
  }

  return { primary: "close" };
}

function Info({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className={`mt-1 break-all text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function formatValidationDetails(details: unknown) {
  if (!details || typeof details !== "object" || !("fields" in details)) {
    return null;
  }

  const fields = (details as { fields?: unknown }).fields;

  if (!Array.isArray(fields)) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">
        Field messages
      </p>

      <ul className="mt-2 space-y-1 text-slate-700">
        {fields.slice(0, 8).map((field, index) => {
          const item = field as { field?: string; message?: string };

          return (
            <li key={index}>
              {item.field ? `${item.field}: ` : ""}
              {item.message ?? String(field)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}