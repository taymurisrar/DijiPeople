"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { IntegrationReadiness } from "../../../_lib/types";

/**
 * Lifecycle actions.
 *
 * Activate is disabled while the API reports blockers — but the blockers are
 * always rendered alongside it, so a disabled button never leaves someone
 * guessing why. There is no control that sets status directly; each button
 * calls the named transition and the API decides.
 */
export function IntegrationActions({
  integrationId,
  status,
  readiness,
  canManage,
}: {
  integrationId: string;
  status: string;
  readiness: IntegrationReadiness;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!canManage) return null;

  const base = `/api/integrations/attendance/integrations/${integrationId}`;
  const hasBlockers = readiness.blockers.length > 0;

  async function run(
    action: "validate-configuration" | "activate" | "disable",
    successMessage: string,
  ) {
    setBusy(action);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${base}/${action}`, { method: "POST" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const payload = body as
          | { message?: string; blockers?: string[] }
          | undefined;
        setError(
          payload?.blockers?.length
            ? `${payload.message ?? "This action is not available."} ${payload.blockers.join(" ")}`
            : (payload?.message ?? "This action could not be completed."),
        );
        return;
      }

      setNotice(successMessage);
      router.refresh();
    } catch {
      setError("This action could not be completed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
          disabled={busy !== null}
          onClick={() =>
            void run(
              "validate-configuration",
              "Configuration checked. Device verification still waits for a gateway.",
            )
          }
        >
          {busy === "validate-configuration"
            ? "Checking…"
            : "Validate configuration"}
        </button>

        {status !== "ACTIVE" ? (
          <button
            type="button"
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
            disabled={busy !== null || hasBlockers}
            title={
              hasBlockers
                ? "Resolve the items listed below before activating."
                : undefined
            }
            data-testid="activate-button"
            onClick={() => void run("activate", "Integration activated.")}
          >
            {busy === "activate" ? "Activating…" : "Activate"}
          </button>
        ) : (
          <button
            type="button"
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void run("disable", "Integration disabled.")}
          >
            {busy === "disable" ? "Disabling…" : "Disable"}
          </button>
        )}
      </div>

      {hasBlockers && status !== "ACTIVE" ? (
        <div
          className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          data-testid="activation-blockers"
        >
          <p className="font-semibold">Cannot activate integration:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice ? (
        <p className="text-sm font-medium text-emerald-700" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
