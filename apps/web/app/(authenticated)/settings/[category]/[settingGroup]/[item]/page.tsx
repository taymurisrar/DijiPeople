import { notFound } from "next/navigation";
import { SettingsRuntimeList } from "../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../_lib/settings-runtime";

export default async function SettingsItemListPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; settingGroup: string; item: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category, settingGroup, item: itemKey } = await params;
  const item = getSettingsRuntimeItem(category, itemKey);
  if (!item || item.group !== settingGroup) notFound();
  return <SettingsRuntimeList item={item} searchParams={searchParams} />;
}
