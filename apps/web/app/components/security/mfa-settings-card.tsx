"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  MfaEnrolmentPanel,
  MfaError,
  mfaButtonClasses,
  OneTimeCodeField,
  readMfaError,
  RecoveryCodeField,
  RecoveryCodesPanel,
  type MfaSetupDetails,
} from "./mfa-panels";

/*
 * ADR-0019 — the signed-in tenant user's own two-factor authentication, on My
 * Profile. Every call goes to `/api/auth/mfa/*`, which acts on the session's
 * account only; there is no user id anywhere in this component.
 */

type MfaStatus = {
  enabled: boolean;
  enabledAt: string | null;
  pendingSetup: boolean;
  recoveryCodesRemaining: number;
};

type Mode =
  | { kind: "idle" }
  | { kind: "enrolling"; setup: MfaSetupDetails }
  | { kind: "codes"; codes: string[] }
  | { kind: "regenerate" }
  | { kind: "disable" };

async function postJson(path: string, body?: unknown) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function MfaSettingsCard() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/mfa/status", {
        cache: "no-store",
      });
      if (!response.ok) {
        const failure = await readMfaError(
          response,
          "Two-factor status could not be loaded.",
        );
        setLoadError(failure.message);
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
      const response = await postJson("/api/auth/mfa/setup");
      if (!response.ok) {
        setError(
          (await readMfaError(response, "Two-factor setup could not start."))
            .message,
        );
        return;
      }
      setMode({
        kind: "enrolling",
        setup: (await response.json()) as MfaSetupDetails,
      });
    } catch {
      setError("Two-factor setup could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(code: string) {
    const response = await postJson("/api/auth/mfa/setup/confirm", { code });
    if (!response.ok) {
      return (await readMfaError(response, "The code could not be verified."))
        .message;
    }
    const data = (await response.json()) as { recoveryCodes?: string[] };
    setMode({ kind: "codes", codes: data.recoveryCodes ?? [] });
    return null;
  }

  function finish() {
    setMode({ kind: "idle" });
    setError(null);
    void load();
  }

  return (
    <SectionCard title="Two-factor authentication">
      <div className="space-y-5" data-testid="mfa-settings">
        {loadError ? <MfaError message={loadError} /> : null}
        {!status && !loadError ? (
          <p className="text-sm text-muted" role="status">
            Loading...
          </p>
        ) : null}

        {status ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                Status
              </dt>
              <dd className="mt-1">
                <StatusPill tone={status.enabled ? "good" : "muted"}>
                  {status.enabled ? "On" : "Off"}
                </StatusPill>
              </dd>
            </div>
            {status.enabled ? (
              <>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Turned on
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {status.enabledAt ? formatDateTime(status.enabledAt) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Recovery codes left
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {status.recoveryCodesRemaining}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        ) : null}

        <MfaError message={error} />

        {mode.kind === "enrolling" ? (
          <MfaEnrolmentPanel
            onCancel={() => setMode({ kind: "idle" })}
            onConfirm={confirmSetup}
            setup={mode.setup}
          />
        ) : null}

        {mode.kind === "codes" ? (
          <RecoveryCodesPanel codes={mode.codes} doneLabel="Done" onDone={finish} />
        ) : null}

        {mode.kind === "regenerate" ? (
          <RegenerateForm
            onCancel={() => setMode({ kind: "idle" })}
            onDone={(codes) => setMode({ kind: "codes", codes })}
          />
        ) : null}

        {mode.kind === "disable" ? (
          <DisableForm
            onCancel={() => setMode({ kind: "idle" })}
            onDone={finish}
          />
        ) : null}

        {status && mode.kind === "idle" ? (
          <div className="flex flex-wrap gap-3">
            {status.enabled ? (
              <>
                <button
                  className={mfaButtonClasses.secondary}
                  onClick={() => setMode({ kind: "regenerate" })}
                  type="button"
                >
                  New recovery codes
                </button>
                <button
                  className={mfaButtonClasses.secondary}
                  onClick={() => setMode({ kind: "disable" })}
                  type="button"
                >
                  Turn off
                </button>
              </>
            ) : (
              <button
                className={mfaButtonClasses.primary}
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
    </SectionCard>
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
      const response = await postJson("/api/auth/mfa/recovery-codes", {
        code,
      });
      if (!response.ok) {
        setError(
          (await readMfaError(response, "The code could not be verified."))
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
      <MfaError message={error} />
      <OneTimeCodeField autoFocus disabled={busy} onChange={setCode} value={code} />
      <div className="flex flex-wrap gap-3">
        <button className={mfaButtonClasses.primary} disabled={busy} type="submit">
          {busy ? "Generating..." : "Generate new codes"}
        </button>
        <button
          className={mfaButtonClasses.secondary}
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
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError("Enter your current password.");
      return;
    }
    if (!useRecoveryCode && !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await postJson(
        "/api/auth/mfa/disable",
        useRecoveryCode
          ? { password, recoveryCode: recoveryCode.trim() }
          : { password, code },
      );
      if (!response.ok) {
        setError(
          (
            await readMfaError(
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
      <MfaError message={error} />
      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor={passwordId}
        >
          Current password
        </label>
        <input
          autoComplete="current-password"
          className="block w-full min-w-0 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          disabled={busy}
          id={passwordId}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </div>
      {useRecoveryCode ? (
        <RecoveryCodeField
          disabled={busy}
          onChange={setRecoveryCode}
          value={recoveryCode}
        />
      ) : (
        <OneTimeCodeField disabled={busy} onChange={setCode} value={code} />
      )}
      <button
        className="text-sm font-medium text-muted transition hover:text-foreground"
        onClick={() => setUseRecoveryCode((current) => !current)}
        type="button"
      >
        {useRecoveryCode ? "Use authenticator code" : "Use a recovery code"}
      </button>
      <div className="flex flex-wrap gap-3">
        <button className={mfaButtonClasses.primary} disabled={busy} type="submit">
          {busy ? "Turning off..." : "Turn off"}
        </button>
        <button
          className={mfaButtonClasses.secondary}
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
