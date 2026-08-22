"use client";

import { useState } from "react";

import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "../../_lib/presentation";
import { useDialogBehavior } from "@/app/components/ui/dialog";

/**
 * Pairing code issuance.
 *
 * The plaintext code exists only in this component's state, for as long as the
 * dialog is open. It is not stored, not re-fetchable, and deliberately not kept
 * after dismissal — the API only ever returns it once. The dialog says all of
 * that plainly so nobody closes it expecting to find the code again later.
 */
export function PairingCodeDialog({
  gatewayId,
  gatewayName,
  onClose,
}: {
  gatewayId: string;
  gatewayName: string;
  onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // BUG-0043: kept its own layout, gained the guarantees it never had - focus
  // containment, Escape, focus restore and dialog semantics. `busy` holds
  // Escape shut while a pairing code is being generated.
  const dialog = useDialogBehavior({ open: true, onClose: close, busy });

  async function generate() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/gateways/${gatewayId}/pairing-code`,
        { method: "POST" },
      );

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (body as { message?: string } | null)?.message ??
            "A pairing code could not be generated.",
        );
        return;
      }

      const payload = body as { pairingCode: string; expiresAt: string };
      setCode(payload.pairingCode);
      setExpiresAt(payload.expiresAt);
    } catch {
      setError("A pairing code could not be generated. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    // Clearing before unmount so the value does not linger in memory longer
    // than the dialog it belongs to.
    setCode(null);
    setExpiresAt(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      {...dialog.backdropProps}
    >
      <div
        {...dialog.panelProps}
        className="w-full max-w-lg rounded-[24px] border border-border bg-surface p-6 shadow-lg"
      >
        <h2
          className="text-lg font-semibold text-foreground"
          id={dialog.titleId}
        >
          Pair {gatewayName}
        </h2>

        {!code ? (
          <>
            <p className="mt-2 text-sm leading-6 text-muted">
              Generate a one-time code, then enter it in the DijiPeople
              Integration Gateway installer on the machine that can reach your
              devices.
            </p>

            {error ? (
              <p className="mt-4 text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                disabled={busy}
                onClick={() => void generate()}
              >
                {busy ? "Generating…" : "Generate pairing code"}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                onClick={close}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4"
              data-testid="pairing-code-panel"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Shown once
              </p>
              <p className="mt-2 select-all font-mono text-2xl font-semibold tracking-widest text-foreground">
                {code}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-amber-900">
                <StatusPill tone="warning">Single use</StatusPill>
                <span>Expires {formatDateTime(expiresAt)}</span>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-muted">
              Copy this code now. It cannot be shown again after you close this
              dialog — generate a new one if you lose it. Generating a new code
              cancels this one.
            </p>

            <label className="mt-4 flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>I have copied the pairing code.</span>
            </label>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                disabled={!acknowledged}
                onClick={close}
              >
                Done
              </button>
              <button
                type="button"
                className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  setAcknowledged(false);
                  void generate();
                }}
              >
                Generate a different code
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
