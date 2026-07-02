import { notFound } from "next/navigation";
import { SettingsCategoryLanding } from "../_components/settings-runtime-landing";
import { getSettingsRuntimeCategory } from "../_lib/settings-runtime";

export default function SecurityAccessCategoryPage() {
  const category = getSettingsRuntimeCategory("security-access");
  if (!category) notFound();
  return <SettingsCategoryLanding category={category} />;
}
