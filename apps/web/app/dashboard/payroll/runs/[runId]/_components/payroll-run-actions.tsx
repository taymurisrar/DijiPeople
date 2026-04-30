"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PayrollRunActions({
  canCalculate,
  canGeneratePayslips,
  canLock,
  canPrepareTimeInputs,
  canCalculateTaxes,
  canGenerateJournal,
  canExportJournal,
  canMarkJournalExported,
  journalStatus,
  runId,
  status,
}: {
  canCalculateTaxes: boolean;
  canCalculate: boolean;
  canExportJournal: boolean;
  canGeneratePayslips: boolean;
  canGenerateJournal: boolean;
  canLock: boolean;
  canMarkJournalExported: boolean;
  canPrepareTimeInputs: boolean;
  journalStatus?: string | null;
  runId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(action: "calculate" | "lock") {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/${action}`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? `Unable to ${action} payroll run.`);
      return;
    }
    router.refresh();
  }

  async function generatePayslips() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payslips/generate/run/${runId}`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to generate payslips.");
      return;
    }
    router.refresh();
  }

  async function prepareTimeInputs() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/prepare-time-inputs`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to prepare time inputs.");
      return;
    }
    router.refresh();
  }

  async function calculateTaxes() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/calculate-taxes`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to calculate taxes.");
      return;
    }
    router.refresh();
  }

  async function generateJournal() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/journal/generate`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to generate payroll journal.");
      return;
    }
    router.refresh();
  }

  async function markJournalExported() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/journal/mark-exported`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to mark journal exported.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {canCalculate && !["APPROVED", "PAID", "LOCKED"].includes(status) ? (
          <button
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            disabled={busy}
            onClick={() => post("calculate")}
            type="button"
          >
            Calculate
          </button>
        ) : null}
        {canPrepareTimeInputs && !["APPROVED", "PAID", "LOCKED"].includes(status) ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={prepareTimeInputs}
            type="button"
          >
            Prepare Time Inputs
          </button>
        ) : null}
        {canCalculateTaxes && ["DRAFT", "CALCULATED"].includes(status) ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={calculateTaxes}
            type="button"
          >
            Calculate Taxes
          </button>
        ) : null}
        {canLock && ["CALCULATED", "REVIEWED"].includes(status) ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={() => post("lock")}
            type="button"
          >
            Lock
          </button>
        ) : null}
        {canGeneratePayslips &&
        ["CALCULATED", "REVIEWED", "APPROVED", "PAID", "LOCKED"].includes(
          status,
        ) ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={generatePayslips}
            type="button"
          >
            Generate Payslips
          </button>
        ) : null}
        {canGenerateJournal &&
        ["CALCULATED", "APPROVED", "PAID"].includes(status) &&
        journalStatus !== "EXPORTED" ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={generateJournal}
            type="button"
          >
            Generate Journal
          </button>
        ) : null}
        {canExportJournal && ["GENERATED", "EXPORTED"].includes(journalStatus ?? "") ? (
          <a
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            href={`/api/payroll/runs/${runId}/journal/export`}
          >
            Export CSV
          </a>
        ) : null}
        {canMarkJournalExported && journalStatus === "GENERATED" ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={markJournalExported}
            type="button"
          >
            Mark Exported
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
