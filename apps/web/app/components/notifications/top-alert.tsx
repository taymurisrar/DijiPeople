"use client";

import { useEffect } from "react";

type TopAlertVariant = "success" | "error" | "warning" | "info";

export type TopAlertProps = {
  autoCloseMs?: number;
  description?: string;
  onDismiss?: () => void;
  title: string;
  variant?: TopAlertVariant;
};

const variantStyles: Record<
  TopAlertVariant,
  { container: string; title: string; role: "status" | "alert" }
> = {
  success: {
    container: "border-emerald-200 bg-emerald-50",
    title: "text-emerald-900",
    role: "status",
  },
  error: {
    container: "border-red-200 bg-red-50",
    title: "text-red-900",
    role: "alert",
  },
  warning: {
    container: "border-amber-200 bg-amber-50",
    title: "text-amber-900",
    role: "alert",
  },
  info: {
    container: "border-sky-200 bg-sky-50",
    title: "text-sky-900",
    role: "status",
  },
};

export function TopAlert({
  autoCloseMs,
  description,
  onDismiss,
  title,
  variant = "info",
}: TopAlertProps) {
  const styles = variantStyles[variant];

  useEffect(() => {
    if (!autoCloseMs || autoCloseMs <= 0 || !onDismiss) {
      return;
    }

    const timer = window.setTimeout(onDismiss, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, onDismiss]);

  return (
    <div
      className={`sticky top-4 z-30 rounded-2xl border px-4 py-3 shadow-sm ${styles.container}`}
      role={styles.role}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${styles.title}`}>{title}</p>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {onDismiss ? (
          <button
            aria-label="Dismiss alert"
            className="rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-white/60 hover:text-foreground"
            onClick={onDismiss}
            type="button"
          >
            x
          </button>
        ) : null}
      </div>
    </div>
  );
}

