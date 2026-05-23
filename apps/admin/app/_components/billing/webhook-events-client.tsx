"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, RefreshCcw, RotateCcw } from "lucide-react";

type WebhookStatus = "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED" | "";

type WebhookEventRecord = {
  id: string;
  stripeEventId: string;
  type: string;
  processingStatus: WebhookStatus;
  createdAt: string;
  processedAt: string | null;
  errorMessage: string | null;
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

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[180px_minmax(220px,1fr)_auto] md:items-end">
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as WebhookStatus)
              }
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
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
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none"
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
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
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

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Event</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Stripe ID</th>
                <th className="px-5 py-3 font-semibold">Created</th>
                <th className="px-5 py-3 font-semibold">Processed</th>
                <th className="px-5 py-3 font-semibold">Error</th>
                <th className="px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((event) => (
                <tr key={event.id}>
                  <td className="px-5 py-4 font-mono text-xs text-slate-900">
                    {event.type}
                  </td>
                  <td className="px-5 py-4">
                    <StatusChip value={event.processingStatus} />
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">
                    {event.stripeEventId}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {formatDateTime(event.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {formatDateTime(event.processedAt)}
                  </td>
                  <td className="max-w-[280px] px-5 py-4 text-slate-600">
                    <span className="line-clamp-2">
                      {event.errorMessage ?? "-"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {event.processingStatus === "FAILED" ? (
                      <button
                        type="button"
                        onClick={() => retryEvent(event.id)}
                        disabled={isPending}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                    )}
                  </td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td
                    className="px-5 py-10 text-center text-slate-500"
                    colSpan={7}
                  >
                    No Stripe webhook events match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
