"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";
import { AdminKeyValueGrid } from "@/app/_components/admin-ui";
import { ProDataTable } from "@/app/_components/crm/data-table";
import {
  RenewalInvoicesPanel,
  type RenewalInvoice,
} from "./renewal-invoices-panel";
import {
  Notice,
  StatusChip,
  errorText,
  formatDateTime,
  formatMoney,
  postJson,
  requestJson,
} from "./billing-client-utils";

type ClaimRow = {
  id: string;
  status: string;
  submittedAt: string;
  claimedAmount: string;
  currency: string;
  orderId: string;
  orderNumber: string;
  reference: string | null;
  expectedAmount: string;
  orderStatus: string;
  orderExpiresAt: string | null;
  company: string | null;
  evidenceCount: number;
};

type ListResponse = {
  items: ClaimRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

type Summary = {
  awaitingVerification: number;
  awaitingCustomer: number;
  oldestPendingAgeHours: number;
  approvedToday: number;
  rejectedToday: number;
  settledToday: Record<string, string>;
};

type ClaimDetail = {
  id: string;
  status: string;
  claimedAmount: string;
  currency: string;
  transferredAt: string | null;
  customerReference: string | null;
  customerNote: string | null;
  clarificationRequest: string | null;
  decisionReason: string | null;
  verifiedAmount: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  evidence: Array<{
    id: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: string;
  }>;
  receivingAccount: {
    bankName: string;
    maskedAccountTitle: string;
    maskedIban: string | null;
    maskedAccountNumber: string | null;
    maskedRaastId: string | null;
  };
  order: {
    id: string;
    orderNumber: string;
    status: string;
    bankReference: string | null;
    totalAmount: string;
    currency: string;
    requestedSeats: number;
    billingCycle: string;
    expiresAt: string | null;
    customer: { companyName: string; contactEmail: string | null } | null;
    plan: { name: string } | null;
  };
  duplicates: Array<{
    id: string;
    status: string;
    subscriptionOrderId: string;
  }>;
  history: Array<{ action: string; createdAt: string }>;
};

const STATUSES = [
  "PENDING_VERIFICATION",
  "CLARIFICATION_REQUESTED",
  "APPROVED",
  "REJECTED",
  "DUPLICATE",
  "EXPIRED",
  "CANCELLED",
] as const;

const DECIDABLE = new Set(["PENDING_VERIFICATION", "CLARIFICATION_REQUESTED"]);

type Decision = "approve" | "clarify" | "reject" | "duplicate";

/**
 * The bank-transfer verification queue.
 *
 * Everything on this screen is a *claim* made by a customer. Nothing here moves
 * an order until an operator records the amount and statement reference they
 * saw in the bank account themselves; the server re-checks the amount to the
 * minor unit and refuses a reference that has already settled something.
 */
export function BankTransfersClient({
  initialList,
  initialSummary,
  initialRenewalInvoices,
}: {
  initialList: ListResponse;
  initialSummary: Summary;
  initialRenewalInvoices: RenewalInvoice[];
}) {
  const [list, setList] = useState(initialList);
  const [summary, setSummary] = useState(initialSummary);
  const [status, setStatus] = useState<string>("PENDING_VERIFICATION");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    tone: "error" | "info";
    text: string;
  } | null>(null);
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);
  const firstRun = useRef(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
      });
      if (status) params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const [nextList, nextSummary] = await Promise.all([
        requestJson<ListResponse>(
          `/api/super-admin/payments/bank-transfers?${params.toString()}`,
        ),
        requestJson<Summary>(
          "/api/super-admin/payments/bank-transfers/summary",
        ),
      ]);
      setList(nextList);
      setSummary(nextSummary);
    } catch (error) {
      setMessage({
        tone: "error",
        text: errorText(error, "Could not load the queue."),
      });
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  // The server rendered the first page; refetch only when a filter changes.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = window.setTimeout(() => void reload(), 250);
    return () => window.clearTimeout(timer);
  }, [reload]);

  return (
    <div className="space-y-5">
      <section
        aria-label="Verification summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Tile
          label="Awaiting verification"
          value={String(summary.awaitingVerification)}
        />
        <Tile
          label="Awaiting customer"
          value={String(summary.awaitingCustomer)}
        />
        <Tile
          label="Oldest pending"
          value={
            summary.awaitingVerification === 0
              ? "-"
              : `${summary.oldestPendingAgeHours} h`
          }
        />
        <Tile
          label="Settled today"
          value={
            Object.keys(summary.settledToday).length === 0
              ? "-"
              : Object.entries(summary.settledToday)
                  .map(([currency, amount]) => formatMoney(amount, currency))
                  .join(" + ")
          }
          hint={`${summary.approvedToday} approved, ${summary.rejectedToday} rejected`}
        />
      </section>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[220px] flex-1 text-sm font-medium text-slate-700">
            Search order, reference or company
            <span className="relative mt-1 block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm"
                placeholder="DP-ABCD-EFGH, ORD-..., company"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ProDataTable
          compact
          stickyHeader
          loading={loading && list.items.length === 0}
          rows={list.items}
          rowKey={(row) => row.id}
          onRowClick={(row) => setOpenClaimId(row.id)}
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
              key: "company",
              header: "Customer",
              minWidth: 180,
              render: (row) => row.company ?? "-",
            },
            {
              key: "order",
              header: "Order",
              minWidth: 150,
              render: (row) => (
                <span className="font-mono text-xs">{row.orderNumber}</span>
              ),
            },
            {
              key: "expected",
              header: "Invoice amount",
              minWidth: 140,
              render: (row) => formatMoney(row.expectedAmount, row.currency),
            },
            {
              key: "claimed",
              header: "Claimed",
              minWidth: 140,
              render: (row) => (
                <span
                  className={
                    row.claimedAmount !== row.expectedAmount
                      ? "font-semibold text-amber-700"
                      : undefined
                  }
                >
                  {formatMoney(row.claimedAmount, row.currency)}
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              minWidth: 190,
              render: (row) => <StatusChip value={row.status} />,
            },
            {
              key: "evidence",
              header: "Files",
              minWidth: 70,
              render: (row) => row.evidenceCount,
            },
            {
              key: "submitted",
              header: "Submitted",
              minWidth: 160,
              render: (row) => formatDateTime(row.submittedAt),
            },
            {
              key: "review",
              header: "",
              minWidth: 100,
              render: (row) => (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenClaimId(row.id);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {DECIDABLE.has(row.status) ? "Review" : "View"}
                </button>
              ),
            },
          ]}
          emptyTitle="No bank transfers"
          emptyDescription="Customer payment reports for bank-transfer invoices appear here for verification."
          footer={
            list.meta.totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600">
                <span>
                  Page {list.meta.page} of {list.meta.totalPages} (
                  {list.meta.total} claims)
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= list.meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50"
                  >
                    Next
                  </button>
                </span>
              </div>
            ) : undefined
          }
        />
      </section>

      <RenewalInvoicesPanel
        initial={initialRenewalInvoices}
        onRecorded={(text) => {
          setMessage({ tone: "info", text });
          void reload();
        }}
      />

      {openClaimId ? (
        <ClaimDialog
          claimId={openClaimId}
          onClose={() => setOpenClaimId(null)}
          onDecided={(text) => {
            setMessage({ tone: "info", text });
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-2xl font-semibold text-slate-950">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ClaimDialog({
  claimId,
  onClose,
  onDecided,
}: {
  claimId: string;
  onClose: () => void;
  onDecided: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>("approve");
  const [busy, setBusy] = useState(false);
  const [statementRef, setStatementRef] = useState("");
  const [received, setReceived] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await requestJson<ClaimDetail>(
        `/api/super-admin/payments/bank-transfers/${claimId}`,
      );
      setClaim(detail);
      setReceived((current) => current || detail.order.totalAmount);
    } catch (e) {
      setError(errorText(e, "Could not load this claim."));
    }
  }, [claimId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A native <dialog> gives a focus trap, Escape and an inert background.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit() {
    if (!claim || busy) return;
    setBusy(true);
    setError(null);
    try {
      const base = `/api/super-admin/payments/bank-transfers/${claim.id}`;
      if (decision === "approve") {
        await postJson(`${base}/approve`, {
          bankStatementReference: statementRef.trim(),
          receivedAmount: received.trim(),
          currency: claim.order.currency,
          note: note.trim() || undefined,
        });
        onDecided(
          `Payment for ${claim.order.orderNumber} approved. The order is confirmed and provisioning has started.`,
        );
      } else {
        const path =
          decision === "reject"
            ? "reject"
            : decision === "clarify"
              ? "request-clarification"
              : "mark-duplicate";
        await postJson(`${base}/${path}`, { reason: reason.trim() });
        onDecided(
          decision === "reject"
            ? `Claim for ${claim.order.orderNumber} rejected.`
            : decision === "clarify"
              ? `Clarification requested for ${claim.order.orderNumber}.`
              : `Claim for ${claim.order.orderNumber} marked as a duplicate.`,
        );
      }
      onClose();
    } catch (e) {
      setError(errorText(e, "The decision could not be recorded."));
      await load();
    } finally {
      setBusy(false);
    }
  }

  const decidable = claim ? DECIDABLE.has(claim.status) : false;
  const amountDiffers =
    claim && claim.claimedAmount !== claim.order.totalAmount;
  const orderNotPayable = claim && claim.order.status !== "PENDING_PAYMENT";
  const canSubmit =
    decision === "approve"
      ? statementRef.trim().length >= 4 &&
        received.trim().length > 0 &&
        confirmed
      : reason.trim().length >= 3;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="claim-dialog-title"
      className="m-auto w-[min(56rem,calc(100vw-1.5rem))] max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50"
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="claim-dialog-title"
              className="text-lg font-semibold text-slate-950"
            >
              {claim ? `Verify ${claim.order.orderNumber}` : "Loading claim"}
            </h2>
            {claim ? (
              <p className="mt-1 text-sm text-slate-600">
                {claim.order.customer?.companyName ?? "Unknown customer"}
                {claim.order.plan ? ` - ${claim.order.plan.name}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {claim ? <StatusChip value={claim.status} /> : null}
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
            >
              Close
            </button>
          </div>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {!claim && !error ? (
          <p className="text-sm text-slate-500" aria-busy="true">
            Loading...
          </p>
        ) : null}

        {claim ? (
          <>
            <div className="space-y-2">
              {orderNotPayable ? (
                <Notice tone="error">
                  The order is {claim.order.status.replace(/_/g, " ")}. This
                  payment cannot activate it - reject the claim and arrange a
                  refund if money was received.
                </Notice>
              ) : null}
              {claim.duplicates.length > 0 ? (
                <Notice tone="error">
                  The customer&apos;s transaction reference is also on{" "}
                  {claim.duplicates.length} other claim
                  {claim.duplicates.length === 1 ? "" : "s"} (
                  {claim.duplicates
                    .map((d) => d.status.toLowerCase())
                    .join(", ")}
                  ). Check the bank statement before approving.
                </Notice>
              ) : null}
              {amountDiffers ? (
                <Notice tone="error">
                  The customer claims{" "}
                  {formatMoney(claim.claimedAmount, claim.currency)} but the
                  invoice is{" "}
                  {formatMoney(claim.order.totalAmount, claim.order.currency)}.
                </Notice>
              ) : null}
            </div>

            <AdminKeyValueGrid
              items={[
                {
                  label: "Payment reference",
                  value: (
                    <span className="font-mono">
                      {claim.order.bankReference}
                    </span>
                  ),
                },
                {
                  label: "Invoice amount",
                  value: formatMoney(
                    claim.order.totalAmount,
                    claim.order.currency,
                  ),
                },
                {
                  label: "Claimed amount",
                  value: formatMoney(claim.claimedAmount, claim.currency),
                },
                {
                  label: "Customer txn reference",
                  value: claim.customerReference,
                },
                {
                  label: "Transfer date",
                  value: claim.transferredAt
                    ? formatDateTime(claim.transferredAt)
                    : null,
                },
                {
                  label: "Submitted",
                  value: formatDateTime(claim.submittedAt),
                },
                {
                  label: "Order status",
                  value: claim.order.status.replace(/_/g, " "),
                },
                {
                  label: "Invoice due",
                  value: formatDateTime(claim.order.expiresAt),
                },
                {
                  label: "Seats / cycle",
                  value: `${claim.order.requestedSeats} / ${claim.order.billingCycle.toLowerCase()}`,
                },
                {
                  label: "Paid into",
                  value: `${claim.receivingAccount.bankName} ${claim.receivingAccount.maskedIban ?? claim.receivingAccount.maskedAccountNumber ?? claim.receivingAccount.maskedRaastId ?? ""}`,
                },
                {
                  label: "Customer email",
                  value: claim.order.customer?.contactEmail,
                },
              ]}
            />

            {claim.customerNote ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-semibold">Customer note: </span>
                {claim.customerNote}
              </p>
            ) : null}
            {claim.decisionReason ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-semibold">Decision: </span>
                {claim.decisionReason}
              </p>
            ) : null}

            <div>
              <h3 className="text-sm font-semibold text-slate-900">Evidence</h3>
              {claim.evidence.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">
                  No file attached. A receipt is optional and never proof of
                  payment.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {claim.evidence.map((file) => (
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span className="break-all">
                        {file.originalFileName}{" "}
                        <span className="text-slate-500">
                          ({file.mimeType}, {(file.sizeBytes / 1024).toFixed(0)}{" "}
                          KB, {file.scanStatus.toLowerCase()})
                        </span>
                      </span>
                      <a
                        href={`/api/super-admin/bank-transfer-evidence/${claim.id}/${file.id}`}
                        download
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {claim.evidence.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Files are customer-supplied and not malware-scanned. They
                  download only - open them in a sandboxed viewer.
                </p>
              ) : null}
            </div>

            {decidable ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div
                  role="tablist"
                  aria-label="Decision"
                  className="flex flex-wrap gap-2"
                >
                  {(
                    [
                      ["approve", "Approve"],
                      ["clarify", "Ask customer"],
                      ["reject", "Reject"],
                      ["duplicate", "Mark duplicate"],
                    ] as Array<[Decision, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      type="button"
                      aria-selected={decision === key}
                      onClick={() => setDecision(key)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        decision === key
                          ? "bg-slate-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {decision === "approve" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Bank statement reference (from your bank, not the
                      customer)
                      <input
                        value={statementRef}
                        onChange={(event) =>
                          setStatementRef(event.target.value)
                        }
                        maxLength={64}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Amount received ({claim.order.currency})
                      <input
                        value={received}
                        onChange={(event) => setReceived(event.target.value)}
                        inputMode="decimal"
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 md:col-span-2">
                      Note (optional)
                      <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        maxLength={500}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="flex items-start gap-2 text-sm text-slate-700 md:col-span-2">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                        className="mt-1"
                      />
                      I confirm I verified this credit on the receiving bank
                      account statement, independently of the customer&apos;s
                      receipt or claim.
                    </label>
                  </div>
                ) : (
                  <label className="block text-sm font-medium text-slate-700">
                    {decision === "clarify"
                      ? "Question for the customer (emailed to them)"
                      : decision === "reject"
                        ? "Reason (emailed to the customer)"
                        : "Why is this a duplicate?"}
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      maxLength={500}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSubmit || busy}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400 ${
                    decision === "approve" ? "bg-emerald-700" : "bg-rose-700"
                  }`}
                >
                  {busy ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {decision === "approve"
                    ? "Approve and activate"
                    : decision === "clarify"
                      ? "Send question"
                      : decision === "reject"
                        ? "Reject claim"
                        : "Mark duplicate"}
                </button>
              </div>
            ) : null}

            {claim.history.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  History
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {claim.history.map((entry, index) => (
                    <li key={`${entry.action}-${index}`}>
                      {formatDateTime(entry.createdAt)} -{" "}
                      {entry.action.replace(/_/g, " ").toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </dialog>
  );
}
