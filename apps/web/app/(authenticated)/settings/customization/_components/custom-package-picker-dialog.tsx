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
          <p className="mt-2 text-sm leading-6 text-muted">
            Leave package blank to use Unassigned Draft Customizations. This
            creates a draft customization layer that stays unpublished until you
            publish it.
          </p>
        </div>

        {customPackages.length > 0 ? (
          <SelectField
            label="Custom Package"
            onChange={setSelectedPackageId}
            options={customPackages.map((item) => ({
              label: item.displayName,
              value: item.id,
            }))}
            placeholder="Use Unassigned Draft Customizations"
            value={selectedPackageId}
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No exportable Custom Packages exist yet. Continuing will save this
            change under Unassigned Draft Customizations.
          </div>
        )}

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
