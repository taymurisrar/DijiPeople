import { notFound } from "next/navigation";
import { SettingsCategoryLanding } from "../_components/settings-runtime-landing";
import { getSettingsRuntimeCategory } from "../_lib/settings-runtime";

export default function NotificationsSettingsCategoryPage() {
  const category = getSettingsRuntimeCategory("notifications");
  if (!category) notFound();
  return <SettingsCategoryLanding category={category} />;
}
