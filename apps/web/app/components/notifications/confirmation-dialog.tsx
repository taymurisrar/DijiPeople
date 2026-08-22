"use client";

import { Dialog } from "@/app/components/ui/dialog";

type ConfirmationVariant = "default" | "danger" | "warning" | "success";

export type ConfirmationDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description?: string;
  isLoading?: boolean;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  variant?: ConfirmationVariant;
};

const confirmButtonStyles: Record<ConfirmationVariant, string> = {
  default: "bg-accent text-white hover:bg-accent-strong",
  danger: "bg-red-600 text-white hover:bg-red-700",
  warning: "bg-amber-500 text-white hover:bg-amber-600",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};

export function ConfirmationDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  description,
  isLoading = false,
  isOpen,
  onCancel,
  onConfirm,
  title,
  variant = "default",
}: ConfirmationDialogProps) {
  // Escape was handled here; focus containment and an accessible name were not,
  // so Tab left the dialog and it announced as an unnamed group. BUG-0043.
  return (
    <Dialog
      busy={isLoading}
      description={description}
      footer={
        <>
          <button
            className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmButtonStyles[variant]}`}
            disabled={isLoading}
            onClick={onConfirm}
            type="button"
          >
            {isLoading ? "Please wait..." : confirmLabel}
          </button>
        </>
      }
      onClose={onCancel}
      open={isOpen}
      title={title}
    />
  );
}
