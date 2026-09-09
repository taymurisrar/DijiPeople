"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Enable/disable, verify, and ask the gateway to sync.
 *
 * All four go through named API operations, never a status field. None of them
 * claims the device was contacted: DijiPeople's servers have no route to a
 * terminal on the customer's own network, so a request is recorded and the
 * gateway picks it up on its next check-in. Saying "syncing…" here would be
 * reporting something nobody has observed.
 *
 * "Verify device" is the action the readiness panel has always told
 * administrators to run, and until BUG-2732 it existed nowhere in the product.
 * It is what breaks the first-move deadlock: an integration cannot be activated
 * until one of its devices has answered, and this is how a device is asked to.
 */
export function DeviceStateActions({
  deviceId,
  isEnabled,
  syncRequestPending = false,
  verificationStatus,
}: {
  deviceId: string;
  isEnabled: boolean;
  syncRequestPending?: boolean;
  verificationStatus?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "state" | "sync" | "verify">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Offered until a terminal has actually answered. Once one has, the useful
  // action is Sync now — re-verifying a working device tells nobody anything.
  const needsVerification = verificationStatus !== "VERIFIED";

  async function post(path: string): Promise<Response | null> {
    try {
      return await fetch(`/api/integrations/attendance/devices/${deviceId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      return null;
    }
  }

  async function toggle() {
    setBusy("state");
    setError(null);
    setNotice(null);

    const response = await post(isEnabled ? "disable" : "enable");

    if (!response?.ok) {
      setError("The device could not be updated. Try again.");
    } else {
      router.refresh();
    }

    setBusy(null);
  }

  async function requestVerification() {
    setBusy("verify");
    setError(null);
    setNotice(null);

    const response = await post("verify");

    if (!response?.ok) {
      setError("The verification could not be requested. Try again.");
    } else {
      setNotice(
        "Requested. The gateway will contact this terminal at its next check-in and report what answered.",
      );
      router.refresh();
    }

    setBusy(null);
  }

  async function requestSync() {
    setBusy("sync");
    setError(null);
    setNotice(null);

    const response = await post("sync-now");

    if (!response?.ok) {
      setError("The sync could not be requested. Try again.");
    } else {
      setNotice(
        "Requested. The gateway will collect this device the next time it checks in.",
      );
      router.refresh();
    }

    setBusy(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={
          isEnabled
            ? "rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
            : "rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
        }
        disabled={busy !== null}
        onClick={() => void toggle()}
      >
        {busy === "state" ? "Working…" : isEnabled ? "Disable device" : "Enable device"}
      </button>

      {isEnabled && needsVerification ? (
        <button
          type="button"
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
          disabled={busy !== null || syncRequestPending}
          onClick={() => void requestVerification()}
          title={
            syncRequestPending
              ? "A request has already been made and is waiting for the gateway."
              : "Ask the gateway to contact this terminal and report what answered."
          }
        >
          {busy === "verify"
            ? "Requesting…"
            : syncRequestPending
              ? "Verification requested"
              : "Verify device"}
        </button>
      ) : null}

      {isEnabled ? (
        <button
          type="button"
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
          disabled={busy !== null || syncRequestPending}
          onClick={() => void requestSync()}
          title={
            syncRequestPending
              ? "A sync has already been requested and is waiting for the gateway."
              : undefined
          }
        >
          {busy === "sync"
            ? "Requesting…"
            : syncRequestPending
              ? "Sync requested"
              : "Sync now"}
        </button>
      ) : null}

      {error ? (
        <span className="text-sm font-medium text-red-600" role="alert">
          {error}
        </span>
      ) : null}
      {notice ? (
        <span className="text-sm font-medium text-muted-foreground" role="status">
          {notice}
        </span>
      ) : null}
    </div>
  );
}
