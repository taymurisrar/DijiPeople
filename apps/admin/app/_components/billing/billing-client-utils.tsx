import type { ReactNode } from "react";

/** Status chip. Text always carries the meaning; colour only reinforces it. */
export function StatusChip({ value }: { value: string }) {
  const tone =
    value === "APPROVED" ||
    value === "SUCCEEDED" ||
    value === "PAID" ||
    value === "READY"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "REJECTED" ||
          value === "EXPIRED" ||
          value === "DUPLICATE" ||
          value === "SUSPENDED" ||
          value === "NOT_READY"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : value === "CANCELLED" || value === "DISABLED"
          ? "border-slate-200 bg-slate-100 text-slate-600"
          : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export async function requestJson<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;
  if (!response.ok) {
    const text =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "Request failed.";
    throw new Error(text);
  }
  return payload as T;
}

export function postJson<T = unknown>(path: string, body?: unknown) {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function formatMoney(value: string | number, currency: string) {
  const amount = typeof value === "number" ? value : Number(value);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      amount,
    );
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function Notice({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {children}
    </div>
  );
}
