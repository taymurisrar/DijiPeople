import * as React from "react";
import type { ReactNode } from "react";
import type { NoticeTone } from "./notice-types";

export type ToastNoticeItem = {
  id: string;
  title: string;
  description?: string;
  tone?: NoticeTone;
  icon?: ReactNode;
  borderColorClassName?: string;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastNoticeProps = {
  item: ToastNoticeItem;
  onClose: (id: string) => void;
};

function getToneClasses(tone: NoticeTone) {
  switch (tone) {
    case "info":
      return {
        container: "border-sky-200 bg-white",
        iconWrap: "bg-sky-100 text-sky-700",
      };
    case "success":
      return {
        container: "border-emerald-200 bg-white",
        iconWrap: "bg-emerald-100 text-emerald-700",
      };
    case "warning":
      return {
        container: "border-amber-200 bg-white",
        iconWrap: "bg-amber-100 text-amber-700",
      };
    case "danger":
      return {
        container: "border-red-200 bg-white",
        iconWrap: "bg-red-100 text-red-700",
      };
    case "neutral":
    default:
      return {
        container: "border-border bg-white",
        iconWrap: "bg-surface text-foreground",
      };
  }
}

export function ToastNotice({ item, onClose }: ToastNoticeProps) {
  const toneClasses = getToneClasses(item.tone ?? "neutral");

  React.useEffect(() => {
    if (!item.durationMs || item.durationMs <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onClose(item.id);
    }, item.durationMs);

    return () => window.clearTimeout(timeout);
  }, [item.durationMs, item.id, onClose]);

  return (
    <div
      className={[
        "w-full rounded-2xl border p-4 shadow-lg backdrop-blur",
        toneClasses.container,
        item.borderColorClassName ? `border-l-4 ${item.borderColorClassName}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      <div className="flex items-start gap-3">
        {item.icon ? (
          <div
            className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              toneClasses.iconWrap,
            ].join(" ")}
          >
            {item.icon}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-foreground">
                {item.title}
              </h4>
              {item.description ? (
                <p className="mt-1 text-sm leading-6 text-muted">
                  {item.description}
                </p>
              ) : null}
            </div>

            <button
              aria-label="Dismiss notification"
              className="rounded-xl px-2 py-1 text-sm text-muted transition hover:bg-surface hover:text-foreground"
              onClick={() => onClose(item.id)}
              type="button"
            >
              ✕
            </button>
          </div>

          {item.actionLabel && item.onAction ? (
            <div className="pt-3">
              <button
                className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
                onClick={() => {
                  item.onAction?.();
                  onClose(item.id);
                }}
                type="button"
              >
                {item.actionLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}