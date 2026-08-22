"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatDate as formatResolvedDate,
  formatMoney as formatResolvedMoney,
  type ResolvedFormattingContext,
} from "@/lib/formatting-context";
import { PayrollPaymentBatchRecord } from "../../../payroll-run-types";
import { useGovernedInput } from "@/app/components/feedback/use-governed-input";

const PAYMENT_FORMATTING_CONTEXT = {
  dateFormat: "dd/MM/yyyy",
  locale: "en-GB",
  timezone: "UTC",
} satisfies ResolvedFormattingContext;

type ImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: Array<{
    rowNumber: number;
    employeeCode?: string | null;
    employeeName?: string | null;
    status?: string | null;
    valid: boolean;
    errors: string[];
  }>;
};

export function PayrollPaymentsWorkspace({
  batches,
  canDisburse,
  canGenerateBankExport,
  runId,
}: {
  batches: PayrollPaymentBatchRecord[];
  canDisburse: boolean;
  canGenerateBankExport: boolean;
  runId: string;
}) {
  const { requestValue, governedInputDialog } = useGovernedInput();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, ImportPreview | null>>({});
  const [selectedFailed, setSelectedFailed] = useState<Record<string, string[]>>({});
  const [retryReason, setRetryReason] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function downloadResponse(response: Response, fallback: string) {
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function request(actionKey: string, url: string, init: RequestInit = {}) {
    setBusy(actionKey);
    setError(null);
    const response = await fetch(url, init);
    setBusy(null);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? "Payroll payment action failed.");
      return null;
    }
    return response;
  }

  async function generate(format: "CSV" | "EXCEL" | "GENERIC_BANK_TRANSFER") {
    const response = await request(
      `generate-${format}`,
      `/api/payroll/operations/runs/${runId}/bank-export?format=${format}`,
      { method: "POST" },
    );
    if (!response) return;
    await downloadResponse(response, `payroll-${format.toLowerCase()}`);
    router.refresh();
  }

  async function submit(batchId: string) {
    const response = await request(
      `submit-${batchId}`,
      `/api/payroll/operations/runs/${runId}/payment-batches/${batchId}/submit`,
      { method: "POST" },
    );
    if (response) router.refresh();
  }

  async function cancel(batchId: string) {
    if (!confirm("Cancel this unsubmitted payment batch?")) return;
    const response = await request(
      `cancel-${batchId}`,
      `/api/payroll/operations/runs/${runId}/payment-batches/${batchId}/cancel`,
      { method: "POST" },
    );
    if (response) router.refresh();
  }

  async function previewImport(batchId: string) {
    const file = fileRefs.current[batchId]?.files?.[0];
    if (!file) {
      setError("Choose a bank result file first.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    const response = await request(
      `preview-${batchId}`,
      `/api/payroll/operations/runs/${runId}/payment-batches/${batchId}/import-results/preview`,
      { method: "POST", body },
    );
    if (!response) return;
    const data = (await response.json()) as ImportPreview;
    setPreview((current) => ({
      ...current,
      [batchId]: data,
    }));
  }

  async function commitImport(batchId: string) {
    const currentPreview = preview[batchId];
    const file = fileRefs.current[batchId]?.files?.[0];
    if (!file || !currentPreview || currentPreview.invalidRows > 0) {
      setError("Import can be committed only after a valid preview.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    const response = await request(
      `commit-${batchId}`,
      `/api/payroll/operations/runs/${runId}/payment-batches/${batchId}/import-results`,
      { method: "POST", body },
    );
    if (!response) return;
    setPreview((current) => ({ ...current, [batchId]: null }));
    router.refresh();
  }

  async function retry(batchId: string) {
    const ids = selectedFailed[batchId] ?? [];
    const reason = retryReason[batchId]?.trim();
    if (!ids.length || !reason) {
      setError("Select failed payment lines and enter a retry reason.");
      return;
    }
    const response = await request(
      `retry-${batchId}`,
      `/api/payroll/operations/runs/${runId}/payment-batches/${batchId}/retry-failed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentLineIds: ids, reason }),
      },
    );
    if (!response) return;
    await downloadResponse(response, "payroll-retry");
    router.refresh();
  }

  async function reconcileLine(
    lineId: string,
    status: "DISBURSED" | "FAILED",
    transactionReference?: string,
    failureReason?: string,
  ) {
    const response = await request(
      `reconcile-${lineId}`,
      `/api/payroll/operations/runs/${runId}/payment-lines/${lineId}/reconcile`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          transactionReference,
          failureReason,
        }),
      },
    );
    if (response) router.refresh();
  }

  async function markBatchDisbursed(batchId: string) {
    const batch = batches.find((item) => item.id === batchId);
    if (!batch) return;
    const lines = batch.paymentLines.filter(
      (line) => !["DISBURSED", "FAILED", "CANCELLED"].includes(line.status),
    );
    if (!lines.length) return;
    if (
      !confirm(
        `Mark ${lines.length} payment line(s) in this batch as disbursed?`,
      )
    ) {
      return;
    }
    setBusy(`disburse-batch-${batchId}`);
    setError(null);
    for (const line of lines) {
      const response = await fetch(
        `/api/payroll/operations/runs/${runId}/payment-lines/${line.id}/reconcile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "DISBURSED",
            transactionReference:
              line.transactionReference ?? `BATCH-${batch.id.slice(0, 8)}`,
          }),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setBusy(null);
        setError(
          data?.message ??
            `Unable to reconcile payment for ${line.employeeName}.`,
        );
        return;
      }
    }
    setBusy(null);
    router.refresh();
  }

  function toggleFailed(batchId: string, lineId: string) {
    setSelectedFailed((current) => {
      const existing = current[batchId] ?? [];
      const next = existing.includes(lineId)
        ? existing.filter((id) => id !== lineId)
        : [...existing, lineId];
      return { ...current, [batchId]: next };
    });
  }

  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Payments</h3>
          <p className="mt-1 text-sm text-muted">
            Stored bank files, bank-result import, failed-payment retry, and reconciliation.
          </p>
        </div>
        {canGenerateBankExport ? (
          <div className="flex flex-wrap gap-2">
            {(["CSV", "EXCEL", "GENERIC_BANK_TRANSFER"] as const).map((format) => (
              <button
                className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground"
                disabled={Boolean(busy)}
                key={format}
                onClick={() => generate(format)}
                type="button"
              >
                {format === "GENERIC_BANK_TRANSFER" ? "Generate Bank File" : `Generate ${format}`}
              </button>
            ))}
            <button
              className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground"
              disabled={Boolean(busy)}
              onClick={() => router.refresh()}
              type="button"
            >
              Refresh
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 grid gap-4">
        {batches.length ? (
          batches.map((batch, batchIndex) => {
            const failedLines = batch.paymentLines.filter((line) => line.status === "FAILED");
            const currentPreview = preview[batch.id];
            const disbursedLines = batch.paymentLines.filter(
              (line) => line.status === "DISBURSED",
            ).length;
            const pendingLines = batch.paymentLines.filter(
              (line) =>
                !["DISBURSED", "FAILED", "CANCELLED"].includes(line.status),
            ).length;
            return (
              <div className="rounded-2xl border border-border bg-white" key={batch.id}>
                <div className="grid gap-3 border-b border-border p-4 md:grid-cols-4">
                  <Summary label="Batch Number" value={`${batchIndex + 1}`} />
                  <Summary label="Employer Bank Account" value={batch.employerBankAccount || "Payroll account"} />
                  <Summary label="Currency" value={batch.currencyCode} />
                  <Summary label="Employee Count" value={`${batch.employees}`} />
                  <Summary label="Total Amount" value={formatMoney(batch.totalAmount, batch.currencyCode)} />
                  <Summary label="Status" value={batch.status} />
                  <Summary
                    label="Reconciled"
                    value={`${disbursedLines} of ${batch.paymentLines.length}`}
                  />
                  <Summary label="Pending" value={`${pendingLines}`} />
                  <Summary label="Generated At" value={formatDate(batch.generatedAt)} />
                  <Summary label="Submitted At" value={batch.submittedAt ? formatDate(batch.submittedAt) : "-"} />
                  <Summary label="Disbursed At" value={batch.disbursedAt ? formatDate(batch.disbursedAt) : "-"} />
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted">Payment File</p>
                    {batch.documentId ? (
                      <a className="mt-1 inline-block font-medium text-accent" href={`/api/documents/${batch.documentId}/download`}>
                        Download File
                      </a>
                    ) : (
                      <p className="mt-1 text-muted">Not stored</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                  {canDisburse && batch.status === "GENERATED" ? (
                    <>
                      <button className="rounded-xl border border-border px-3 py-2 text-sm font-semibold" disabled={Boolean(busy)} onClick={() => submit(batch.id)} type="button">
                        Mark Submitted
                      </button>
                      <button className="rounded-xl border border-danger/40 px-3 py-2 text-sm font-semibold text-danger" disabled={Boolean(busy)} onClick={() => cancel(batch.id)} type="button">
                        Cancel
                      </button>
                    </>
                  ) : null}
                  {canDisburse && pendingLines > 0 ? (
                    <button
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
                      disabled={Boolean(busy)}
                      onClick={() => markBatchDisbursed(batch.id)}
                      type="button"
                    >
                      Mark All Disbursed
                    </button>
                  ) : null}
                  <a className="rounded-xl border border-border px-3 py-2 text-sm font-semibold" href={`/api/payroll/operations/runs/${runId}/payment-batches/${batch.id}/result-template`}>
                    Download Import Template
                  </a>
                  <input
                    accept=".csv,.xlsx,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="rounded-xl border border-border px-3 py-2 text-sm"
                    ref={(node) => {
                      fileRefs.current[batch.id] = node;
                    }}
                    type="file"
                  />
                  <button className="rounded-xl border border-border px-3 py-2 text-sm font-semibold" disabled={Boolean(busy)} onClick={() => previewImport(batch.id)} type="button">
                    Preview Import
                  </button>
                  <button className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white" disabled={Boolean(busy) || !currentPreview || currentPreview.invalidRows > 0} onClick={() => commitImport(batch.id)} type="button">
                    Commit Import
                  </button>
                </div>
                {currentPreview ? (
                  <div className="border-b border-border p-4 text-sm">
                    <p className="font-semibold text-foreground">
                      Import preview: {currentPreview.validRows} valid / {currentPreview.invalidRows} invalid / {currentPreview.totalRows} total
                    </p>
                    {currentPreview.rows.some((row) => !row.valid) ? (
                      <div className="mt-2 grid gap-1 text-danger">
                        {currentPreview.rows
                          .filter((row) => !row.valid)
                          .slice(0, 8)
                          .map((row) => (
                            <p key={row.rowNumber}>
                              Row {row.rowNumber}: {row.errors.join(", ")}
                            </p>
                          ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {failedLines.length && canDisburse ? (
                  <div className="border-b border-border p-4">
                    <p className="font-semibold text-foreground">Retry Failed Payments</p>
                    <div className="mt-3 grid gap-2 text-sm">
                      {failedLines.map((line) => (
                        <label className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3" key={line.id}>
                          <input
                            checked={(selectedFailed[batch.id] ?? []).includes(line.id)}
                            onChange={() => toggleFailed(batch.id, line.id)}
                            type="checkbox"
                          />
                          <span className="font-medium">{line.employeeName}</span>
                          <span>{formatMoney(line.amount, line.currencyCode)}</span>
                          <span className="text-muted">{line.failureReason ?? "No reason provided"}</span>
                          <span className="text-muted">Original: {batch.fileName}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        className="min-w-[280px] rounded-xl border border-border px-3 py-2 text-sm"
                        onChange={(event) =>
                          setRetryReason((current) => ({ ...current, [batch.id]: event.target.value }))
                        }
                        placeholder="Retry reason"
                        value={retryReason[batch.id] ?? ""}
                      />
                      <button className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white" disabled={Boolean(busy)} onClick={() => retry(batch.id)} type="button">
                        Retry Selected
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-surface-strong text-left text-muted">
                      <tr>
                        <th className="px-4 py-3 font-medium">Employee Code</th>
                        <th className="px-4 py-3 font-medium">Employee</th>
                        <th className="px-4 py-3 font-medium">Bank</th>
                        <th className="px-4 py-3 font-medium">Masked Account Number</th>
                        <th className="px-4 py-3 font-medium">Masked IBAN</th>
                        <th className="px-4 py-3 text-right font-medium">Amount</th>
                        <th className="px-4 py-3 font-medium">Currency</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Transaction Reference</th>
                        <th className="px-4 py-3 font-medium">Failure Reason</th>
                        <th className="px-4 py-3 font-medium">Disbursed At</th>
                        <th className="px-4 py-3 font-medium">Reconciled At</th>
                        <th className="px-4 py-3 font-medium">Retry Batch</th>
                        {canDisburse ? (
                          <th className="px-4 py-3 font-medium">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {batch.paymentLines.map((line) => (
                        <tr key={line.id}>
                          <td className="px-4 py-3">{line.employeeCode}</td>
                          <td className="px-4 py-3">{line.employeeName}</td>
                          <td className="px-4 py-3 text-muted">{line.bankName ?? ""}</td>
                          <td className="px-4 py-3 text-muted">{line.maskedAccountNumber ?? line.maskedAccount}</td>
                          <td className="px-4 py-3 text-muted">{line.maskedIban ?? ""}</td>
                          <td className="px-4 py-3 text-right">{formatMoney(line.amount, line.currencyCode)}</td>
                          <td className="px-4 py-3">{line.currencyCode}</td>
                          <td className="px-4 py-3">{line.status}</td>
                          <td className="px-4 py-3 text-muted">{line.transactionReference ?? ""}</td>
                          <td className="px-4 py-3 text-muted">{line.failureReason ?? ""}</td>
                          <td className="px-4 py-3 text-muted">{line.disbursedAt ? formatDate(line.disbursedAt) : ""}</td>
                          <td className="px-4 py-3 text-muted">{line.reconciledAt ? formatDate(line.reconciledAt) : ""}</td>
                          <td className="px-4 py-3 text-muted">{line.retryOfPaymentLineId ? "Retry" : ""}</td>
                          {canDisburse ? (
                            <td className="px-4 py-3">
                              {!["DISBURSED", "CANCELLED"].includes(line.status) ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="rounded-xl border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                      reconcileLine(
                                        line.id,
                                        "DISBURSED",
                                        line.transactionReference ??
                                          `MANUAL-${line.employeeCode}`,
                                      )
                                    }
                                    type="button"
                                  >
                                    Disbursed
                                  </button>
                                  <button
                                    className="rounded-xl border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger"
                                    disabled={Boolean(busy)}
                                    onClick={() => {
                                      // A failure reason is read when someone
                                      // asks why an employee was not paid.
                                      // ITEM-0031.
                                      void (async () => {
                                        const reason = await requestValue({
                                          title: "Mark payment failed",
                                          description: `Payment to ${line.employeeCode} will be recorded as failed.`,
                                          label: "Failure reason",
                                          hint: "What the bank or provider reported.",
                                          confirmLabel: "Mark failed",
                                        });
                                        if (reason === null) return;
                                        reconcileLine(
                                          line.id,
                                          "FAILED",
                                          line.transactionReference ?? undefined,
                                          reason,
                                        );
                                      })();
                                    }}
                                    type="button"
                                  >
                                    Failed
                                  </button>
                                </div>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted">No payment batches generated yet.</p>
        )}
      </div>
    </article>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function formatDate(value: string | Date | null | undefined) {
  return formatResolvedDate(value, PAYMENT_FORMATTING_CONTEXT);
}

function formatMoney(amount: number | string | null | undefined, currencyCode?: string | null) {
  return formatResolvedMoney(amount, currencyCode, PAYMENT_FORMATTING_CONTEXT);
}
