"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ProDataTable } from "@/app/_components/crm/data-table";
import {
  Notice,
  StatusChip,
  errorText,
  formatDateTime,
  formatMoney,
  postJson,
  requestJson,
} from "./billing-client-utils";

export type RenewalInvoice = {
  id: string;
  invoiceNumber: string;
  reference: string | null;
  amount: string;
  currency: string;
  status: string;
  dueDate: string;
  tenant: string | null;
};

/**
 * Renewal invoices of bank-transfer subscriptions that are waiting for money.
 *
 * Renewals have no customer claim: finance finds the credit in the receiving
 * account, matches the payment reference, and records it here with the amount
 * and the bank's own statement reference. The server credits it exactly once
 * and refuses a reference that has already settled anything else.
 */
export function RenewalInvoicesPanel({
  initial,
  onRecorded,
}: {
  initial: RenewalInvoice[];
  onRecorded: (message: string) => void;
}) {
  // Server-rendered first paint; refetched only after a payment is recorded.
  const [rows, setRows] = useState<RenewalInvoice[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<RenewalInvoice | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(
        await requestJson<RenewalInvoice[]>(
          "/api/super-admin/payments/bank-transfers/renewal-invoices",
        ),
      );
      setError(null);
    } catch (e) {
      setError(errorText(e, "Could not load renewal invoices."));
    }
  }, []);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-950">
          Renewal invoices awaiting payment
        </h2>
        <p className="text-sm text-slate-600">
          Bank-transfer subscriptions renew by invoice. Record a transfer you
          have found in the receiving account against the invoice it quotes.
        </p>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ProDataTable
          compact
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "reference",
              header: "Reference",
              minWidth: 150,
              render: (row) => (
                <span className="font-mono text-xs">
                  {row.reference ?? "-"}
                </span>
              ),
            },
            {
              key: "tenant",
              header: "Customer",
              minWidth: 180,
              render: (row) => row.tenant ?? "-",
            },
            {
              key: "invoice",
              header: "Invoice",
              minWidth: 160,
              render: (row) => (
                <span className="font-mono text-xs">{row.invoiceNumber}</span>
              ),
            },
            {
              key: "amount",
              header: "Amount",
              minWidth: 130,
              render: (row) => formatMoney(row.amount, row.currency),
            },
            {
              key: "status",
              header: "Status",
              minWidth: 120,
              render: (row) => <StatusChip value={row.status} />,
            },
            {
              key: "due",
              header: "Due",
              minWidth: 150,
              render: (row) => formatDateTime(row.dueDate),
            },
            {
              key: "record",
              header: "",
              minWidth: 130,
              render: (row) => (
                <button
                  type="button"
                  onClick={() => setRecording(row)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Record payment
                </button>
              ),
            },
          ]}
          emptyTitle="No renewal invoices awaiting payment"
          emptyDescription="Invoices appear here once a bank-transfer subscription approaches its renewal date."
        />
      </div>
      {recording ? (
        <RecordDialog
          invoice={recording}
          onClose={() => setRecording(null)}
          onRecorded={async (text) => {
            setRecording(null);
            await load();
            onRecorded(text);
          }}
        />
      ) : null}
    </section>
  );
}

function RecordDialog({
  invoice,
  onClose,
  onRecorded,
}: {
  invoice: RenewalInvoice;
  onClose: () => void;
  onRecorded: (message: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [statementRef, setStatementRef] = useState("");
  const [received, setReceived] = useState(invoice.amount);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await postJson(
        `/api/super-admin/payments/bank-transfers/invoices/${invoice.id}/record`,
        {
          bankStatementReference: statementRef.trim(),
          receivedAmount: received.trim(),
          currency: invoice.currency,
          note: note.trim() || undefined,
        },
      );
      await onRecorded(
        `Payment recorded for ${invoice.invoiceNumber}. The renewal has been applied.`,
      );
    } catch (e) {
      setError(errorText(e, "The payment could not be recorded."));
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm";
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="record-dialog-title"
      className="m-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50"
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <h2
            id="record-dialog-title"
            className="text-lg font-semibold text-slate-950"
          >
            Record payment for {invoice.invoiceNumber}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {invoice.tenant ?? "Customer"} - invoice{" "}
            {formatMoney(invoice.amount, invoice.currency)} - reference{" "}
            <span className="font-mono">{invoice.reference}</span>
          </p>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <label className="block text-sm font-medium text-slate-700">
          Bank statement reference
          <input
            value={statementRef}
            onChange={(event) => setStatementRef(event.target.value)}
            maxLength={64}
            className={input}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Amount received ({invoice.currency})
          <input
            value={received}
            onChange={(event) => setReceived(event.target.value)}
            inputMode="decimal"
            className={input}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Note (optional)
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            className={input}
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-1"
          />
          I confirm I saw this credit on the receiving bank account statement.
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={
              busy ||
              !confirmed ||
              statementRef.trim().length < 4 ||
              !received.trim()
            }
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Record and apply
          </button>
        </div>
      </div>
    </dialog>
  );
}
