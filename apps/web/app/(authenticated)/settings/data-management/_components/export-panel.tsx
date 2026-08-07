"use client";

import { useState } from "react";
import { Download, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { DataModuleSummary } from "../page";

type ExportSummary = {
  id: string;
  moduleKey: string;
  status: string;
  fileName: string | null;
  totalRows: number;
  isDownloadable: boolean;
  failureReason: string | null;
};

const SETTLED = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/**
 * Queues an export and follows it to completion.
 *
 * The export runs in the background, so the button returns immediately and the
 * download link appears only once the file actually exists.
 */
export function ExportPanel({
  modules,
}: {
  readonly modules: readonly DataModuleSummary[];
}) {
  const exportable = modules.filter((module) => module.supportsExport);
  const [moduleKey, setModuleKey] = useState(exportable[0]?.moduleKey ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportSummary | null>(null);

  if (exportable.length === 0) return null;

  async function startExport() {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/data-management/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey, filters: {} }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          payload &&
            typeof payload === "object" &&
            "message" in payload &&
            typeof payload.message === "string"
            ? payload.message
            : `Export failed (${response.status}).`,
        );
        setBusy(false);
        return;
      }

      const queued = payload as ExportSummary;
      setResult(queued);
      await pollUntilReady(queued.id);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
      setBusy(false);
    }
  }

  async function pollUntilReady(jobId: string) {
    const deadline = Date.now() + 15 * 60 * 1000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      try {
        const response = await fetch(
          `/api/data-management/exports/${encodeURIComponent(jobId)}/status`,
        );
        if (!response.ok) continue;

        const summary = (await response.json()) as ExportSummary;
        setResult(summary);

        if (SETTLED.has(summary.status)) {
          if (summary.status === "FAILED") {
            setError(summary.failureReason ?? "The export failed.");
          }
          break;
        }
      } catch {
        // A dropped poll is not fatal; the next tick retries.
      }
    }

    setBusy(false);
  }

  const running = result !== null && !SETTLED.has(result.status);

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-base font-semibold text-foreground">Export data</h3>
        <p className="text-sm text-muted">
          Exports run in the background and contain only the records you are
          allowed to see. The download appears when the file is ready.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Module</span>
          <select
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            onChange={(event) => setModuleKey(event.target.value)}
            value={moduleKey}
          >
            {exportable.map((module) => (
              <option key={module.moduleKey} value={module.moduleKey}>
                {module.label}
              </option>
            ))}
          </select>
        </label>

        <Button
          disabled={busy}
          loading={busy}
          loadingText="Preparing..."
          onClick={() => void startExport()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <FileDown className="h-4 w-4" />
          Export
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      ) : null}

      {result && !error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
            ) : null}
            <p className="text-sm text-foreground">
              {running
                ? "Preparing your export..."
                : `${result.fileName ?? "Export"} is ready (${result.totalRows} rows).`}
            </p>
          </div>

          {result.isDownloadable ? (
            <a
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
              href={`/api/data-management/exports/${encodeURIComponent(result.id)}/download`}
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
