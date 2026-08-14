"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime, formatFileSize, platformLabel } from "../../../_lib/presentation";
import type { ApplicationRelease } from "../../../_lib/types";

const STEPS = ["Create", "Download", "Pair", "Connect"];

/**
 * Gateway setup.
 *
 * Step 2 is honest about reality: if no Integration Gateway release has been
 * published, the step says so rather than offering a link that goes nowhere.
 * A fake download would send an administrator hunting for an installer that
 * does not exist.
 *
 * The pairing code is displayed once, in-memory, and is never re-fetchable.
 */
export function GatewaySetupWizard({
  gatewayRelease,
}: {
  gatewayRelease: ApplicationRelease | null;
}) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gateway, setGateway] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGateway() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/gateways", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (body as { message?: string } | null)?.message ??
            "The gateway could not be created.",
        );
        return;
      }

      setGateway(body as { id: string; name: string });
      setStep(1);
    } catch {
      setError("The gateway could not be created. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function generateCode() {
    if (!gateway) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/gateways/${gateway.id}/pairing-code`,
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
      setPairingCode(payload.pairingCode);
      setExpiresAt(payload.expiresAt);
    } catch {
      setError("A pairing code could not be generated. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap gap-2" aria-label="Setup steps">
        {STEPS.map((label, index) => (
          <li key={label}>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                index === step
                  ? "border-accent/30 bg-accent-soft text-accent"
                  : index < step
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-border bg-white/70 text-muted"
              }`}
            >
              <span>{index + 1}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {error ? (
        <div
          className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <SectionCard
          title="Name this gateway"
          description="Give it a name that says where it runs, so you can tell several apart later."
        >
          <div className="grid gap-4 sm:max-w-md">
            <div>
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="gateway-name"
              >
                Gateway name
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="gateway-name"
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                value={name}
                placeholder="Head office gateway"
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="gateway-description"
              >
                Description
              </label>
              <input
                id="gateway-description"
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                value={description}
                placeholder="Runs on the reception PC"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div>
              <button
                type="button"
                className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                disabled={busy || !name.trim()}
                onClick={() => void createGateway()}
              >
                {busy ? "Creating…" : "Create gateway"}
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {step === 1 ? (
        <SectionCard
          title="Install the gateway"
          description="The gateway runs on a Windows machine that can reach your attendance devices."
        >
          {gatewayRelease ? (
            <div className="grid gap-4">
              <div className="rounded-[18px] border border-border bg-white/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {gatewayRelease.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Version {gatewayRelease.version} ·{" "}
                      {platformLabel(
                        gatewayRelease.platform,
                        gatewayRelease.architecture,
                      )}
                      {gatewayRelease.fileSizeBytes
                        ? ` · ${formatFileSize(gatewayRelease.fileSizeBytes)}`
                        : ""}
                    </p>
                  </div>
                  <a
                    className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
                    href={`/api${gatewayRelease.downloadPath}`}
                  >
                    Download
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-sky-900"
              data-testid="gateway-release-unavailable"
            >
              <p className="font-semibold">
                Gateway application not yet published
              </p>
              <p className="mt-1">
                The DijiPeople Integration Gateway installer is not available for
                download yet. You can still create the gateway and generate a
                pairing code now — pair it once the installer is published.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        </SectionCard>
      ) : null}

      {step === 2 ? (
        <SectionCard
          title="Pair the gateway"
          description="Enter this code in the gateway installer to link it to your organisation."
        >
          {!pairingCode ? (
            <button
              type="button"
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
              disabled={busy}
              onClick={() => void generateCode()}
            >
              {busy ? "Generating…" : "Generate pairing code"}
            </button>
          ) : (
            <div className="grid gap-4">
              <div
                className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4"
                data-testid="pairing-code-panel"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Shown once
                </p>
                <p className="mt-2 select-all font-mono text-2xl font-semibold tracking-widest text-foreground">
                  {pairingCode}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-amber-900">
                  <StatusPill tone="warning">Single use</StatusPill>
                  <span>Expires {formatDateTime(expiresAt)}</span>
                </div>
              </div>

              <p className="text-sm leading-6 text-muted">
                Copy this code now — it cannot be shown again. If you lose it,
                generate a new one from the gateway page; that cancels this code.
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
                  onClick={() => setStep(3)}
                >
                  I have copied the code
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void generateCode()}
                >
                  Generate a different code
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      ) : null}

      {step === 3 && gateway ? (
        <SectionCard
          title="Waiting for the gateway to connect"
          description="Once the gateway is installed and paired, it reports in and appears as online."
        >
          <div className="grid gap-4">
            <div className="rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
              <p className="font-semibold">{gateway.name} is awaiting pairing</p>
              <p className="mt-1">
                This gateway shows as offline until it contacts DijiPeople for
                the first time.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
                onClick={() => {
                  router.push(
                    `/settings/integrations/attendance/gateways/${gateway.id}`,
                  );
                  router.refresh();
                }}
              >
                View gateway
              </button>
              <button
                type="button"
                className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                onClick={() =>
                  router.push("/settings/integrations/attendance/gateways")
                }
              >
                Back to gateways
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
