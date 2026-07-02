import { notFound, redirect } from "next/navigation";
import { SettingsGroupLanding } from "../../_components/settings-runtime-landing";
import {
  getSettingsRuntimeCategory,
  getSettingsRuntimeGroup,
  getSettingsRuntimeItem,
} from "../../_lib/settings-runtime";

export default async function SettingsGroupOrItemPage({
  params,
}: {
  params: Promise<{ category: string; settingGroup: string }>;
}) {
  const { category: categoryKey, settingGroup } = await params;
  const item = getSettingsRuntimeItem(categoryKey, settingGroup);
  if (item) redirect(item.route);
  const category = getSettingsRuntimeCategory(categoryKey);
  const group = getSettingsRuntimeGroup(categoryKey, settingGroup);
  if (!category || !group) notFound();
  return <SettingsGroupLanding category={category} group={group} />;
}
