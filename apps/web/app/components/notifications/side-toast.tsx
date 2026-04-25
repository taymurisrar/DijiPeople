"use client";

import { useEffect } from "react";

type SideToastVariant = "success" | "error" | "warning" | "info";
type SideToastPlacement =
  | "top-right"
  | "bottom-right"
  | "top-left"
  | "bottom-left";

export type SideToastProps = {
  actionLabel?: string;
  autoCloseMs?: number;
  description?: string;
  isOpen: boolean;
  onAction?: () => void;
  onClose: () => void;
  placement?: SideToastPlacement;
  title: string;
  variant?: SideToastVariant;
};

const variantStyles: Record<SideToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50",
  error: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-sky-200 bg-sky-50",
};

const placementStyles: Record<SideToastPlacement, string> = {
  "top-right": "top-4 right-4",
  "bottom-right": "bottom-4 right-4",
  "top-left": "top-4 left-4",
  "bottom-left": "bottom-4 left-4",
};

export function SideToast({
  actionLabel,
  autoCloseMs = 4000,
  description,
  isOpen,
  onAction,
  onClose,
  placement = "top-right",
  title,
  variant = "info",
}: SideToastProps) {
  useEffect(() => {
    if (!isOpen || !autoCloseMs || autoCloseMs <= 0) {
      return;
    }

    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={`fixed z-40 w-full max-w-sm ${placementStyles[placement]}`}>
      <div className={`rounded-2xl border p-4 shadow-lg ${variantStyles[variant]}`} role="status">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            aria-label="Dismiss toast"
            className="rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-white/70 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        {actionLabel && onAction ? (
          <div className="mt-3">
            <button
              className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
              onClick={onAction}
              type="button"
            >
              {actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

