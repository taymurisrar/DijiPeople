export const SYSTEM_COMPONENT_CUSTOMIZATION_MESSAGE =
  "Select or create a custom package before customizing a system component.";

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
