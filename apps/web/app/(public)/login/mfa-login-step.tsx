"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  MfaEnrolmentPanel,
  MfaError,
  mfaButtonClasses,
  OneTimeCodeField,
  readMfaError,
  RecoveryCodeField,
  RecoveryCodesPanel,
  type MfaSetupDetails,
} from "@/app/components/security/mfa-panels";

/*
 * ADR-0019 — the second step of sign-in. The password step has already been
 * accepted and returned a challenge token; nothing here holds a session until
 * the verify (or setup-confirm) route answers with one and sets the cookies.
 *
 * An expired or spent challenge cannot be retried: the only way on is to enter
 * the password again, so `onRestart` returns the person to that step.
 */

export type LoginMfaChallenge = {
  challengeKind: "VERIFY" | "SETUP_REQUIRED";
  challengeToken: string;
  methods: string[];
};

const CHALLENGE_EXPIRED = "AUTH_MFA_CHALLENGE_INVALID";

export function MfaLoginStep({
  challenge,
  onSignedIn,
  onRestart,
}: {
  readonly challenge: LoginMfaChallenge;
  readonly onSignedIn: () => void;
  readonly onRestart: (message: string) => void;
}) {
  return challenge.challengeKind === "SETUP_REQUIRED" ? (
    <SetupRequiredStep
      challengeToken={challenge.challengeToken}
      onRestart={onRestart}
      onSignedIn={onSignedIn}
    />
  ) : (
    <VerifyStep
      allowRecoveryCode={challenge.methods.includes("RECOVERY_CODE")}
      challengeToken={challenge.challengeToken}
      onRestart={onRestart}
      onSignedIn={onSignedIn}
    />
  );
}

function VerifyStep({
  challengeToken,
  allowRecoveryCode,
  onSignedIn,
  onRestart,
}: {
  readonly challengeToken: string;
  readonly allowRecoveryCode: boolean;
  readonly onSignedIn: () => void;
  readonly onRestart: (message: string) => void;
}) {
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!useRecoveryCode && !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    if (useRecoveryCode && recoveryCode.trim().length < 10) {
      setError("Enter one of your recovery codes.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          useRecoveryCode
            ? { challengeToken, recoveryCode: recoveryCode.trim() }
            : { challengeToken, code },
        ),
      });

      if (response.ok) {
        onSignedIn();
        return;
      }

      const failure = await readMfaError(
        response,
        "The code could not be verified.",
      );
      if (failure.errorCode === CHALLENGE_EXPIRED) {
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
    <form className="space-y-5" noValidate onSubmit={submit}>
      <h2 className="text-base font-semibold text-foreground">
        Two-factor authentication
      </h2>
      <MfaError message={error} />
      {useRecoveryCode ? (
        <RecoveryCodeField
          autoFocus
          disabled={busy}
          onChange={setRecoveryCode}
          value={recoveryCode}
        />
      ) : (
        <OneTimeCodeField
          autoFocus
          disabled={busy}
          onChange={setCode}
          value={code}
        />
      )}
      <button
        className={`${mfaButtonClasses.primary} w-full`}
        disabled={busy}
        type="submit"
      >
        {busy ? "Verifying..." : "Verify"}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {allowRecoveryCode ? (
          <button
            className="font-medium text-muted transition hover:text-foreground"
            onClick={() => {
              setUseRecoveryCode((current) => !current);
              setError(null);
            }}
            type="button"
          >
            {useRecoveryCode
              ? "Use authenticator code"
              : "Use a recovery code"}
          </button>
        ) : (
          <span />
        )}
        <button
          className="font-medium text-muted transition hover:text-foreground"
          onClick={() => onRestart("")}
          type="button"
        >
          Back to sign in
        </button>
      </div>
    </form>
  );
}

function SetupRequiredStep({
  challengeToken,
  onSignedIn,
  onRestart,
}: {
  readonly challengeToken: string;
  readonly onSignedIn: () => void;
  readonly onRestart: (message: string) => void;
}) {
  const [setup, setSetup] = useState<MfaSetupDetails | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * Starting setup generates a new seed and replaces the pending one, so it
   * must run once per challenge — never again because the parent re-rendered
   * with a new `onRestart` function.
   */
  const onRestartRef = useRef(onRestart);
  useEffect(() => {
    onRestartRef.current = onRestart;
  }, [onRestart]);

  useEffect(() => {
    let active = true;
    async function start() {
      try {
        const response = await fetch("/api/auth/mfa/challenge/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeToken }),
        });
        if (!response.ok) {
          const failure = await readMfaError(
            response,
            "Two-factor setup could not be started.",
          );
          if (failure.errorCode === CHALLENGE_EXPIRED) {
            onRestartRef.current(failure.message);
            return;
          }
          if (active) setError(failure.message);
          return;
        }
        const data = (await response.json()) as MfaSetupDetails;
        if (active) setSetup(data);
      } catch {
        if (active) setError("Two-factor setup could not be started.");
      }
    }
    void start();
    return () => {
      active = false;
    };
  }, [challengeToken]);

  async function confirm(code: string) {
    try {
      const response = await fetch("/api/auth/mfa/challenge/setup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ challengeToken, code }),
      });
      if (!response.ok) {
        const failure = await readMfaError(
          response,
          "The code could not be verified.",
        );
        if (failure.errorCode === CHALLENGE_EXPIRED) {
          onRestart(failure.message);
          return null;
        }
        return failure.message;
      }
      const data = (await response.json()) as { recoveryCodes?: string[] };
      setRecoveryCodes(data.recoveryCodes ?? []);
      return null;
    } catch {
      return "The verification request failed. Check your connection.";
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">
        Set up two-factor authentication
      </h2>
      {recoveryCodes ? (
        <RecoveryCodesPanel codes={recoveryCodes} onDone={onSignedIn} />
      ) : setup ? (
        <MfaEnrolmentPanel
          onCancel={() => onRestart("")}
          onConfirm={confirm}
          setup={setup}
        />
      ) : error ? (
        <div className="space-y-4">
          <MfaError message={error} />
          <button
            className={mfaButtonClasses.secondary}
            onClick={() => onRestart("")}
            type="button"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted" role="status">
          Loading...
        </p>
      )}
    </div>
  );
}
