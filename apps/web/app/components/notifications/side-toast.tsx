"use client";

import { useEffect } from "react";

type SideToastVariant = "success" | "error" | "warning" | "info";
type SideToastPlacement =
  | "top-center"
  | "bottom-center"
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
  success: "border-emerald-300 bg-emerald-50 text-emerald-950",
  error: "border-red-300 bg-red-50 text-red-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  info: "border-sky-300 bg-sky-50 text-sky-950",
};

const placementStyles: Record<SideToastPlacement, string> = {
  "top-center": "top-6 left-1/2 -translate-x-1/2",
  "bottom-center": "bottom-6 left-1/2 -translate-x-1/2",
  "top-right": "top-6 right-6",
  "bottom-right": "bottom-6 right-6",
  "top-left": "top-6 left-6",
  "bottom-left": "bottom-6 left-6",
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
    <div
      className={`fixed z-[120] w-[calc(100%-2rem)] max-w-[320px] ${placementStyles[placement]}`}
    >
      <div
        className={`rounded-xl border px-4 py-3 shadow-xl shadow-black/10 backdrop-blur ${variantStyles[variant]}`}
        role="status"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            {description ? (
              <p className="mt-1 text-sm opacity-75">{description}</p>
            ) : null}
          </div>
          <button
            aria-label="Dismiss toast"
            className="shrink-0 rounded-lg px-2 py-1 text-sm opacity-60 transition hover:bg-white/70 hover:opacity-100"
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

