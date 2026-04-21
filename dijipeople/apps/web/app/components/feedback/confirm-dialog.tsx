"use client";

import * as React from "react";

type ConfirmDialogAction = {
  label: string;
  onClick: () => void | Promise<void>;
  variant?: "primary" | "secondary" | "danger";
};

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  confirmAction: ConfirmDialogAction;
  cancelAction?: {
    label?: string;
  };
  isLoading?: boolean;
};

function getActionClassName(variant: ConfirmDialogAction["variant"]) {
  switch (variant) {
    case "danger":
      return "bg-red-600 text-white hover:bg-red-700";
    case "primary":
      return "bg-accent text-white hover:bg-accent-strong";
    case "secondary":
    default:
      return "border border-border bg-white text-foreground hover:bg-surface";
  }
}

export function ConfirmDialog({
  open,
  title,
  description,
  onClose,
  confirmAction,
  cancelAction,
  isLoading = false,
}: ConfirmDialogProps) {
  React.useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isLoading) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose, isLoading]);

  if (!open) {
    return null;
  }

  async function handleConfirm() {
    await confirmAction.onClick();
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-white p-6 shadow-2xl">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="text-sm leading-6 text-muted">{description}</p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={onClose}
            type="button"
          >
            {cancelAction?.label ?? "Cancel"}
          </button>

          <button
            className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${getActionClassName(
              confirmAction.variant ?? "primary",
            )}`}
            disabled={isLoading}
            onClick={handleConfirm}
            type="button"
          >
            {isLoading ? "Please wait..." : confirmAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}