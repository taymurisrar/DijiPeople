"use client";

import { useEffect, type ReactNode } from "react";

export type ToastTone = "neutral" | "info" | "success" | "warning" | "danger";

export type ToastNoticeItem = {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  icon?: ReactNode;
  durationMs?: number;
};

export function ToastNotice({
  item,
  onClose,
}: {
  item: ToastNoticeItem;
  onClose: (id: string) => void;
}) {
  useEffect(() => {
    if (!item.durationMs) return;
    const timeout = window.setTimeout(() => onClose(item.id), item.durationMs);
    return () => window.clearTimeout(timeout);
  }, [item.durationMs, item.id, onClose]);

  const toneClass =
    item.tone === "success"
      ? "border-emerald-200"
      : item.tone === "warning"
        ? "border-amber-200"
        : item.tone === "danger"
          ? "border-rose-200"
          : item.tone === "info"
            ? "border-sky-200"
            : "border-slate-200";

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-xl ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {item.icon ? <div className="mt-0.5 shrink-0">{item.icon}</div> : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">{item.title}</p>
            {item.description ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
            ) : null}
          </div>
        </div>
        <button
          aria-label="Dismiss notification"
          className="rounded-xl px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          onClick={() => onClose(item.id)}
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  );
}
