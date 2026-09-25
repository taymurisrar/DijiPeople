"use client";

import { FormEvent, useId, useState } from "react";

/*
 * ADR-0019 building blocks shared by the sign-in MFA step and the My Profile
 * security card, so enrolment and recovery codes look and behave the same in
 * both places. Labels, values and errors only — no explanatory copy.
 */

const inputClass =
  "block w-full min-w-0 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60";

export const mfaButtonClasses = {
  primary: primaryButtonClass,
  secondary: secondaryButtonClass,
};

export function MfaError({ message }: { readonly message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      role="alert"
    >
      {message}
    </div>
  );
}

/** A six-digit authenticator code: numeric keypad, and SMS/app autofill. */
export function OneTimeCodeField({
  value,
  onChange,
  disabled,
  label = "Authentication code",
  autoFocus,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <input
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        className={`${inputClass} tracking-[0.3em]`}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        maxLength={6}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        pattern="[0-9]{6}"
        placeholder="123456"
        type="text"
        value={value}
      />
    </div>
  );
}

export function RecoveryCodeField({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground" htmlFor={id}>
        Recovery code
      </label>
      <input
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        className={`${inputClass} font-mono`}
        disabled={disabled}
        id={id}
        maxLength={16}
        onChange={(event) => onChange(event.target.value)}
        placeholder="xxxxx-xxxxx"
        spellCheck={false}
        type="text"
        value={value}
      />
    </div>
  );
}

export type MfaSetupDetails = {
  qrCodeDataUrl: string;
  manualEntryKey: string;
  accountLabel?: string;
};

/**
 * Scan (or type) the key, then prove it with a code. `onConfirm` returns an
 * error message to show, or `null` when the code was accepted.
 */
export function MfaEnrolmentPanel({
  setup,
  onConfirm,
  onCancel,
}: {
  readonly setup: MfaSetupDetails;
  readonly onConfirm: (code: string) => Promise<string | null>;
  readonly onCancel?: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onConfirm(code);
    setBusy(false);
    if (failure) {
      setError(failure);
      setCode("");
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(
        setup.manualEntryKey.replace(/\s/g, ""),
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={submit}>
      <MfaError message={error} />
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL rendered by the API, not an optimisable asset */}
        <img
          alt="QR code for your authenticator app"
          className="h-48 w-48 shrink-0 rounded-xl border border-border bg-white p-2"
          height={192}
          src={setup.qrCodeDataUrl}
          width={192}
        />
        <div className="w-full min-w-0 space-y-2">
          <p className="text-sm font-medium text-foreground">Setup key</p>
          <p
            className="break-all rounded-xl border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
            data-testid="mfa-manual-key"
          >
            {setup.manualEntryKey}
          </p>
          {setup.accountLabel ? (
            <p className="text-sm text-muted">{setup.accountLabel}</p>
          ) : null}
          <button
            className={secondaryButtonClass}
            onClick={() => void copyKey()}
            type="button"
          >
            {copied ? "Copied" : "Copy key"}
          </button>
        </div>
      </div>
      <OneTimeCodeField
        disabled={busy}
        onChange={(value) => {
          setCode(value);
          if (error) setError(null);
        }}
        value={code}
      />
      <div className="flex flex-wrap gap-3">
        <button className={primaryButtonClass} disabled={busy} type="submit">
          {busy ? "Verifying..." : "Verify and turn on"}
        </button>
        {onCancel ? (
          <button
            className={secondaryButtonClass}
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Recovery codes, shown once. Continuing is only possible after the person
 * confirms they have saved them.
 */
export function RecoveryCodesPanel({
  codes,
  onDone,
  doneLabel = "Continue",
}: {
  readonly codes: readonly string[];
  readonly onDone: () => void;
  readonly doneLabel?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const checkboxId = useId();
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([`DijiPeople recovery codes\n\n${text}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dijipeople-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-foreground">Recovery codes</p>
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-1 gap-2 rounded-2xl border border-border bg-surface p-4 font-mono text-sm text-foreground sm:grid-cols-2"
        data-testid="mfa-recovery-codes"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button
          className={secondaryButtonClass}
          onClick={() => void copy()}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button className={secondaryButtonClass} onClick={download} type="button">
          Download
        </button>
      </div>
      <div className="flex items-center gap-3">
        <input
          checked={saved}
          className="h-4 w-4 rounded border-border"
          id={checkboxId}
          onChange={(event) => setSaved(event.target.checked)}
          type="checkbox"
        />
        <label className="text-sm text-foreground" htmlFor={checkboxId}>
          I&apos;ve saved these codes
        </label>
      </div>
      <button
        className={primaryButtonClass}
        disabled={!saved}
        onClick={onDone}
        type="button"
      >
        {doneLabel}
      </button>
    </div>
  );
}

/** Reads `message` from a JSON error body, whatever shape the proxy used. */
export async function readMfaError(
  response: Response,
  fallback: string,
): Promise<{ message: string; errorCode?: string }> {
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown;
    errorCode?: unknown;
    code?: unknown;
  } | null;
  const message =
    typeof payload?.message === "string" && payload.message.trim()
      ? payload.message
      : fallback;
  const errorCode =
    typeof payload?.errorCode === "string"
      ? payload.errorCode
      : typeof payload?.code === "string"
        ? payload.code
        : undefined;
  return { message, errorCode };
}
