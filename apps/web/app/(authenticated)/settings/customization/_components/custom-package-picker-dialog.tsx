"use client";

import { Button } from "@/app/components/ui/button";
import { SelectField } from "@/app/components/ui/form-control";
import type { CustomizationPackage } from "../types";

export function CustomPackagePickerDialog({
  message,
  onClose,
  onConfirm,
  open,
  packages,
  selectedPackageId,
  setSelectedPackageId,
}: {
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  packages: CustomizationPackage[];
  selectedPackageId: string;
  setSelectedPackageId: (packageId: string) => void;
}) {
  if (!open) return null;

  const customPackages = packages.filter(
    (item) =>
      !item.isDefault &&
      !item.isReadOnly &&
      item.type === "custom" &&
      item.packageKey !== "unassigned-draft-customizations",
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="grid w-full max-w-lg gap-4 rounded-[24px] border border-border bg-white p-6 shadow-xl">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Select Custom Package
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted">{message}</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Leave package blank to use Unassigned Draft Customizations.
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
          <Button
            onClick={onConfirm}
            type="button"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
