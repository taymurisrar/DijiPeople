import { notFound } from "next/navigation";
import { SettingsCategoryLanding } from "../_components/settings-runtime-landing";
import { getSettingsRuntimeCategory } from "../_lib/settings-runtime";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";

export default async function CustomizationCategoryPage() {
  await requireSettingsPermissions(["customization.read"]);
  const category = getSettingsRuntimeCategory("customization");
  if (!category) notFound();
  return <SettingsCategoryLanding category={category} />;
}
