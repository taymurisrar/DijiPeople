"use client";

import { useMemo, useRef } from "react";
import React from "react";

import { isSessionExpiredError } from "@/lib/api-error";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";

import { canDownloadErrorLog, type ErrorLogUser } from "./error-provider";
import { downloadErrorLog } from "./download-error-log";
import type { DisplayableError } from "./types";

type ErrorModalProps = {
  error: DisplayableError;
  user?: ErrorLogUser | null;
  onClose: () => void;
};

type ErrorModalAction = "close" | "sign-in" | "retry";

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

  // Escape and focus restore used to be hand-rolled here, and Tab still walked
  // out of the modal into the page behind it. Both now come from the shared
  // primitive. BUG-0043.
  return (
    <Dialog
      description={shouldShowDescription ? error.description : undefined}
      footer={
        <>
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
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={
        <>
          <span className="block text-xs font-semibold uppercase text-slate-500">
            Error {error.errorCode}
          </span>
          <span className="mt-2 block">{error.message}</span>
        </>
      }
    >
      <div className="grid gap-4 text-sm">
        <Info label="Reference ID" value={error.traceId} mono />
        <Info label="Timestamp" value={error.timestamp} />
        {formatValidationDetails(error.details)}
      </div>
    </Dialog>
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

  if (error.statusCode >= 500 && error.retry) {
    return { primary: "retry" };
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