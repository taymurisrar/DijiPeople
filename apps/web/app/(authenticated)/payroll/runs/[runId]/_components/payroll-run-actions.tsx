"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { useGovernedInput } from "@/app/components/feedback/use-governed-input";

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
  paymentSummary,
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
  paymentSummary?: {
    totalLines: number;
    disbursedLines: number;
    failedLines: number;
    pendingLines: number;
    hasBankExport: boolean;
  };
  runId: string;
  status: string;
}) {
  const { requestValue, governedInputDialog } = useGovernedInput();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasPaymentBlocker =
    status === "APPROVED" &&
    canDisburse &&
    (!paymentSummary?.hasBankExport ||
      (paymentSummary.totalLines > 0 &&
        paymentSummary.disbursedLines < paymentSummary.totalLines));
  const paymentBlockerMessage = !paymentSummary?.hasBankExport
    ? "Generate a bank transfer before marking this run paid."
    : paymentSummary.failedLines > 0
      ? `${paymentSummary.failedLines} payment line(s) failed. Retry or reconcile them on the Payments tab.`
      : `${paymentSummary?.disbursedLines ?? 0} of ${paymentSummary?.totalLines ?? 0} payment line(s) are disbursed. Finish reconciliation on the Payments tab.`;

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

  async function operation(
    action: "finalize" | "disburse" | "review" | "return-to-calculation",
  ) {
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

  async function validateJournal() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/journal/validate`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to validate payroll journal.");
      return;
    }
    router.refresh();
  }

  async function markJournalPosted() {
    if (!confirm("Mark this exported journal as posted?")) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/journal/mark-posted`, {
      method: "POST",
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to mark journal posted.");
      return;
    }
    router.refresh();
  }

  async function reverseJournal() {
    /*
     * A reversal reason is financial and is read during audit; a reversal date
     * decides which period the entry lands in. Both were collected with
     * `window.prompt` — unvalidated, and the date as free text with a
     * pre-filled default, so "next Tuesday" reached the API and
     * `2026-02-31` would have rolled silently into March. ITEM-0031.
     */
    const reason = await requestValue({
      title: "Reverse journal",
      description:
        "This reverses a posted payroll journal. The reason is recorded on the audit trail.",
      label: "Reversal reason",
      hint: "Why this journal is being reversed.",
      confirmLabel: "Continue",
    });
    if (reason === null) return;

    const reversalDate = await requestValue({
      title: "Reversal date",
      description: "The date the reversing entry is posted.",
      label: "Reversal date",
      confirmLabel: "Reverse journal",
      kind: "date",
      initialValue: new Date().toISOString().slice(0, 10),
    });
    if (reversalDate === null) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/payroll/runs/${runId}/journal/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, reversalDate }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to reverse payroll journal.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {governedInputDialog}
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
        {canFinalize && status === "CALCULATED" ? (
          <Button
            disabled={busy}
            onClick={() => operation("review")}
            variant="secondary"
          >
            Review
          </Button>
        ) : null}
        {canCalculate && status === "REVIEWED" ? (
          <Button
            disabled={busy}
            onClick={() => operation("return-to-calculation")}
            variant="secondary"
          >
            Return to Calculation
          </Button>
        ) : null}
        {canLock && ["APPROVED", "PAID"].includes(status) ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={() => post("lock")}
            type="button"
          >
            Lock
          </button>
        ) : null}
        {canGenerateBankExport && ["APPROVED", "PAID"].includes(status) ? (
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
        {canDisburse && status === "APPROVED" ? (
          <Button
            disabled={busy || hasPaymentBlocker}
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
        {canExportJournal &&
        ["GENERATED", "EXPORTED", "POSTED"].includes(journalStatus ?? "") ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={validateJournal}
            type="button"
          >
            Validate Journal
          </button>
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
        {canMarkJournalExported && journalStatus === "EXPORTED" ? (
          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            disabled={busy}
            onClick={markJournalPosted}
            type="button"
          >
            Mark Posted
          </button>
        ) : null}
        {canMarkJournalExported && journalStatus === "POSTED" ? (
          <button
            className="rounded-2xl border border-danger/40 px-4 py-2 text-sm font-semibold text-danger"
            disabled={busy}
            onClick={reverseJournal}
            type="button"
          >
            Reverse Journal
          </button>
        ) : null}
      </div>
      {hasPaymentBlocker ? (
        <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">Payment reconciliation is not complete.</p>
          <p>{paymentBlockerMessage}</p>
          <Button href={`/payroll/runs/${runId}?tab=payments`} size="sm" variant="warning-soft">
            Open Payments
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
