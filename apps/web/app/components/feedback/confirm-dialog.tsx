"use client";

import * as React from "react";
import { Dialog } from "@/app/components/ui/dialog";

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

/**
 * This handled Escape but declared neither `role="dialog"` nor `aria-modal`, so
 * it was not announced as a dialog, and Tab walked out of it into the page
 * behind. Both now come from the shared primitive. BUG-0043.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  onClose,
  confirmAction,
  cancelAction,
  isLoading = false,
}: ConfirmDialogProps) {
  async function handleConfirm() {
    await confirmAction.onClick();
  }

  return (
    <Dialog
      busy={isLoading}
      description={description}
      footer={
        <>
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
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
    />
  );
}
