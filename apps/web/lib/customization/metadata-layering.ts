export const SYSTEM_COMPONENT_CUSTOMIZATION_MESSAGE =
  "Select or create a custom package before customizing a system component.";

/**
 * Whether a form is product metadata rather than a tenant's own.
 *
 * Shared so the forms list and the form designer agree. They disagreed before:
 * the list also treated a `main` form whose key contains "system" as system,
 * while the designer looked only at the flag — so such a form would have been
 * written to without creating a customization layer.
 */
export function isSystemFormComponent(form: {
  isSystem?: boolean;
  type?: string;
  formKey?: string;
}): boolean {
  return Boolean(
    form.isSystem ||
      (form.type === "main" && form.formKey?.includes("system")),
  );
}

export type CustomizationPackageSelection = {
  readonly packageId?: string | null;
  readonly isDefault?: boolean;
  readonly isReadOnly?: boolean;
} | null;

export function canCustomizeSystemComponentInPackage(
  selectedPackage: CustomizationPackageSelection,
) {
  return Boolean(
    selectedPackage?.packageId &&
    !selectedPackage.isDefault &&
    !selectedPackage.isReadOnly,
  );
}

export function systemComponentCustomizationDisabledReason(
  isSystem: boolean | undefined,
  selectedPackage: CustomizationPackageSelection,
) {
  if (!isSystem) return null;
  return canCustomizeSystemComponentInPackage(selectedPackage)
    ? null
    : SYSTEM_COMPONENT_CUSTOMIZATION_MESSAGE;
}
