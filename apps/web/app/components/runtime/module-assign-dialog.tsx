"use client";

import { useState } from "react";
import { Dialog } from "@/app/components/ui/dialog";
import type { ModuleOwnerOption } from "@/lib/runtime/module-data-adapter.types";
import { debugRuntime } from "@/lib/runtime/runtime-debug";
import { ModuleOwnerPicker } from "./module-owner-picker";

export function ModuleAssignDialog({
  currentOwnerId = "",
  isLoading = false,
  onCancel,
  onConfirm,
  onOwnerSearch,
  open,
  ownerOptions,
  selectedCount,
}: {
  readonly currentOwnerId?: string;
  readonly isLoading?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (ownerId: string) => void;
  readonly onOwnerSearch?: (query: string) => void;
  readonly open: boolean;
  readonly ownerOptions: readonly ModuleOwnerOption[];
  readonly selectedCount: number;
}) {
  const [ownerId, setOwnerId] = useState(currentOwnerId);
  const [validationError, setValidationError] = useState("");

  const isBulk = selectedCount > 1;

  // Escape did nothing here and `aria-labelledby` named nothing, so the dialog
  // was announced as an unnamed group and could only be left with the mouse.
  // Both come from the shared primitive now. BUG-0043.
  return (
    <Dialog
      busy={isLoading}
      description={
        isBulk
          ? `Assign ${selectedCount} selected records to one owner.`
          : "Assign this record to one owner."
      }
      footer={
        <>
          <button
            className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={() => {
              if (!ownerId) {
                setValidationError("Select an owner before assigning.");
                return;
              }

              onConfirm(ownerId);
            }}
            type="button"
          >
            {isLoading ? "Please wait..." : "Assign"}
          </button>
        </>
      }
      onClose={onCancel}
      open={open}
      title={isBulk ? "Assign selected records" : "Assign record"}
    >
      <ModuleOwnerPicker
        disabled={isLoading}
        onChange={(nextOwnerId) => {
          debugRuntime("Assign dialog owner selected", {
            ownerId: nextOwnerId,
            ownerOptionsCount: ownerOptions.length,
          });
          setOwnerId(nextOwnerId);
          setValidationError("");
        }}
        onSearch={onOwnerSearch}
        options={ownerOptions}
        value={ownerId}
      />
      {validationError ? (
        <p className="mt-2 text-xs font-medium text-danger" role="alert">
          {validationError}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-muted">
        This action updates ownership through the Module data adapter and
        respects module permissions.
      </p>
    </Dialog>
  );
}
