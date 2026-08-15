"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type NotificationTone = "info" | "success" | "warning" | "error";

const toneStyles: Record<NotificationTone, string> = {
  info: "border-slate-200 bg-white text-slate-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

const toneIcons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

export function AppNotification({
  action,
  children,
  compact = false,
  dismissible = false,
  onDismiss,
  title,
  tone = "info",
}: {
  action?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  title?: ReactNode;
  tone?: NotificationTone;
}) {
  const Icon = toneIcons[tone];

  return (
    <div
      className={[
        "flex items-start gap-3 rounded-2xl border shadow-sm",
        compact ? "px-3 py-2 text-sm" : "px-4 py-3 text-sm",
        toneStyles[tone],
      ].join(" ")}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={title ? "mt-1 leading-5" : "leading-5"}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
      {dismissible ? (
        <button
          aria-label="Dismiss notification"
          className="shrink-0 rounded-lg p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-950/15"
          onClick={onDismiss}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function StickyNotification({
  storageKey,
  ...props
}: Parameters<typeof AppNotification>[0] & {
  storageKey?: string;
}) {
  const [dismissed, setDismissed] = useState(() => {
    if (!storageKey || typeof window === "undefined") return false;
    return window.sessionStorage.getItem(storageKey) === "1";
  });

  if (dismissed) return null;

  return (
    <div className="sticky top-3 z-20">
      <AppNotification
        {...props}
        dismissible
        onDismiss={() => {
          if (storageKey && typeof window !== "undefined") {
            window.sessionStorage.setItem(storageKey, "1");
          }
          setDismissed(true);
        }}
      />
    </div>
  );
}

export function NotificationStack({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}
