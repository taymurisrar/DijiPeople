"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { DataModuleSummary } from "../page";

type ColumnMapping = {
  sourceColumn: string;
  fieldKey: string | null;
  matchedBy: string;
};

type RowIssue = {
  field: string | null;
  value: string | null;
  message: string;
  severity: "ERROR" | "WARNING";
  suggestion?: string;
};

type AnalysisResult = {
  id: string;
  status: string;
  totalRows: number;
  validRows: number;
  failedRows: number;
  fileName: string | null;
  sheetName: string | null;
  mappings: ColumnMapping[];
  unmappedRequiredFields: Array<{ key: string; label: string }>;
  unknownColumns: string[];
  invalidRows: Array<{ rowNumber: number; issues: RowIssue[] }>;
};

/**
 * Checks a file against a module's rules and reports what would happen.
 *
 * This is validation only: nothing is written. Running an import is a separate
 * capability that does not exist yet, so no button here implies one.
 */
export function ImportValidatorPanel({
  modules,
}: {
  readonly modules: readonly DataModuleSummary[];
}) {
  const importable = modules.filter((module) => module.supportsImport);
  const [moduleKey, setModuleKey] = useState(
    importable[0]?.moduleKey ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (importable.length === 0) return null;

  async function analyse(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(
        `/api/data-management/modules/${encodeURIComponent(moduleKey)}/imports/analyse`,
        { method: "POST", body },
      );

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : `Validation failed (${response.status}).`;

        setError(
          response.status === 403
            ? "You do not have permission to validate imports."
            : message,
        );
        return;
      }

      setResult(payload as AnalysisResult);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const allValid =
    result !== null && result.failedRows === 0 && result.totalRows > 0;

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-base font-semibold text-foreground">
          Check a file before importing
        </h3>
        <p className="text-sm text-muted">
          Upload a completed template to see how its columns map and which rows
          would fail. Nothing is saved and no records are created.
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
            {importable.map((module) => (
              <option key={module.moduleKey} value={module.moduleKey}>
                {module.label}
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
          disabled={busy}
          loading={busy}
          loadingText="Checking..."
          onClick={() => inputRef.current?.click()}
          size="sm"
          type="button"
        >
          <Upload className="h-4 w-4" />
          Choose file and check
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            {allValid ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {allValid
                  ? "Every row passed validation."
                  : `${result.failedRows} of ${result.totalRows} rows would fail.`}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <FileUp className="h-3.5 w-3.5" />
                {result.fileName ?? "Uploaded file"}
                {result.sheetName ? ` · sheet "${result.sheetName}"` : null}
                {` · ${result.mappings.filter((m) => m.fieldKey).length} columns mapped`}
              </p>
            </div>
          </div>

          {result.unmappedRequiredFields.length > 0 ? (
            <Callout tone="danger" title="Required columns are missing">
              {result.unmappedRequiredFields
                .map((field) => field.label)
                .join(", ")}
            </Callout>
          ) : null}

          {result.unknownColumns.length > 0 ? (
            <Callout tone="warning" title="Columns that will be ignored">
              {result.unknownColumns.join(", ")}
            </Callout>
          ) : null}

          {result.invalidRows.length > 0 ? (
            <div className="grid gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                Rows to fix
              </h4>
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
                    {result.invalidRows.flatMap((row) =>
                      row.issues.map((issue, index) => (
                        <tr
                          className="border-b border-border/60 align-top"
                          key={`${row.rowNumber}-${issue.field}-${index}`}
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
              <p className="text-xs text-muted">
                {result.failedRows > result.invalidRows.length
                  ? `Showing the first ${result.invalidRows.length} of ${result.failedRows} failing rows. Fix these in your file and check it again.`
                  : "Fix these in your file and check it again."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
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
  const toneClass =
    tone === "danger"
      ? "border-danger/30 bg-danger/10 text-danger"
      : "border-warning/30 bg-warning/10 text-warning";

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 break-words">{children}</p>
    </div>
  );
}
