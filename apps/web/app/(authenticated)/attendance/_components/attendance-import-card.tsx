"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { AttendanceImportResult } from "../types";

export function AttendanceImportCard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceImportResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("CSV file is required.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (sourceLabel.trim()) {
      formData.append("sourceLabel", sourceLabel.trim());
    }

    setIsSubmitting(true);
    const response = await fetch("/api/attendance/import", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as AttendanceImportResult & {
      message?: string;
    };

    if (!response.ok) {
      setError(payload.message ?? "Unable to import attendance.");
      setIsSubmitting(false);
      return;
    }

    setResult(payload);
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Import attendance
      </p>
      <h4 className="mt-2 text-2xl font-semibold text-foreground">
        Upload CSV rows from an external system
      </h4>
      <p className="mt-2 text-sm text-muted">
        Use employee code or work email in the CSV. The import respects tenant
        boundaries and reports row-level failures.
      </p>

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <input
          accept=".csv,text/csv"
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />
        <input
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => setSourceLabel(event.target.value)}
          placeholder="Optional source label"
          value={sourceLabel}
        />
        <button
          className="w-fit rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Importing..." : "Import CSV"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-2xl border border-border bg-white/80 p-4 text-sm text-muted">
          <p>
            Imported {result.successCount} rows successfully, with {result.failedCount}{" "}
            failures.
          </p>
          {result.rowErrors.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {result.rowErrors.slice(0, 5).map((rowError) => (
                <li key={`${rowError.row}-${rowError.message}`}>
                  Row {rowError.row}: {rowError.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
