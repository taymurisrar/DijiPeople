"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";

/*
 * ADR-0019 — two-factor authentication for platform operators: the second
 * sign-in step and the Security page card. Every self-service call goes to
 * `/api/platform-users/me/mfa*`, which acts on the signed-in operator only.
 * Labels, values and errors only — no explanatory copy.
 */

const inputClass =
  "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50";
const primaryClass =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryClass =
  "inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
const linkClass =
  "text-sm font-semibold text-emerald-800 hover:text-emerald-600";

function ErrorBox({ message }: { readonly message: string | null }) {
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

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown;
    errorCode?: unknown;
    code?: unknown;
  } | null;
  return {
    message:
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message
        : fallback,
    errorCode:
      typeof payload?.errorCode === "string"
        ? payload.errorCode
        : typeof payload?.code === "string"
          ? payload.code
          : undefined,
  };
}

function postJson(path: string, body?: unknown) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

function CodeField({
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
      <label className="text-sm font-medium text-slate-900" htmlFor={id}>
        Authentication code
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

function RecoveryField({
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
      <label className="text-sm font-medium text-slate-900" htmlFor={id}>
        Recovery code
      </label>
      <input
        autoCapitalize="none"
        autoComplete="off"
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

/* ------------------------------------------------------------------ */
/* Sign-in step                                                        */
/* ------------------------------------------------------------------ */

export type AdminMfaChallenge = {
  challengeToken: string;
  methods: string[];
};

export function AdminMfaLoginStep({
  challenge,
  onSignedIn,
  onRestart,
}: {
  readonly challenge: AdminMfaChallenge;
  readonly onSignedIn: () => void;
  readonly onRestart: (message: string | null) => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!useRecovery && !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    if (useRecovery && recoveryCode.trim().length < 10) {
      setError("Enter one of your recovery codes.");
      return;
    }

    setBusy(true);
    try {
      const response = await postJson(
        "/api/auth/mfa/verify",
        useRecovery
          ? {
              challengeToken: challenge.challengeToken,
              recoveryCode: recoveryCode.trim(),
            }
          : { challengeToken: challenge.challengeToken, code },
      );
      if (response.ok) {
        onSignedIn();
        return;
      }
      const failure = await readError(
        response,
        "The code could not be verified.",
      );
      if (failure.errorCode === "AUTH_MFA_CHALLENGE_INVALID") {
        onRestart(failure.message);
        return;
      }
      setError(failure.message);
      setCode("");
    } catch {
      setError("The verification request failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <h2 className="text-base font-semibold text-slate-950">
        Two-factor authentication
      </h2>
      <ErrorBox message={error} />
      {useRecovery ? (
        <RecoveryField
          autoFocus
          disabled={busy}
          onChange={setRecoveryCode}
          value={recoveryCode}
        />
      ) : (
        <CodeField autoFocus disabled={busy} onChange={setCode} value={code} />
      )}
      <button className={`${primaryClass} w-full`} disabled={busy} type="submit">
        {busy ? "Verifying..." : "Verify"}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {challenge.methods.includes("RECOVERY_CODE") ? (
          <button
            className={linkClass}
            onClick={() => {
              setUseRecovery((current) => !current);
              setError(null);
            }}
            type="button"
          >
            {useRecovery ? "Use authenticator code" : "Use a recovery code"}
          </button>
        ) : (
          <span />
        )}
        <button
          className={linkClass}
          onClick={() => onRestart(null)}
          type="button"
        >
          Back to sign in
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Security page card                                                  */
/* ------------------------------------------------------------------ */

type MfaStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

type SetupDetails = {
  qrCodeDataUrl: string;
  manualEntryKey: string;
  accountLabel?: string;
};

type Mode =
  | { kind: "idle" }
  | { kind: "enrolling"; setup: SetupDetails }
  | { kind: "codes"; codes: string[] }
  | { kind: "regenerate" }
  | { kind: "disable" };

export function AdminMfaCard() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform-users/me/mfa", {
        cache: "no-store",
      });
      if (!response.ok) {
        setLoadError(
          (await readError(response, "Two-factor status could not be loaded."))
            .message,
        );
        return;
      }
      setStatus((await response.json()) as MfaStatus);
      setLoadError(null);
    } catch {
      setLoadError("Two-factor status could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const response = await postJson("/api/platform-users/me/mfa/setup");
      if (!response.ok) {
        setError(
          (await readError(response, "Two-factor setup could not start."))
            .message,
        );
        return;
      }
      setMode({ kind: "enrolling", setup: (await response.json()) as SetupDetails });
    } catch {
      setError("Two-factor setup could not start.");
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    setMode({ kind: "idle" });
    setError(null);
    void load();
  }

  return (
    <div className="space-y-4" data-testid="admin-mfa-settings">
      <ErrorBox message={loadError} />
      {!status && !loadError ? (
        <p className="text-sm text-slate-600" role="status">
          Loading...
        </p>
      ) : null}
      {status ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd className="mt-1">
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  status.enabled
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {status.enabled ? "On" : "Off"}
              </span>
            </dd>
          </div>
          {status.enabled ? (
            <>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Turned on
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {status.enabledAt
                    ? new Date(status.enabledAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recovery codes left
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {status.recoveryCodesRemaining}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      ) : null}

      <ErrorBox message={error} />

      {mode.kind === "enrolling" ? (
        <EnrolmentPanel
          onCancel={() => setMode({ kind: "idle" })}
          onConfirmed={(codes) => {
            setMode({ kind: "codes", codes });
            // MFA is on from this moment; the status must say so while the
            // recovery codes are showing (TASK-0032 browser QA).
            void load();
          }}
          setup={mode.setup}
        />
      ) : null}
      {mode.kind === "codes" ? (
        <RecoveryCodes codes={mode.codes} onDone={finish} />
      ) : null}
      {mode.kind === "regenerate" ? (
        <RegenerateForm
          onCancel={() => setMode({ kind: "idle" })}
          onDone={(codes) => setMode({ kind: "codes", codes })}
        />
      ) : null}
      {mode.kind === "disable" ? (
        <DisableForm onCancel={() => setMode({ kind: "idle" })} onDone={finish} />
      ) : null}

      {status && mode.kind === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {status.enabled ? (
            <>
              <button
                className={secondaryClass}
                onClick={() => setMode({ kind: "regenerate" })}
                type="button"
              >
                New recovery codes
              </button>
              <button
                className={secondaryClass}
                onClick={() => setMode({ kind: "disable" })}
                type="button"
              >
                Turn off
              </button>
            </>
          ) : (
            <button
              className={primaryClass}
              disabled={busy}
              onClick={() => void startSetup()}
              type="button"
            >
              {busy ? "Starting..." : "Turn on"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function EnrolmentPanel({
  setup,
  onConfirmed,
  onCancel,
}: {
  readonly setup: SetupDetails;
  readonly onConfirmed: (codes: string[]) => void;
  readonly onCancel: () => void;
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
    try {
      const response = await postJson(
        "/api/platform-users/me/mfa/setup/confirm",
        { code },
      );
      if (!response.ok) {
        setError(
          (await readError(response, "The code could not be verified."))
            .message,
        );
        setCode("");
        return;
      }
      const data = (await response.json()) as { recoveryCodes?: string[] };
      onConfirmed(data.recoveryCodes ?? []);
    } catch {
      setError("The request failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <ErrorBox message={error} />
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL rendered by the API */}
        <img
          alt="QR code for your authenticator app"
          className="h-48 w-48 shrink-0 rounded-xl border border-slate-200 bg-white p-2"
          height={192}
          src={setup.qrCodeDataUrl}
          width={192}
        />
        <div className="w-full min-w-0 space-y-2">
          <p className="text-sm font-medium text-slate-900">Setup key</p>
          <p
            className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900"
            data-testid="mfa-manual-key"
          >
            {setup.manualEntryKey}
          </p>
          {setup.accountLabel ? (
            <p className="text-sm text-slate-600">{setup.accountLabel}</p>
          ) : null}
          <button
            className={secondaryClass}
            onClick={() => {
              void navigator.clipboard
                .writeText(setup.manualEntryKey.replace(/\s/g, ""))
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
            type="button"
          >
            {copied ? "Copied" : "Copy key"}
          </button>
        </div>
      </div>
      <CodeField disabled={busy} onChange={setCode} value={code} />
      <div className="flex flex-wrap gap-2">
        <button className={primaryClass} disabled={busy} type="submit">
          {busy ? "Verifying..." : "Verify and turn on"}
        </button>
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function RecoveryCodes({
  codes,
  onDone,
}: {
  readonly codes: readonly string[];
  readonly onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const checkboxId = useId();
  const text = codes.join("\n");

  function download() {
    const url = URL.createObjectURL(
      new Blob([`DijiPeople recovery codes\n\n${text}\n`], {
        type: "text/plain",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dijipeople-admin-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-900">Recovery codes</p>
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-900 sm:grid-cols-2"
        data-testid="mfa-recovery-codes"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          className={secondaryClass}
          onClick={() => {
            void navigator.clipboard
              .writeText(text)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button className={secondaryClass} onClick={download} type="button">
          Download
        </button>
      </div>
      <div className="flex items-center gap-3">
        <input
          checked={saved}
          className="h-4 w-4 rounded border-slate-300"
          id={checkboxId}
          onChange={(event) => setSaved(event.target.checked)}
          type="checkbox"
        />
        <label className="text-sm text-slate-900" htmlFor={checkboxId}>
          I&apos;ve saved these codes
        </label>
      </div>
      <button
        className={primaryClass}
        disabled={!saved}
        onClick={onDone}
        type="button"
      >
        Done
      </button>
    </div>
  );
}

function RegenerateForm({
  onDone,
  onCancel,
}: {
  readonly onDone: (codes: string[]) => void;
  readonly onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await postJson(
        "/api/platform-users/me/mfa/recovery-codes",
        { code },
      );
      if (!response.ok) {
        setError(
          (await readError(response, "The code could not be verified."))
            .message,
        );
        setCode("");
        return;
      }
      const data = (await response.json()) as { recoveryCodes?: string[] };
      onDone(data.recoveryCodes ?? []);
    } catch {
      setError("The request failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <ErrorBox message={error} />
      <CodeField autoFocus disabled={busy} onChange={setCode} value={code} />
      <div className="flex flex-wrap gap-2">
        <button className={primaryClass} disabled={busy} type="submit">
          {busy ? "Generating..." : "Generate new codes"}
        </button>
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DisableForm({
  onDone,
  onCancel,
}: {
  readonly onDone: () => void;
  readonly onCancel: () => void;
}) {
  const passwordId = useId();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError("Enter your current password.");
      return;
    }
    if (!useRecovery && !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await postJson(
        "/api/platform-users/me/mfa/disable",
        useRecovery
          ? { password, recoveryCode: recoveryCode.trim() }
          : { password, code },
      );
      if (!response.ok) {
        setError(
          (
            await readError(
              response,
              "Two-factor authentication could not be turned off.",
            )
          ).message,
        );
        setCode("");
        return;
      }
      onDone();
    } catch {
      setError("The request failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <ErrorBox message={error} />
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-900" htmlFor={passwordId}>
          Current password
        </label>
        <input
          autoComplete="current-password"
          className={inputClass}
          disabled={busy}
          id={passwordId}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </div>
      {useRecovery ? (
        <RecoveryField
          disabled={busy}
          onChange={setRecoveryCode}
          value={recoveryCode}
        />
      ) : (
        <CodeField disabled={busy} onChange={setCode} value={code} />
      )}
      <button
        className={linkClass}
        onClick={() => setUseRecovery((current) => !current)}
        type="button"
      >
        {useRecovery ? "Use authenticator code" : "Use a recovery code"}
      </button>
      <div className="flex flex-wrap gap-2">
        <button className={primaryClass} disabled={busy} type="submit">
          {busy ? "Turning off..." : "Turn off"}
        </button>
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
