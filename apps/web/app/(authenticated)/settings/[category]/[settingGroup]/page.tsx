import { notFound, redirect } from "next/navigation";
import { SettingsGroupLanding } from "../../_components/settings-runtime-landing";
import { SettingsRuntimeList } from "../../_components/settings-runtime-pages";
import {
  getSettingsRuntimeCategory,
  getSettingsRuntimeGroup,
  getSettingsRuntimeItem,
} from "../../_lib/settings-runtime";

export default async function SettingsGroupOrItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; settingGroup: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category: categoryKey, settingGroup } = await params;
  const item = getSettingsRuntimeItem(categoryKey, settingGroup);

  if (item) {
    /*
     * An item whose key matches its group resolves to this very path, so
     * redirecting to it would send the browser here again forever. Those items
     * are rendered in place instead; everything else still redirects to its own
     * deeper route.
     */
    const currentPath = `/settings/${categoryKey}/${settingGroup}`;
    if (item.route === currentPath) {
      return <SettingsRuntimeList item={item} searchParams={searchParams} />;
    }

    redirect(item.route);
  }

  const category = getSettingsRuntimeCategory(categoryKey);
  const group = getSettingsRuntimeGroup(categoryKey, settingGroup);
  if (!category || !group) notFound();
  return <SettingsGroupLanding category={category} group={group} />;
}
