"use client";

import { DragEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PermissionGate } from "../../_components/permission-gate";

type TemplateScope = "mine" | "team" | "tenant";

type ImportPreviewRow = {
  rowNumber: number;
  employeeCode: string;
  employeeName: string;
  workEmail: string;
  date: string;
  entryType: string;
  hoursWorked: string;
  severity: "valid" | "warning" | "error";
  errors: string[];
  warnings: string[];
};

type ImportPreviewResponse = {
  batch: {
    id: string;
    fileName: string;
    status: string;
    successCount: number;
    errorCount: number;
  };
  summary: {
    totalRows: number;
    validRows: number;
    warningRows: number;
    errorRows: number;
    affectedEmployees: number;
  };
  rows: ImportPreviewRow[];
};

type TimesheetTemplateImportButtonProps = {
  businessUnits: Array<{ id: string; label: string }>;
  canReadAll: boolean;
  canReadTeam: boolean;
  month: number;
  year: number;
};

export function TimesheetTemplateImportButton({
  businessUnits,
  canReadAll,
  canReadTeam,
  month,
  year,
}: TimesheetTemplateImportButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(String(month));
  const [selectedYear, setSelectedYear] = useState(String(year));
  const [scope, setScope] = useState<TemplateScope>(
    canReadAll ? "tenant" : canReadTeam ? "team" : "mine",
  );
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBlockingErrors = (preview?.summary.errorRows ?? 0) > 0;

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    setShowConfirm(false);
  }

  async function previewImport() {
    if (!file) {
      setError("Choose an Excel template file first.");
      return;
    }

    setIsPreviewing(true);
    setError(null);
    setPreview(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("month", selectedMonth);
    formData.set("year", selectedYear);
    formData.set("scope", scope);
    if (businessUnitId) {
      formData.set("businessUnitId", businessUnitId);
    }

    try {
      const response = await fetch("/api/timesheets/template/import/preview", {
        body: formData,
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to preview import.");
      }

      setPreview(data as ImportPreviewResponse);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Unable to preview import.",
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  async function commitImport() {
    if (!preview || hasBlockingErrors) {
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      const response = await fetch("/api/timesheets/template/import/commit", {
        body: JSON.stringify({ batchId: preview.batch.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to confirm import.");
      }

      setIsOpen(false);
      reset();
      router.refresh();
    } catch (commitError) {
      setError(
        commitError instanceof Error
          ? commitError.message
          : "Unable to confirm import.",
      );
    } finally {
      setIsCommitting(false);
      setShowConfirm(false);
    }
  }

  return (
    <PermissionGate permission="timesheets.import">
      <button
        className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Import
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[24px] bg-surface p-6 shadow-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted">
                  Timesheet Import
                </p>
                <h4 className="mt-2 text-2xl font-semibold text-foreground">
                  Preview and confirm Excel timesheets
                </h4>
              </div>
              <button
                className="rounded-xl border border-border px-3 py-2 text-sm text-muted"
                onClick={() => {
                  setIsOpen(false);
                  reset();
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <Field label="Month">
                <select
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  value={selectedMonth}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {monthLabel(value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Year">
                <input
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  max={2100}
                  min={2000}
                  onChange={(event) => setSelectedYear(event.target.value)}
                  type="number"
                  value={selectedYear}
                />
              </Field>
              <Field label="Scope">
                <select
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  onChange={(event) => setScope(event.target.value as TemplateScope)}
                  value={scope}
                >
                  <option value="mine">My timesheet</option>
                  {canReadTeam ? <option value="team">My team</option> : null}
                  {canReadAll ? <option value="tenant">All employees</option> : null}
                </select>
              </Field>
              <Field label="Business unit">
                <select
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  onChange={(event) => setBusinessUnitId(event.target.value)}
                  value={businessUnitId}
                >
                  <option value="">All business units</option>
                  {businessUnits.map((businessUnit) => (
                    <option key={businessUnit.id} value={businessUnit.id}>
                      {businessUnit.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-5">
              <FileUploadDropzone file={file} onFileSelected={setFile} />
              <p className="mt-2 text-xs text-muted">
                Import validates employees, period dates, entry types, hours, holidays,
                weekends, and business-unit scope before saving.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                disabled={isPreviewing || !file}
                onClick={previewImport}
                type="button"
              >
                {isPreviewing ? "Previewing..." : "Upload and Preview"}
              </button>
              {preview ? (
                <button
                  className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
                  disabled={hasBlockingErrors || isCommitting}
                  onClick={() => setShowConfirm(true)}
                  type="button"
                >
                  Confirm Import
                </button>
              ) : null}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
            </div>

            {preview ? <ImportPreviewTable preview={preview} /> : null}
          </div>
        </div>
      ) : null}

      {showConfirm && preview ? (
        <ConfirmDialog
          disabled={isCommitting}
          message={`Import ${preview.summary.validRows + preview.summary.warningRows} row(s) across ${preview.summary.affectedEmployees} employee(s)?`}
          onCancel={() => setShowConfirm(false)}
          onConfirm={commitImport}
          title="Confirm timesheet import"
        />
      ) : null}
    </PermissionGate>
  );
}

function FileUploadDropzone({
  file,
  onFileSelected,
}: {
  file: File | null;
  onFileSelected: (file: File) => void;
}) {
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files.item(0);
    if (droppedFile) {
      onFileSelected(droppedFile);
    }
  }

  return (
    <label
      className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white/80 px-5 py-8 text-center transition hover:border-accent/50"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(event) => {
          const selectedFile = event.target.files?.item(0);
          if (selectedFile) {
            onFileSelected(selectedFile);
          }
        }}
        type="file"
      />
      <span className="font-medium text-foreground">
        {file ? file.name : "Drop Excel template here or choose a file"}
      </span>
      <span className="mt-1 text-sm text-muted">.xlsx files exported from Timesheets</span>
    </label>
  );
}

function ImportPreviewTable({ preview }: { preview: ImportPreviewResponse }) {
  const visibleRows = useMemo(() => preview.rows.slice(0, 100), [preview.rows]);

  return (
    <div className="mt-6 grid gap-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <Metric label="Total" value={preview.summary.totalRows} />
        <Metric label="Valid" value={preview.summary.validRows} />
        <Metric label="Warnings" value={preview.summary.warningRows} />
        <Metric label="Errors" value={preview.summary.errorRows} />
        <Metric label="Employees" value={preview.summary.affectedEmployees} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-white/80 text-left text-xs uppercase tracking-[0.14em] text-muted">
            <tr>
              <th className="px-4 py-3">Row</th>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Validation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white/50">
            {visibleRows.map((row) => (
              <tr key={row.rowNumber}>
                <td className="px-4 py-3">{row.rowNumber}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{row.employeeCode}</p>
                  <p className="text-xs text-muted">{row.employeeName || row.workEmail}</p>
                </td>
                <td className="px-4 py-3">{row.date}</td>
                <td className="px-4 py-3">{row.entryType}</td>
                <td className="px-4 py-3">{row.hoursWorked}</td>
                <td className="px-4 py-3">
                  <ValidationErrorList row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.rows.length > visibleRows.length ? (
        <p className="text-sm text-muted">
          Showing first {visibleRows.length} rows. All rows are validated before import.
        </p>
      ) : null}
    </div>
  );
}

function ValidationErrorList({ row }: { row: ImportPreviewRow }) {
  if (row.severity === "valid") {
    return <span className="text-emerald-700">Valid</span>;
  }

  return (
    <div className="grid gap-1">
      {row.errors.map((error) => (
        <p key={error} className="text-danger">
          {error}
        </p>
      ))}
      {row.warnings.map((warning) => (
        <p key={warning} className="text-amber-700">
          {warning}
        </p>
      ))}
    </div>
  );
}

function ConfirmDialog({
  disabled,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  disabled: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <h4 className="text-xl font-semibold text-foreground">{title}</h4>
        <p className="mt-3 text-sm text-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
            disabled={disabled}
            onClick={onConfirm}
            type="button"
          >
            {disabled ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-white/80 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function monthLabel(month: number) {
  return new Date(2026, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}
