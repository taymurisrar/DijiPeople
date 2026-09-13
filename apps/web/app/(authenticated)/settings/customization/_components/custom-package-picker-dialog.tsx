"use client";

import { Button } from "@/app/components/ui/button";
import { SelectField } from "@/app/components/ui/form-control";
import type { CustomizationPackage } from "../types";
import { useDialogBehavior } from "@/app/components/ui/dialog";

export function CustomPackagePickerDialog({
  confirmLabel = "Continue",
  message,
  onClose,
  onConfirm,
  open,
  packages,
  selectedPackageId,
  setSelectedPackageId,
}: {
  /*
   * The confirm button says what it is about to do. This dialog always writes
   * a customization layer, and "Continue" alone read like a navigation step —
   * which is how people ended up with draft layers they never meant to create.
   */
  confirmLabel?: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  packages: CustomizationPackage[];
  selectedPackageId: string;
  setSelectedPackageId: (packageId: string) => void;
}) {
  // BUG-0043: kept its own layout, gained the guarantees it never had -
  // focus containment, Escape, focus restore and dialog semantics.
  const dialog = useDialogBehavior({ open, onClose });

  if (!open) return null;

  const customPackages = packages.filter(
    (item) =>
      !item.isDefault &&
      !item.isReadOnly &&
      item.type === "custom" &&
      item.packageKey !== "unassigned-draft-customizations",
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
      {...dialog.backdropProps}
    >
      <div
        {...dialog.panelProps}
        className="grid w-full max-w-lg gap-4 rounded-[24px] border border-border bg-white p-6 shadow-xl"
      >
        <div>
          <h3
            className="text-lg font-semibold text-foreground"
            id={dialog.titleId}
          >
            Select Custom Package
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted">{message}</p>
        </div>

        {/*
          ITEM-0183 / BUG-3493 — the explanatory paragraphs about "Unassigned
          Draft Customizations" are gone along with that default: a blank choice
          now lands in the tenant's own Custom Package, which is publishable.
        */}
        {customPackages.length > 0 ? (
          <SelectField
            label="Custom Package"
            onChange={setSelectedPackageId}
            options={customPackages.map((item) => ({
              label: item.displayName,
              value: item.id,
            }))}
            placeholder="Default custom package"
            value={selectedPackageId}
          />
        ) : null}

        <div className="flex justify-end gap-3">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
