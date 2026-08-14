"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Enable/disable, and ask the gateway to sync.
 *
 * All three go through named API operations, never a status field. "Sync now"
 * deliberately does NOT claim the device was contacted: DijiPeople's servers
 * have no route to a terminal on the customer's own network, so the request is
 * recorded and the gateway picks it up on its next check-in. Saying "syncing…"
 * here would be reporting something nobody has observed.
 */
export function DeviceStateActions({
  deviceId,
  isEnabled,
  syncRequestPending = false,
}: {
  deviceId: string;
  isEnabled: boolean;
  syncRequestPending?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "state" | "sync">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
