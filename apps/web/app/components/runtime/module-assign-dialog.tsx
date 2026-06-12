"use client";

import { useState } from "react";
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

  if (!open) return null;

  const isBulk = selectedCount > 1;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-[28px] border border-border bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-foreground">
          {isBulk ? "Assign selected records" : "Assign record"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          {isBulk
            ? `Assign ${selectedCount} selected records to one owner.`
            : "Assign this record to one owner."}
        </p>
        <div className="mt-4">
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
        </div>
        {validationError ? (
          <p className="mt-2 text-xs font-medium text-danger">
            {validationError}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-muted">
          This action updates ownership through the Module data adapter and
          respects module permissions.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
        </div>
      </div>
    </div>
  );
}
