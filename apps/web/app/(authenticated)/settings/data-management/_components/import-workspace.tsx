"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  History,
  Loader2,
  Play,
  Upload,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { DataModuleSummary } from "../page";

type RowIssue = {
  field: string | null;
  value: string | null;
  message: string;
  severity: "ERROR" | "WARNING";
  suggestion?: string;
};

type Analysis = {
  id: string;
  status: string;
  importMode: string | null;
  fileName: string | null;
  sheetName: string | null;
  totalRows: number;
  validRows: number;
  failedRows: number;
  mappings: Array<{ sourceColumn: string; fieldKey: string | null }>;
  unmappedRequiredFields: Array<{ key: string; label: string }>;
  unknownColumns: string[];
  invalidRows: Array<{ rowNumber: number; issues: RowIssue[] }>;
};

type ExecutionSummary = {
  id: string;
  status: string;
  progressPercent?: number;
  processedRows?: number;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  failedRowDetails: Array<{ rowNumber: number; issues: RowIssue[] }>;
};

type HistoryEntry = {
  id: string;
  moduleKey: string;
  status: string;
  importMode: string | null;
  fileName: string | null;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  createdAt: string;
  submittedBy: string | null;
};

const MODES = [
  {
    value: "VALIDATE_ONLY",
    label: "Check only",
    hint: "Report what would happen. Nothing is saved.",
  },
  {
    value: "CREATE_ONLY",
    label: "Create new records",
    hint: "Rows matching an existing record are skipped.",
  },
  {
    value: "UPDATE_ONLY",
    label: "Update existing records",
    hint: "Rows with no matching record are skipped.",
  },
  {
    value: "CREATE_OR_UPDATE",
    label: "Create or update",
    hint: "Existing records are updated, new ones are created.",
  },
] as const;

/**
 * Upload, check and run an import.
 *
 * The run control only appears once a file has been checked and every row
 * passed, so a user cannot start an import that is already known to fail.
 */
export function ImportWorkspace({
  canExecute,
  modules,
}: {
  readonly canExecute: boolean;
  readonly modules: readonly DataModuleSummary[];
}) {
  const importable = modules.filter((module) => module.supportsImport);
  const [moduleKey, setModuleKey] = useState(importable[0]?.moduleKey ?? "");
  const [mode, setMode] = useState<string>("VALIDATE_ONLY");
  const [busy, setBusy] = useState<"analyse" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [result, setResult] = useState<ExecutionSummary | null>(null);
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/data-management/imports");
      if (response.ok) setHistory((await response.json()) as HistoryEntry[]);
    } catch {
      // History is supporting detail; a failure here must not break the page.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (importable.length === 0) return null;

  async function analyse(file: File) {
    setBusy("analyse");
    setError(null);
    setAnalysis(null);
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("importMode", mode);

      const response = await fetch(
        `/api/data-management/modules/${encodeURIComponent(moduleKey)}/imports/analyse`,
        { method: "POST", body },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(messageFrom(payload, `Check failed (${response.status}).`));
        return;
      }

      setAnalysis(payload as Analysis);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function execute() {
    if (!analysis) return;

    const jobId = analysis.id;
    setBusy("execute");
    setError(null);

    try {
      const response = await fetch(
        `/api/data-management/imports/${encodeURIComponent(jobId)}/execute`,
        { method: "POST" },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(messageFrom(payload, `Import failed (${response.status}).`));
        setBusy(null);
        return;
      }

      // The job now runs in the background, so follow its progress rather than
      // holding the request open.
      setAnalysis(null);
      setResult(payload as ExecutionSummary);
      await pollUntilSettled(jobId);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
      setBusy(null);
    }
  }

  async function pollUntilSettled(jobId: string) {
    const settled = new Set([
      "COMPLETED",
      "PARTIALLY_COMPLETED",
      "FAILED",
      "CANCELLED",
    ]);
    const deadline = Date.now() + 30 * 60 * 1000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      try {
        const response = await fetch(
          `/api/data-management/imports/${encodeURIComponent(jobId)}/status`,
        );
        if (!response.ok) continue;

        const summary = (await response.json()) as ExecutionSummary;
        setResult(summary);

        if (settled.has(summary.status)) break;
      } catch {
        // A dropped poll is not fatal; the next tick retries.
      }
    }

    setBusy(null);
    await loadHistory();
  }

  const readyToRun =
    canExecute &&
    analysis !== null &&
    analysis.failedRows === 0 &&
    analysis.totalRows > 0 &&
    mode !== "VALIDATE_ONLY";

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-base font-semibold text-foreground">Import data</h3>
        <p className="text-sm text-muted">
          Upload a completed template. Every file is checked first, and only a
          file with no errors can be run.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Module</span>
            <select
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              onChange={(event) => setModuleKey(event.target.value)}
              value={moduleKey}
            >
              {importable.map((module) => (
                <option key={module.moduleKey} value={module.moduleKey}>
                  {module.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">What to do</span>
            <select
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              onChange={(event) => setMode(event.target.value)}
              value={mode}
            >
              {MODES.map((option) => (
                <option
                  disabled={!canExecute && option.value !== "VALIDATE_ONLY"}
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <input
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void analyse(file);
            }}
            ref={inputRef}
            type="file"
          />

          <Button
            disabled={busy !== null}
            loading={busy === "analyse"}
            loadingText="Checking..."
            onClick={() => inputRef.current?.click()}
            size="sm"
            type="button"
          >
            <Upload className="h-4 w-4" />
            Choose file and check
          </Button>
        </div>

        <p className="text-xs text-muted">
          {MODES.find((option) => option.value === mode)?.hint}
          {canExecute ? null : " You can check files but not run imports."}
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      ) : null}

      {analysis ? (
        <AnalysisCard
          analysis={analysis}
          busy={busy === "execute"}
          onRun={readyToRun ? () => void execute() : null}
        />
      ) : null}

      {result ? <ResultCard result={result} /> : null}

      <HistoryTable entries={history} />
    </section>
  );
}

function AnalysisCard({
  analysis,
  busy,
  onRun,
}: {
  readonly analysis: Analysis;
  readonly busy: boolean;
  readonly onRun: (() => void) | null;
}) {
  const clean = analysis.failedRows === 0 && analysis.totalRows > 0;

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {clean ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {clean
                ? `All ${analysis.totalRows} rows are ready to import.`
                : `${analysis.failedRows} of ${analysis.totalRows} rows would fail.`}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <FileUp className="h-3.5 w-3.5" />
              {analysis.fileName ?? "Uploaded file"}
              {` · ${analysis.mappings.filter((m) => m.fieldKey).length} columns mapped`}
            </p>
          </div>
        </div>

        {onRun ? (
          <Button
            loading={busy}
            loadingText="Importing..."
            onClick={onRun}
            size="sm"
            type="button"
          >
            <Play className="h-4 w-4" />
            Run import
          </Button>
        ) : null}
      </div>

      {analysis.unmappedRequiredFields.length > 0 ? (
        <Callout title="Required columns are missing" tone="danger">
          {analysis.unmappedRequiredFields.map((f) => f.label).join(", ")}
        </Callout>
      ) : null}

      {analysis.unknownColumns.length > 0 ? (
        <Callout title="Columns that will be ignored" tone="warning">
          {analysis.unknownColumns.join(", ")}
        </Callout>
      ) : null}

      {analysis.invalidRows.length > 0 ? (
        <IssueTable
          caption="Fix these in your file and check it again."
          jobId={analysis.id}
          rows={analysis.invalidRows}
        />
      ) : null}
    </div>
  );
}

function ResultCard({ result }: { readonly result: ExecutionSummary }) {
  const running = ["QUEUED", "PROCESSING"].includes(result.status);
  const clean = result.failedRows === 0;

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {running ? (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted" />
        ) : clean ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        )}
        <div>
          <p className="text-sm font-semibold text-foreground">
            Import {result.status.toLowerCase().replace(/_/g, " ")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {result.createdRows} created · {result.updatedRows} updated ·{" "}
            {result.skippedRows} skipped · {result.failedRows} failed
          </p>
        </div>
      </div>

      {result.failedRowDetails.length > 0 ? (
        <IssueTable
          caption="These rows were not imported."
          jobId={result.id}
          rows={result.failedRowDetails}
        />
      ) : null}
    </div>
  );
}

function IssueTable({
  caption,
  jobId,
  rows,
}: {
  readonly caption: string;
  readonly jobId: string;
  readonly rows: ReadonlyArray<{ rowNumber: number; issues: RowIssue[] }>;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <a
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-slate-50"
          href={`/api/data-management/imports/${encodeURIComponent(jobId)}/errors`}
        >
          <Download className="h-3.5 w-3.5" />
          Download rows to fix
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Row</th>
              <th className="py-2 pr-3 font-medium">Column</th>
              <th className="py-2 pr-3 font-medium">Value</th>
              <th className="py-2 font-medium">Problem</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row) =>
              row.issues.map((issue, index) => (
                <tr
                  className="border-b border-border/60 align-top"
                  key={`${row.rowNumber}-${issue.field ?? "row"}-${index}`}
                >
                  <td className="py-2 pr-3 tabular-nums text-muted">
                    {row.rowNumber}
                  </td>
                  <td className="py-2 pr-3 font-medium text-foreground">
                    {issue.field ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-muted">
                    {issue.value ? (
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                        {issue.value}
                      </code>
                    ) : (
                      <span className="text-xs italic">empty</span>
                    )}
                  </td>
                  <td className="py-2 text-foreground">
                    {issue.message}
                    {issue.suggestion ? (
                      <span className="block text-xs text-muted">
                        {issue.suggestion}
                      </span>
                    ) : null}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{caption}</p>
    </div>
  );
}

function HistoryTable({
  entries,
}: {
  readonly entries: readonly HistoryEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <div className="grid gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="h-4 w-4" />
        Recent imports
      </h4>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Module</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Result</th>
              <th className="px-4 py-2 font-medium">By</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr className="border-b border-border/60" key={entry.id}>
                <td className="max-w-[16rem] truncate px-4 py-2 text-foreground">
                  {entry.fileName ?? "—"}
                </td>
                <td className="px-4 py-2 text-muted">{entry.moduleKey}</td>
                <td className="px-4 py-2">
                  <StatusPill status={entry.status} />
                </td>
                <td className="px-4 py-2 text-xs text-muted">
                  {entry.createdRows}c · {entry.updatedRows}u ·{" "}
                  {entry.skippedRows}s · {entry.failedRows}f
                </td>
                <td className="px-4 py-2 text-muted">
                  {entry.submittedBy ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { readonly status: string }) {
  const tone = status.includes("FAIL")
    ? "border-danger/30 bg-danger/10 text-danger"
    : status === "COMPLETED"
      ? "border-success/30 bg-success/10 text-success"
      : status === "PARTIALLY_COMPLETED" || status === "CANCELLED"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-border bg-slate-50 text-muted";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

function Callout({
  children,
  title,
  tone,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
  readonly tone: "danger" | "warning";
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm ${
        tone === "danger"
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-warning/30 bg-warning/10 text-warning"
      }`}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 break-words">{children}</p>
    </div>
  );
}

function messageFrom(payload: unknown, fallback: string) {
  return payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
    ? payload.message
    : fallback;
}
