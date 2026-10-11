"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  canOpenWorkspace,
  eyebrowFor,
  headlineFor,
  isTerminalState,
  nextDelayMs,
  pollErrorMessage,
  statusPollUrl,
  timedOutMessage,
  type OnboardingStatusView,
} from "../../../lib/provisioning-view";

/**
 * What the buyer watches while their workspace is built.
 *
 * **Every step shown here is a row the API read.** The brief forbids fabricating
 * completed steps and the temptation is real: a list that advances on a timer
 * looks better than one sitting still for forty seconds. It also lies, and the
 * customer finds out when the finished-looking page has no workspace behind it.
 * Anything the API has not evidenced renders as pending.
 *
 * Every decision about *what may be said* lives in `lib/provisioning-view.ts`
 * with tests behind it. This file only paints.
 *
 * It polls rather than streams: provisioning takes tens of seconds, the status
 * endpoint is cheap, and a websocket for a page somebody sees once per purchase
 * is a connection to maintain for no benefit.
 */

/*
 * Stop after ten minutes.
 *
 * Not because provisioning takes that long — it takes seconds — but because a
 * page left open on a phone overnight should not poll until the battery dies.
 * Reaching this shows a "still working" message rather than an error, since a
 * slow provision is not a failed one and saying otherwise would send the buyer
 * to support for something that is about to succeed.
 */
const GIVE_UP_AFTER_MS = 10 * 60_000;

/*
 * "Check again" after giving up resumes at the slowest cadence for five more
 * minutes, rather than restarting the fast first minute. The rate-limit window
 * is the server's, not the page's: a restart that replayed the 2-second tier
 * inside the same ten minutes would spend the budget `pollDelayMs` was sized
 * to keep, and turn a slow confirmation into a wall of 429s.
 */
const RESUME_ELAPSED_OFFSET_MS = 3 * 60_000;
const RESUME_FOR_MS = 5 * 60_000;

export function ProvisioningProgress({
  onboardingId,
  sessionId,
}: {
  onboardingId: string;
  /** Stripe's `session_id` from the return URL; a cross-check only. */
  sessionId?: string | null;
}) {
  const [status, setStatus] = useState<OnboardingStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  /** Bumped by "Check again" to start a new, slower polling run. */
  const [resumeCount, setResumeCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const resumed = resumeCount > 0;
    const startedAt = Date.now() - (resumed ? RESUME_ELAPSED_OFFSET_MS : 0);
    const giveUpAfter = resumed
      ? RESUME_ELAPSED_OFFSET_MS + RESUME_FOR_MS
      : GIVE_UP_AFTER_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      let httpStatus: number | null = null;

      try {
        const response = await fetch(statusPollUrl(onboardingId, sessionId), {
          cache: "no-store",
        });

        if (cancelled) return;
        httpStatus = response.status;

        if (!response.ok) {
          setError(pollErrorMessage(response.status));
        } else {
          const payload = (await response.json()) as OnboardingStatusView;
          if (cancelled) return;
          setError(null);
          setStatus(payload);
          if (isTerminalState(payload.state)) return;
        }
      } catch {
        if (cancelled) return;
        setError(pollErrorMessage(null));
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed > giveUpAfter) {
        if (!cancelled) setTimedOut(true);
        return;
      }

      timer = setTimeout(() => void poll(), nextDelayMs(elapsed, httpStatus));
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onboardingId, sessionId, resumeCount]);

  const ready = canOpenWorkspace(status);

  return (
    <section className="max-w-2xl rounded-[28px] border border-border bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
        {eyebrowFor(status)}
      </p>

      <h1 className="mt-3 text-3xl font-semibold text-foreground">
        {headlineFor(status)}
      </h1>

      {/*
        One live region for the whole panel, so a screen reader hears each
        transition instead of the list silently rearranging itself.
      */}
      <div aria-live="polite" className="mt-5">
        {status ? (
          <ol className="grid gap-2">
            {status.steps.map((step) => (
              <li className="flex items-center gap-3 text-sm" key={step.key}>
                <span
                  aria-hidden="true"
                  className={
                    step.state === "DONE"
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs text-white"
                      : "inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs text-muted"
                  }
                >
                  {step.state === "DONE" ? "✓" : ""}
                </span>
                <span
                  className={
                    step.state === "DONE" ? "text-foreground" : "text-muted"
                  }
                >
                  {step.label}
                  {/* Colour and a tick must not be the only signal. */}
                  <span className="sr-only">
                    {step.state === "DONE" ? " — done" : " — pending"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">Checking your workspace…</p>
        )}
      </div>

      {ready ? (
        <div className="mt-6">
          <p className="text-sm text-muted">{status?.workspace?.hostname}</p>
          <a
            className="mt-3 inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white"
            href={status?.workspace?.url}
          >
            Open DijiPeople
          </a>
        </div>
      ) : null}

      {status?.actionRequired ? (
        <div className="mt-5 rounded-2xl border border-border bg-surface p-4 text-sm text-foreground">
          <p>{status.actionRequired}</p>
          <Link className="mt-3 inline-flex font-semibold text-accent" href="/contact">
            Contact us
          </Link>
        </div>
      ) : null}

      {timedOut && !ready ? (
        <div className="mt-5">
          <p className="text-sm text-muted">{timedOutMessage(status)}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white"
              onClick={() => {
                setTimedOut(false);
                setResumeCount((count) => count + 1);
              }}
              type="button"
            >
              Check again
            </button>
            <Link
              className="inline-flex rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground"
              href="/contact"
            >
              Contact us
            </Link>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-5 text-sm text-muted" role="status">
          {error}
        </p>
      ) : null}

      {!ready && !timedOut ? (
        <p className="mt-6 text-xs text-muted">
          You can close this page — we will email you when your workspace is
          ready.
          {status ? ` Order ${status.orderNumber}` : ""}
        </p>
      ) : null}
    </section>
  );
}
