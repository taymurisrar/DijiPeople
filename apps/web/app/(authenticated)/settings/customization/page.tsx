import { notFound } from "next/navigation";
import { SettingsCategoryLanding } from "../_components/settings-runtime-landing";
import { getSettingsRuntimeCategory } from "../_lib/settings-runtime";
import { requireCustomizationPage } from "./_lib/customization-access";
import { CustomizationAccessDenied } from "./_components/customization-access-denied";

export default async function CustomizationCategoryPage() {
  const { allowed } = await requireCustomizationPage("section");
  if (!allowed) return <CustomizationAccessDenied />;

  const category = getSettingsRuntimeCategory("customization");
  if (!category) notFound();
  return <SettingsCategoryLanding category={category} />;
}
