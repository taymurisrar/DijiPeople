"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, RefreshCcw, RotateCcw } from "lucide-react";
import { AdminKeyValueGrid } from "@/app/_components/admin-ui";
import { DataTable } from "@/app/_components/crm/data-table";

type WebhookStatus = "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED" | "";

type WebhookEventRecord = {
  id: string;
  stripeEventId: string;
  type: string;
  processingStatus: WebhookStatus;
  createdAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  attempts?: number | null;
  payload?: unknown;
  metadata?: unknown;
  relatedTenantId?: string | null;
  relatedCustomerId?: string | null;
  relatedSubscriptionId?: string | null;
  relatedPaymentId?: string | null;
  relatedInvoiceId?: string | null;
};

type WebhookEventsResponse = {
  items: WebhookEventRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type WebhookEventsClientProps = {
  initialData: WebhookEventsResponse;
};

export function WebhookEventsClient({ initialData }: WebhookEventsClientProps) {
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState<WebhookStatus>("");
  const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const eventTypes = useMemo(
    () => [...new Set(data.items.map((item) => item.type))].sort(),
    [data.items],
  );

  function loadPage(page = 1) {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(data.meta.pageSize),
        });
        if (status) params.set("status", status);
        if (type.trim()) params.set("type", type.trim());

        const next = await requestJson<WebhookEventsResponse>(
          `/api/super-admin/billing/stripe-webhook-events?${params.toString()}`,
          { method: "GET" },
        );
        setData(next);
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to load webhooks."));
      }
    });
  }

  function retryEvent(eventId: string) {
    setError(null);
    setActionId(eventId);
    startTransition(async () => {
      try {
        await requestJson(
          `/api/super-admin/billing/stripe-webhook-events/${eventId}/retry`,
          { method: "POST" },
        );
        loadPage(data.meta.page);
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Unable to retry webhook."));
      } finally {
        setActionId(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[180px_minmax(220px,1fr)_auto] md:items-end">
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as WebhookStatus)
              }
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
            >
              <option value="">All statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="PROCESSED">Processed</option>
              <option value="FAILED">Failed</option>
              <option value="IGNORED">Ignored</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Event type
            <input
              list="stripe-event-types"
              value={type}
              onChange={(event) => setType(event.target.value)}
              placeholder="invoice.paid"
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
            />
            <datalist id="stripe-event-types">
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            onClick={() => loadPage(1)}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Apply
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <DataTable
          compact
          rows={data.items}
          rowKey={(event) => event.id}
          stickyHeader
          getRowClassName={(event) =>
            event.processingStatus === "FAILED" ? "bg-rose-50/40" : undefined
          }
          columns={[
            {
              key: "event",
              header: "Event",
              minWidth: 220,
              render: (event) => (
                <span className="font-mono text-xs text-slate-900">
                  {event.type}
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              minWidth: 130,
              render: (event) => <StatusChip value={event.processingStatus} />,
            },
            {
              key: "stripeId",
              header: "Stripe ID",
              minWidth: 240,
              render: (event) => (
                <span className="font-mono text-xs text-slate-600">
                  {event.stripeEventId}
                </span>
              ),
            },
            {
              key: "created",
              header: "Created",
              minWidth: 170,
              render: (event) => formatDateTime(event.createdAt),
            },
            {
              key: "processed",
              header: "Processed",
              minWidth: 170,
              render: (event) => formatDateTime(event.processedAt),
            },
            {
              key: "error",
              header: "Error",
              minWidth: 260,
              render: (event) => (
                <span className="line-clamp-2 text-slate-600">
                  {event.errorMessage ?? "-"}
                </span>
              ),
            },
            {
              key: "action",
              header: "Action",
              minWidth: 120,
              render: (event) =>
                event.processingStatus === "FAILED" ? (
                  <button
                    type="button"
                    onClick={() => retryEvent(event.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionId === event.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Retry
                  </button>
                ) : (
                  <span className="text-slate-400">-</span>
                ),
            },
          ]}
          emptyTitle="No webhook events"
          emptyDescription="No Stripe webhook events match the current filters."
          renderExpandedRow={(event) => (
            <div className="space-y-3">
              <AdminKeyValueGrid
                items={[
                  { label: "Event type", value: event.type },
                  { label: "Provider event id", value: event.stripeEventId },
                  { label: "Processing status", value: event.processingStatus },
                  { label: "Attempts", value: event.attempts ?? "Not recorded" },
                  { label: "Created", value: formatDateTime(event.createdAt) },
                  { label: "Processed", value: formatDateTime(event.processedAt) },
                  { label: "Tenant", value: event.relatedTenantId },
                  { label: "Customer", value: event.relatedCustomerId },
                  { label: "Subscription", value: event.relatedSubscriptionId },
                  { label: "Payment", value: event.relatedPaymentId },
                  { label: "Invoice", value: event.relatedInvoiceId },
                ]}
              />
              {event.errorMessage ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {event.errorMessage}
                </div>
              ) : null}
              {event.payload || event.metadata ? (
                <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    Payload / metadata
                  </summary>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {JSON.stringify(event.payload ?? event.metadata, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          )}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Page {data.meta.page} of {data.meta.totalPages} | {data.meta.total}{" "}
          events
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => loadPage(Math.max(1, data.meta.page - 1))}
            disabled={isPending || data.meta.page <= 1}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() =>
              loadPage(Math.min(data.meta.totalPages, data.meta.page + 1))
            }
            disabled={isPending || data.meta.page >= data.meta.totalPages}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ value }: { value: WebhookStatus }) {
  const tone =
    value === "PROCESSED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "FAILED"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : value === "IGNORED"
          ? "border-slate-200 bg-slate-100 text-slate-600"
          : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {value}
    </span>
  );
}

async function requestJson<T = unknown>(path: string, init: RequestInit) {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(getPayloadMessage(payload) ?? "Request failed.");
  }

  return payload as T;
}

function getPayloadMessage(value: unknown) {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
