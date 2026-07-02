"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";

export function PayrollRunActions({
  canCalculate,
  canGeneratePayslips,
  canLock,
  canPrepareTimeInputs,
  canCalculateTaxes,
  canGenerateJournal,
  canExportJournal,
  canMarkJournalExported,
  canFinalize,
  canGenerateBankExport,
  canDisburse,
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
  canFinalize: boolean;
  canGenerateBankExport: boolean;
  canDisburse: boolean;
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

  async function operation(action: "finalize" | "disburse") {
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/payroll/operations/runs/${runId}/${action}`,
      { method: "POST" },
    );
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? `Unable to ${action} payroll run.`);
      return;
    }
    const data = (await response.json().catch(() => null)) as {
      approvalRequestId?: string;
    } | null;
    if (data?.approvalRequestId)
      router.push(`/approvals/${data.approvalRequestId}`);
    else router.refresh();
  }

  async function generateBankExport(
    format: "CSV" | "EXCEL" | "GENERIC_BANK_TRANSFER",
  ) {
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/payroll/operations/runs/${runId}/bank-export?format=${format}`,
      { method: "POST" },
    );
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to generate the bank export.");
      return;
    }
    const blob = await response.blob();
    const contentDisposition =
      response.headers.get("content-disposition") ?? "";
    const fileName =
      contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] ??
      `payroll-export-${format.toLowerCase()}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
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
    const response = await fetch(
      `/api/payroll/runs/${runId}/prepare-time-inputs`,
      {
        method: "POST",
      },
    );
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
    const response = await fetch(
      `/api/payroll/runs/${runId}/journal/generate`,
      {
        method: "POST",
      },
    );
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
    const response = await fetch(
      `/api/payroll/runs/${runId}/journal/mark-exported`,
      {
        method: "POST",
      },
    );
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
        <Button href={`/payroll/runs/${runId}/preview`} variant="secondary">
          Preview
        </Button>
        <Button href={`/payroll/exceptions?runId=${runId}`} variant="secondary">
          Exceptions
        </Button>
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
        {canPrepareTimeInputs &&
        !["APPROVED", "PAID", "LOCKED"].includes(status) ? (
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
        {canFinalize && ["CALCULATED", "REVIEWED"].includes(status) ? (
          <Button
            disabled={busy}
            onClick={() => operation("finalize")}
            variant="success"
          >
            Finalize
          </Button>
        ) : null}
        {canLock && status === "APPROVED" ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={() => post("lock")}
            type="button"
          >
            Lock
          </button>
        ) : null}
        {canGenerateBankExport && ["APPROVED", "LOCKED"].includes(status) ? (
          <div className="flex gap-2">
            {(["CSV", "EXCEL", "GENERIC_BANK_TRANSFER"] as const).map(
              (format) => (
                <Button
                  disabled={busy}
                  key={format}
                  onClick={() => generateBankExport(format)}
                  size="sm"
                  variant="secondary"
                >
                  {format === "GENERIC_BANK_TRANSFER"
                    ? "Bank Transfer"
                    : format}
                </Button>
              ),
            )}
          </div>
        ) : null}
        {canDisburse && status === "LOCKED" ? (
          <Button
            disabled={busy}
            onClick={() => operation("disburse")}
            variant="primary"
          >
            Mark Disbursed
          </Button>
        ) : null}
        {canGeneratePayslips &&
        ["APPROVED", "PAID", "LOCKED"].includes(status) ? (
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
        {canExportJournal &&
        ["GENERATED", "EXPORTED"].includes(journalStatus ?? "") ? (
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
