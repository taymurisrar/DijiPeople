import { notFound } from "next/navigation";
import { SettingsRuntimeRecord } from "../../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../../_lib/settings-runtime";

export default async function NewSettingsItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; settingGroup: string; item: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category, settingGroup, item: itemKey } = await params;
  const item = getSettingsRuntimeItem(category, itemKey);
  if (!item || item.group !== settingGroup) notFound();
  return (
    <SettingsRuntimeRecord
      item={item}
      mode="create"
      searchParams={searchParams}
    />
  );
}
