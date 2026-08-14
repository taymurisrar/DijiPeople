"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusPill } from "@/app/components/ui/status-pill";
import { PairingCodeDialog } from "../../_components/pairing-code-dialog";

/**
 * Gateway administration.
 *
 * Rotation and revocation are deliberately separated and each confirms first.
 * Rotation issues a second credential and leaves the current one working, so a
 * gateway can be switched over without downtime; the copy says so, because an
 * administrator who expects rotation to cut access immediately would otherwise
 * leave the old credential live by accident.
 */
export function GatewayAdminActions({
  gatewayId,
  gatewayName,
  isRevoked,
}: {
  gatewayId: string;
  gatewayName: string;
  isRevoked: boolean;
}) {
  const router = useRouter();
  const [showPairing, setShowPairing] = useState(false);
  const [rotated, setRotated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    if (
      !window.confirm(
        "Issue a new credential? The current one keeps working until you retire it, so the gateway can be switched over without downtime.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/gateways/${gatewayId}/rotate-credential`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          (body as { message?: string } | null)?.message ??
            "A new credential could not be issued.",
        );
        return;
      }

      setRotated((body as { credential: string }).credential);
      router.refresh();
    } catch {
      setError("A new credential could not be issued. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (
      !window.confirm(
        `Revoke ${gatewayName}? It will stop collecting attendance immediately and every credential it holds becomes invalid. This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/gateways/${gatewayId}/revoke`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Revoked from Settings" }),
        },
      );

      if (!response.ok) {
        setError("The gateway could not be revoked.");
        return;
      }
      router.refresh();
    } catch {
      setError("The gateway could not be revoked. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (isRevoked) {
    return (
      <p className="text-sm text-muted">
        This gateway has been revoked. Create a new gateway to reconnect these
        devices.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
          onClick={() => setShowPairing(true)}
        >
          Generate pairing code
        </button>
        <button
          type="button"
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
          disabled={busy}
          onClick={() => void rotate()}
        >
          Rotate credential
        </button>
        <button
          type="button"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
          disabled={busy}
          onClick={() => void revoke()}
        >
          Revoke gateway
        </button>
      </div>

      {rotated ? (
        <div
          className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4"
          data-testid="rotated-credential-panel"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            New credential — shown once
          </p>
          <p className="mt-2 select-all break-all font-mono text-sm font-semibold text-foreground">
            {rotated}
          </p>
          <p className="mt-3 text-xs leading-5 text-amber-900">
            Enter this in the gateway, then retire the previous credential from
            the list below. The old credential keeps working until you do.
          </p>
          <button
            type="button"
            className="mt-3 rounded-2xl border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground"
            onClick={() => setRotated(null)}
          >
            I have copied it
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {showPairing ? (
        <PairingCodeDialog
          gatewayId={gatewayId}
          gatewayName={gatewayName}
          onClose={() => {
            setShowPairing(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** Credential list. Shows prefixes and lifecycle state, never a secret. */
export function GatewayCredentialList({
  credentials,
}: {
  credentials: Array<{
    id: string;
    tokenPrefix: string;
    label: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
}) {
  if (credentials.length === 0) {
    return (
      <p className="text-sm text-muted">
        No credential has been issued yet. Pair the gateway to issue one.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {credentials.map((credential) => (
        <li
          key={credential.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <div>
            <p className="font-mono text-sm text-foreground">
              {credential.tokenPrefix}…
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {credential.label ?? "Credential"} · issued{" "}
              {new Date(credential.createdAt).toLocaleDateString()}
              {credential.lastUsedAt
                ? ` · last used ${new Date(credential.lastUsedAt).toLocaleDateString()}`
                : " · never used"}
            </p>
          </div>
          <StatusPill tone={credential.revokedAt ? "muted" : "good"}>
            {credential.revokedAt ? "Retired" : "Active"}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}
